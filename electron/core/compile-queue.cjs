/**
 * 知识编译任务队列（P3）：模型照抄 llm_wiki ingest-queue.ts，宿主 Electron 主进程。
 * - 持久化 .ocean/knowledge-compile-queue.json（只存未完成任务；写请求串行化防旧快照覆盖新状态）
 * - 串行 worker（workerLimit=1，与 llm_wiki 默认一致）
 * - MAX_RETRIES=3；usage-limit 错误（429/rate limit/quota）→ 队列级暂停 + 15 分钟自动恢复
 * - AbortController 取消 + cancelledInFlightTaskIds（取消后旧输出不落盘）
 * - epoch 防串台（restore/clear 时 bump，孤儿 runner 自行退出不写脏）
 * - 恢复的 pending 任务不自动跑（避免应用启动即扣费——llm_wiki 语义）
 * - 同源 upsert：pending/failed/cancelled 的同源任务复用 id 并重置 retryCount
 * done 任务从队列移除（幂等由编译缓存承担），结果经事件推送给前端留存。
 */

const { compileSource } = require('./knowledge-compile.cjs')

const QUEUE_STATE_FILE = 'knowledge-compile-queue.json'
const MAX_RETRIES = 3
const USAGE_LIMIT_AUTO_RESUME_MS = 15 * 60 * 1000
const WORKER_LIMIT = 1

const isUsageLimitError = (message) =>
  /\b429\b|rate[_\s-]*limit|usage\s+limit|quota|too many requests|insufficient_quota/i.test(String(message || ''))

function generateId() {
  return `compile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 创建队列实例。
 * deps = { services（编译服务注入，同 compileSource）, emit(type, payload) }
 * 返回 { enqueue, retry, cancel, pause, resume, list, summary, restore, setLLM, clearCompleted, dispose }
 */
function createCompileQueue(deps) {
  const { services, emit } = deps
  let queue = []
  let llm = null // 当前 LLM 配置（内存持有，不入持久化——apiKey 不落盘）
  let paused = false
  let scheduling = false
  let epoch = 0
  let disposed = false
  const activeRuns = new Map() // taskId → { controller, epoch }
  const cancelledInFlight = new Set()
  const restoredPausedIds = new Set()
  let usageLimitTimer = null
  let writeEpoch = 0
  const pendingWrites = []
  let writeRunning = false

  const notify = (type, payload) => {
    try { emit && emit(type, payload) } catch { /* 事件回调失败不影响队列 */ }
  }
  const emitTask = (task) => notify('task-updated', { task: { ...task } })

  // ── 持久化（写请求串行化：旧快照永不晚于新状态落盘） ──
  // 已完成任务的历史保留上限：超过则从最老开始裁剪（进行中/失败/排队的不裁）
  const MAX_DONE_RETAINED = 300

  function trimDone() {
    const doneIdx = queue.map((t, i) => ({ i, t })).filter((x) => x.t.status === 'done')
    if (doneIdx.length <= MAX_DONE_RETAINED) return
    const excess = doneIdx.length - MAX_DONE_RETAINED
    const removeIds = new Set(doneIdx.slice(0, excess).map((x) => x.t.id))
    queue = queue.filter((t) => !removeIds.has(t.id))
  }

  function saveQueue() {
    trimDone()
    const snapshot = JSON.stringify(queue, null, 2)
    return new Promise((resolve) => {
      pendingWrites.push({ resolve, snapshot })
      drainWrites()
    })
  }
  function drainWrites() {
    if (writeRunning) return
    const req = pendingWrites.shift()
    if (!req) return
    const currentWriteEpoch = writeEpoch
    writeRunning = true
    Promise.resolve()
      .then(() => services.writeState(QUEUE_STATE_FILE, req.snapshot))
      .catch(() => { /* 持久化 best-effort，内存队列仍是权威 */ })
      .finally(() => {
        req.resolve()
        if (currentWriteEpoch === writeEpoch) {
          writeRunning = false
          drainWrites()
        }
      })
  }

  function restore() {
    try {
      const raw = services.readState(QUEUE_STATE_FILE)
      if (!raw) return
      const tasks = JSON.parse(raw)
      if (!Array.isArray(tasks)) return
      epoch += 1
      queue = tasks.filter((t) => t && t.id && t.sourceName)
      for (const t of queue) {
        if (t.status === 'processing') t.status = 'pending' // 崩溃残留的 processing 复位
        if (t.status === 'pending') restoredPausedIds.add(t.id) // 恢复的不自动跑
      }
      notify('restored', { count: queue.length })
    } catch { /* 损坏的队列文件按空处理 */ }
  }

  const findTask = (id) => queue.find((t) => t.id === id)

  // ── 调度 ──
  function processNext() {
    if (scheduling || paused || disposed) return
    const runEpoch = epoch
    scheduling = true
    Promise.resolve().then(async () => {
      try {
        while (activeRuns.size < WORKER_LIMIT && !paused && !disposed) {
          const next = queue.find(
            (t) => t.status === 'pending' && !activeRuns.has(t.id) && !restoredPausedIds.has(t.id),
          )
          if (!next) break
          startTask(next, runEpoch)
        }
      } finally {
        scheduling = false
        const hasRunnable = queue.some(
          (t) => t.status === 'pending' && !activeRuns.has(t.id) && !restoredPausedIds.has(t.id),
        )
        if (hasRunnable && !paused && !disposed) {
          queueMicrotask(() => processNext())
        }
      }
    })
  }

  function startTask(task, runEpoch) {
    const controller = new AbortController()
    activeRuns.set(task.id, { controller, epoch: runEpoch })
    task.status = 'processing'
    task.error = null
    restoredPausedIds.delete(task.id)
    emitTask(task)
    saveQueue()
    runTask(task, controller, runEpoch)
  }

  async function runTask(task, controller, runEpoch) {
    try {
      const result = await compileSource({
        sourceName: task.sourceName,
        services,
        llm,
        signal: controller.signal,
        onProgress: (phase, detail) => {
          if (epoch !== runEpoch || disposed) return
          task.phase = phase
          task.detail = detail
          notify('progress', { taskId: task.id, phase, detail })
        },
      })
      if (epoch !== runEpoch || disposed) return
      if (cancelledInFlight.delete(task.id) || task.status === 'cancelled') {
        await saveQueue()
        return
      }
      task.status = 'done'
      task.cards = result.cards || []
      task.finishedAt = Date.now()
      task.detail = result.skipped ? '缓存命中，跳过' : `完成：${(result.cards || []).length} 张卡`
      task.phase = 'done'
      // done 保留在队列（参考工作流实例页：全部任务持久化可见）；幂等仍由编译缓存承担
      emitTask(task)
      await saveQueue()
      notify('drained', isEmpty())
    } catch (err) {
      if (epoch !== runEpoch || disposed) return
      if (cancelledInFlight.delete(task.id) || task.status === 'cancelled') {
        await saveQueue()
        return
      }
      const message = err instanceof Error ? err.message : String(err)

      if (isUsageLimitError(message)) {
        paused = true
        task.status = 'pending'
        task.error = `触发用量限制已暂停: ${message}`
        for (const [taskId, run] of activeRuns) {
          if (taskId === task.id) continue
          const sibling = findTask(taskId)
          if (sibling && sibling.status === 'processing') {
            sibling.status = 'pending'
            sibling.error = `触发用量限制已暂停: ${message}`
            run.controller.abort()
            emitTask(sibling)
          }
        }
        notify('queue-paused', { reason: message, autoResumeMs: USAGE_LIMIT_AUTO_RESUME_MS })
        scheduleUsageLimitAutoResume()
        emitTask(task)
        await saveQueue()
        return
      }

      task.retryCount = (task.retryCount || 0) + 1
      task.error = message
      if (task.retryCount >= MAX_RETRIES) {
        task.status = 'failed'
      } else {
        task.status = 'pending'
      }
      emitTask(task)
      await saveQueue()
    } finally {
      activeRuns.delete(task.id)
      if (epoch === runEpoch && !disposed && !paused) processNext()
    }
  }

  function scheduleUsageLimitAutoResume() {
    if (usageLimitTimer) return
    usageLimitTimer = setTimeout(() => {
      usageLimitTimer = null
      paused = false
      notify('queue-resumed', { reason: '用量限制暂停 15 分钟后自动恢复' })
      processNext()
    }, USAGE_LIMIT_AUTO_RESUME_MS)
    if (usageLimitTimer.unref) usageLimitTimer.unref()
  }

  const isEmpty = () =>
    queue.length === 0 && activeRuns.size === 0

  // ── 对外操作 ──

  function enqueue(sourceNames) {
    const added = []
    for (const sourceName of sourceNames) {
      if (!sourceName) continue
      const existing = queue.find(
        (t) => t.sourceName === sourceName && ['pending', 'failed', 'cancelled'].includes(t.status),
      )
      if (existing) {
        // 同源 upsert：复用 id，重置错误与重试计数（llm_wiki 语义，不重复排队）
        existing.status = 'pending'
        existing.error = null
        existing.retryCount = 0
        existing.phase = 'queued'
        restoredPausedIds.delete(existing.id)
        added.push(existing)
        continue
      }
      const task = {
        id: generateId(),
        sourceName,
        status: 'pending',
        addedAt: Date.now(),
        error: null,
        retryCount: 0,
        phase: 'queued',
        detail: '排队中',
      }
      queue.push(task)
      added.push(task)
    }
    for (const t of added) emitTask(t)
    saveQueue()
    processNext()
    return added
  }

  function retry(taskId) {
    const task = findTask(taskId)
    if (!task || !['failed', 'cancelled'].includes(task.status)) return false
    task.status = 'pending'
    task.error = null
    task.retryCount = 0
    task.phase = 'queued'
    emitTask(task)
    saveQueue()
    processNext()
    return true
  }

  function cancel(taskId) {
    const task = findTask(taskId)
    if (!task) return false
    if (task.status === 'processing') {
      cancelledInFlight.add(taskId)
      const run = activeRuns.get(taskId)
      if (run) run.controller.abort()
      task.status = 'cancelled'
      task.detail = '已取消（在途输出已丢弃）'
    } else if (task.status === 'pending') {
      task.status = 'cancelled'
    } else {
      return false
    }
    emitTask(task)
    saveQueue()
    return true
  }

  function pause() {
    if (paused) return false
    paused = true
    for (const [taskId, run] of activeRuns) {
      const task = findTask(taskId)
      if (task && task.status === 'processing') {
        task.status = 'pending'
        task.detail = '队列已暂停'
        run.controller.abort()
        emitTask(task)
      }
    }
    notify('queue-paused', { reason: '用户手动暂停' })
    saveQueue()
    return true
  }

  function resume() {
    if (!paused) return false
    paused = false
    if (usageLimitTimer) {
      clearTimeout(usageLimitTimer)
      usageLimitTimer = null
    }
    notify('queue-resumed', { reason: '用户手动恢复' })
    processNext()
    return true
  }

  function list() {
    return queue.map((t) => ({ ...t }))
  }

  function summary() {
    const by = (s) => queue.filter((t) => t.status === s).length
    return {
      pending: by('pending'),
      processing: by('processing'),
      done: by('done'),
      failed: by('failed'),
      cancelled: by('cancelled'),
      paused,
      total: queue.length,
    }
  }

  function clearCompletedAndCancelled() {
    const before = queue.length
    queue = queue.filter((t) => !['done', 'cancelled'].includes(t.status))
    saveQueue()
    notify('cleared', { removed: before - queue.length })
    return before - queue.length
  }

  function setLLM(config) {
    llm = config
  }

  function dispose() {
    disposed = true
    epoch += 1
    if (usageLimitTimer) clearTimeout(usageLimitTimer)
    for (const [, run] of activeRuns) run.controller.abort()
    activeRuns.clear()
  }

  return {
    enqueue,
    retry,
    cancel,
    pause,
    resume,
    list,
    summary,
    restore,
    setLLM,
    clearCompletedAndCancelled,
    dispose,
    isPaused: () => paused,
  }
}

module.exports = { createCompileQueue, QUEUE_STATE_FILE, MAX_RETRIES, USAGE_LIMIT_AUTO_RESUME_MS }
