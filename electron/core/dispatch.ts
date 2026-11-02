import * as fs from 'node:fs'
import * as path from 'node:path'

import { AgentSpec, AgentType, runAgent } from './agent_adapter'
import { next, complete, choose, fail, instanceWorkflow } from './executor'
import { ProcessFile, Status, formatLocalTime } from './state'

// ---------------------------------------------------------------------------
// 工作流调度器：把「人/agent 手动推 next→complete」换成程序驱动。
// 一个实例一个 agent session；节点内容转发给本地 agent，取最后一段文本作为产物。
// ---------------------------------------------------------------------------

export interface DispatchRun {
  invoke: string
  node: string
  type: string
  started_at: string
  finished_at?: string
  attempts: number
  outcome: 'completed' | 'chosen' | 'rejected' | 'agent_failed' | 'aborted'
  artifact?: string
  branch?: string
  error?: string
}

export interface DispatchRecord {
  instance_id: string
  workflow: string
  agent: AgentSpec
  session_id: string
  status: 'running' | 'completed' | 'failed' | 'aborted' | 'stopped'
  pid: number
  started_at: string
  finished_at?: string
  updated_at: string
  current_node?: string
  current_invoke?: string
  steps: number
  last_error?: string
  runs: DispatchRun[]
}

export interface DispatchOptions {
  root: string
  workflow?: string
  instanceId: string
  agent: AgentSpec
  /** agent 子进程工作目录；必须稳定，默认 root */
  cwd?: string
  /** 单节点超时，默认 30 分钟 */
  nodeTimeoutMs?: number
  /** 审核/格式不合规的最大重投次数，默认 3 */
  maxAttempts?: number
  onUpdate?: (record: DispatchRecord) => void
}

const DEFAULT_NODE_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_MAX_ATTEMPTS = 3

// ---------------------------------------------------------------------------
// 路径
// ---------------------------------------------------------------------------

export function instanceDir(root: string, workflow: string, instanceId: string): string {
  return path.join(root, '.workflows', workflow, 'instance', instanceId)
}

function dispatchDir(root: string, workflow: string, instanceId: string): string {
  return path.join(instanceDir(root, workflow, instanceId), 'dispatch')
}

function recordPath(root: string, workflow: string, instanceId: string): string {
  return path.join(dispatchDir(root, workflow, instanceId), 'dispatch.json')
}

function lockPath(root: string, workflow: string, instanceId: string): string {
  return path.join(dispatchDir(root, workflow, instanceId), 'dispatch.lock')
}

// ---------------------------------------------------------------------------
// 记录读写
// ---------------------------------------------------------------------------

export function readDispatch(root: string, workflow: string, instanceId: string): DispatchRecord | null {
  const p = recordPath(root, workflow, instanceId)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as DispatchRecord
  } catch {
    return null
  }
}

function writeRecord(root: string, workflow: string, instanceId: string, record: DispatchRecord): void {
  const p = recordPath(root, workflow, instanceId)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  record.updated_at = formatLocalTime()
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2))
  fs.renameSync(tmp, p)
}

/** 扫描所有实例的调度记录（调度页数据源） */
export function listDispatches(root: string, workflowFilter?: string): DispatchRecord[] {
  const base = path.join(root, '.workflows')
  if (!fs.existsSync(base)) return []
  const out: DispatchRecord[] = []
  for (const wfEntry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!wfEntry.isDirectory()) continue
    if (workflowFilter && wfEntry.name !== workflowFilter) continue
    const instBase = path.join(base, wfEntry.name, 'instance')
    if (!fs.existsSync(instBase)) continue
    for (const instEntry of fs.readdirSync(instBase, { withFileTypes: true })) {
      if (!instEntry.isDirectory()) continue
      const rec = readDispatch(root, wfEntry.name, instEntry.name)
      if (rec) out.push(rec)
    }
  }
  out.sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
  return out
}

// ---------------------------------------------------------------------------
// 锁：同一实例只允许一个调度器驱动
// ---------------------------------------------------------------------------

function pidAlive(pid: number): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    // EPERM = 进程存在但不属于当前用户；ESRCH = 进程已不存在
    return e && e.code === 'EPERM'
  }
}

function readLock(root: string, workflow: string, instanceId: string): { pid: number; started_at: string } | null {
  const p = lockPath(root, workflow, instanceId)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function acquireLock(root: string, workflow: string, instanceId: string): void {
  const existing = readLock(root, workflow, instanceId)
  if (existing && existing.pid !== process.pid && pidAlive(existing.pid)) {
    throw new Error(`该实例已有调度进程在运行（pid ${existing.pid}），拒绝重复接管`)
  }
  fs.mkdirSync(dispatchDir(root, workflow, instanceId), { recursive: true })
  fs.writeFileSync(
    lockPath(root, workflow, instanceId),
    JSON.stringify({ pid: process.pid, instance_id: instanceId, started_at: formatLocalTime() }),
  )
}

/** 启动前的可调度性检查（IPC / UI 用，返回原因而不是抛错） */
export function canDispatch(
  root: string,
  instanceId: string,
  workflow?: string,
): { ok: boolean; reason?: string; workflow?: string } {
  let wf = workflow
  try {
    wf = wf ?? instanceWorkflow(root, instanceId)
  } catch (e: any) {
    return { ok: false, reason: e.message }
  }
  if (isDispatchRunning(instanceId)) {
    return { ok: false, reason: '该实例正在调度中', workflow: wf }
  }
  const existing = readLock(root, wf, instanceId)
  if (existing && existing.pid !== process.pid && pidAlive(existing.pid)) {
    return { ok: false, reason: `该实例已有调度进程在运行（pid ${existing.pid}）`, workflow: wf }
  }
  return { ok: true, workflow: wf }
}

function releaseLock(root: string, workflow: string, instanceId: string): void {
  const p = lockPath(root, workflow, instanceId)
  const lock = readLock(root, workflow, instanceId)
  if (lock && lock.pid !== process.pid) return
  try {
    fs.unlinkSync(p)
  } catch {
    // ignored
  }
}

// ---------------------------------------------------------------------------
// 运行态注册表（用于取消）
// ---------------------------------------------------------------------------

const running = new Map<string, AbortController>()

export function isDispatchRunning(instanceId: string): boolean {
  return running.has(instanceId)
}

export function stopDispatch(instanceId: string): boolean {
  const ctrl = running.get(instanceId)
  if (!ctrl) return false
  ctrl.abort()
  return true
}

// ---------------------------------------------------------------------------
// prompt 构造
// ---------------------------------------------------------------------------

interface NodePayload {
  type: string
  node_id: string
  node_name: string
  invoke: string
  content?: string
  condition?: string | null
  branches?: { name: string; description: string | null }[]
}

const ARTIFACT_CONTRACT = [
  '## 执行约束（Ocean 调度器下发）',
  '1. 本节点只做上面这件事。不要调用 `ocean` 命令，不要尝试推进工作流状态——调度器会接手。',
  '2. 产物中引用文件时，必须写**项目根目录相对路径**（如 `.nodes/foo.md`）。写裸文件名会被产物审核判定为编造。',
  '3. 清单类产物：清单条目数必须与声明的总数完全一致，不要用 head/省略号截断清单。',
  '4. **最终回复必须就是完整产物正文本身**。不要寒暄、不要复述任务、不要只写"已完成"。',
].join('\n')

function buildTaskPrompt(parsed: NodePayload, workflow: string, instanceId: string): string {
  return [
    `你正在执行 Ocean 工作流「${workflow}」的实例 ${instanceId}，当前节点「${parsed.node_name}」。`,
    '',
    parsed.content ?? '',
    '',
    ARTIFACT_CONTRACT,
  ].join('\n')
}

function buildDecisionPrompt(parsed: NodePayload, workflow: string, instanceId: string): string {
  const branchNames = (parsed.branches ?? []).map((b) => b.name)
  return [
    `你正在执行 Ocean 工作流「${workflow}」的实例 ${instanceId}，当前是决策节点「${parsed.node_name}」。`,
    '',
    '## 判断内容',
    parsed.condition ?? '（未提供判断内容）',
    '',
    '## 可选分支（只能选一个，分支名必须原样照抄）',
    ...branchNames.map((n) => `- ${n}`),
    '',
    '## 执行约束（Ocean 调度器下发）',
    '1. 不要调用 `ocean` 命令，不要尝试推进工作流状态——调度器会接手。',
    '2. 最终回复的最后两行必须严格是：',
    'BRANCH: <分支名>',
    'REASON: <一句话理由>',
    '3. 分支名只能从上面列表中原样取，不要加引号、括号或解释。',
  ].join('\n')
}

function parseChoice(text: string, branchNames: string[]): { branch: string; reason: string } | null {
  const normalize = (s: string) => s.trim().replace(/^[`"'【\[]+/, '').replace(/[`"'】\]]+$/, '').trim()

  const branchMatch = text.match(/^\s*BRANCH\s*[:：]\s*(.+)$/im)
  const reasonMatch = text.match(/^\s*REASON\s*[:：]\s*(.+)$/im)
  if (!branchMatch) return null

  const rawBranch = normalize(branchMatch[1])
  const branch = branchNames.find((n) => n === rawBranch)
    ?? branchNames.find((n) => rawBranch.startsWith(n))
    ?? branchNames.find((n) => rawBranch.includes(n))
  if (!branch) return null

  return { branch, reason: reasonMatch ? normalize(reasonMatch[1]) : '' }
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

function readStatus(root: string, workflow: string, instanceId: string): Status {
  const pf = ProcessFile.read(path.join(instanceDir(root, workflow, instanceId), 'process.md'))
  return pf.state.status
}

function runDir(root: string, workflow: string, instanceId: string, invoke: string): string {
  return path.join(dispatchDir(root, workflow, instanceId), 'runs', invoke)
}

export async function runDispatch(opts: DispatchOptions): Promise<DispatchRecord> {
  const root = opts.root
  const instanceId = opts.instanceId
  const workflow = opts.workflow ?? instanceWorkflow(root, instanceId)
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const nodeTimeoutMs = opts.nodeTimeoutMs ?? DEFAULT_NODE_TIMEOUT_MS
  const cwd = opts.cwd ?? root
  const sessionDir = path.join(dispatchDir(root, workflow, instanceId), 'sessions')

  acquireLock(root, workflow, instanceId)

  const controller = new AbortController()
  running.set(instanceId, controller)

  const initialStatus = (() => {
    try {
      return readStatus(root, workflow, instanceId)
    } catch {
      return null
    }
  })()

  const record: DispatchRecord = {
    instance_id: instanceId,
    workflow,
    agent: opts.agent,
    session_id: instanceId,
    status: 'running',
    pid: process.pid,
    started_at: formatLocalTime(),
    updated_at: formatLocalTime(),
    steps: 0,
    runs: [],
  }

  const notify = () => {
    try {
      writeRecord(root, workflow, instanceId, record)
    } catch {
      // 写盘失败不阻塞执行
    }
    if (opts.onUpdate) {
      try {
        opts.onUpdate(record)
      } catch {
        // ignored
      }
    }
  }

  const finish = (status: DispatchRecord['status'], error?: string) => {
    record.status = status
    record.finished_at = formatLocalTime()
    if (error) record.last_error = error
    notify()
    releaseLock(root, workflow, instanceId)
    running.delete(instanceId)
    return record
  }

  if (initialStatus === null) {
    return finish('failed', '读取实例状态失败，实例可能不存在')
  }
  if (initialStatus === Status.Executing || initialStatus === Status.AwaitingChoice) {
    return finish(
      'failed',
      '实例处于执行中/待决策状态，无法接管。请先 complete/choose 收尾，或新建实例。',
    )
  }
  if (initialStatus === Status.Completed) {
    return finish('completed')
  }
  if (initialStatus === Status.Aborted) {
    return finish('aborted', '实例已处于 aborted 状态')
  }

  fs.mkdirSync(sessionDir, { recursive: true })
  notify()

  // ---- 节点循环 ----
  let loopGuard = 0
  try {
  while (true) {
    loopGuard += 1
    if (loopGuard > 500) return finish('failed', '单次调度推进超过 500 个节点，疑似死循环，已终止')

    if (controller.signal.aborted) return finish('stopped', '已被手动停止')

    let payload: NodePayload
    try {
      payload = JSON.parse(await next(root, workflow, instanceId, true)) as NodePayload
    } catch (e: any) {
      return finish('failed', `推进失败：${e.message}`)
    }

    record.steps += 1
    record.current_node = payload.node_name
    record.current_invoke = payload.invoke
    notify()

    const run: DispatchRun = {
      invoke: payload.invoke,
      node: payload.node_name,
      type: payload.type,
      started_at: formatLocalTime(),
      attempts: 0,
      outcome: 'completed',
    }
    record.runs.push(run)

    const rd = runDir(root, workflow, instanceId, payload.invoke)
    fs.mkdirSync(rd, { recursive: true })

    // start 节点没有实质任务，直接推进，不消耗 agent 调用
    if (payload.type === 'start') {
      try {
        await complete(root, workflow, instanceId, `工作流「${workflow}」已开始，初始输入已接收。`)
      } catch (e: any) {
        run.outcome = 'agent_failed'
        run.error = e.message
        run.finished_at = formatLocalTime()
        return finish('failed', `start 节点推进失败：${e.message}`)
      }
      run.finished_at = formatLocalTime()
      notify()
      continue
    }

    const isDecision = payload.type === 'decision'
    const branchNames = (payload.branches ?? []).map((b) => b.name)
    let prompt = isDecision
      ? buildDecisionPrompt(payload, workflow, instanceId)
      : buildTaskPrompt(payload, workflow, instanceId)

    let lastError = ''
    let settled = false

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      run.attempts = attempt
      const attemptPrefix = path.join(rd, `attempt-${attempt}`)
      fs.writeFileSync(`${attemptPrefix}.prompt.md`, prompt)

      const result = await runAgent({
        spec: opts.agent,
        prompt,
        sessionId: instanceId,
        sessionDir,
        cwd,
        timeoutMs: nodeTimeoutMs,
        eventsPath: `${attemptPrefix}.events.jsonl`,
        signal: controller.signal,
      })

      fs.writeFileSync(
        `${attemptPrefix}.meta.json`,
        JSON.stringify(
          {
            exit_code: result.exitCode,
            timed_out: result.timedOut,
            aborted: result.aborted,
            session_id: result.sessionId,
            error: result.error ?? null,
          },
          null,
          2,
        ),
      )
      if (result.text) fs.writeFileSync(`${attemptPrefix}.result.md`, result.text)

      if (!result.ok) {
        lastError = result.error ?? 'agent 执行失败'
        run.outcome = result.aborted ? 'aborted' : 'agent_failed'
        run.error = lastError
        run.finished_at = formatLocalTime()
        if (result.aborted) {
          await safeFail(root, workflow, instanceId, lastError)
          record.runs[record.runs.length - 1] = run
          return finish('stopped', '已被手动停止')
        }
        // agent 侧失败：交给状态机 fail，走 retry_count
        const failResult = await safeFail(root, workflow, instanceId, lastError)
        record.runs[record.runs.length - 1] = run
        notify()
        if (failResult.aborted) return finish('aborted', `失败次数超限：${lastError}`)
        return finish('failed', lastError)
      }

      // ---- 提交 ----
      if (isDecision) {
        const choice = parseChoice(result.text, branchNames)
        if (!choice) {
          lastError = `未能从回复中解析出 BRANCH/REASON。可选分支：${branchNames.join(' / ')}`
          run.outcome = 'rejected'
          run.error = lastError
          prompt = [
            '上一条回复不符合要求：必须在最后两行分别输出 `BRANCH: <分支名>` 和 `REASON: <理由>`，',
            `且分支名只能从 ${branchNames.join(' / ')} 中原样选择。`,
            '请只输出这两行。',
          ].join('\n')
          continue
        }
        try {
          await choose(root, workflow, instanceId, choice.branch, choice.reason || '由 agent 依据判断内容选择')
          run.outcome = 'chosen'
          run.branch = choice.branch
          run.finished_at = formatLocalTime()
          settled = true
          break
        } catch (e: any) {
          lastError = e.message
          run.outcome = 'rejected'
          run.error = lastError
          prompt = `上一条选择未被接受：${e.message}\n请重新只输出 BRANCH/REASON 两行。`
          continue
        }
      }

      try {
        await complete(root, workflow, instanceId, result.text)
        run.outcome = 'completed'
        run.artifact = path.join(rd, `attempt-${attempt}.result.md`)
        run.finished_at = formatLocalTime()
        settled = true
        break
      } catch (e: any) {
        // 包含 LLM 审核不通过：complete 在写产物前抛错，状态仍是 Executing，可原地重投
        lastError = e.message
        run.outcome = 'rejected'
        run.error = lastError
        prompt = [
          '上一条产物未被接受，Ocean 的返回是：',
          '',
          e.message,
          '',
          '请按节点要求补齐后重新输出完整产物正文（不要解释，不要复述任务）。',
        ].join('\n')
        continue
      }
    }

    record.runs[record.runs.length - 1] = run

    if (!settled) {
      const failResult = await safeFail(root, workflow, instanceId, `连续 ${maxAttempts} 次提交未通过：${lastError}`)
      notify()
      if (failResult.aborted) return finish('aborted', `重投次数耗尽且失败次数超限：${lastError}`)
      return finish('failed', `连续 ${maxAttempts} 次提交未通过：${lastError}`)
    }

    const st = (() => {
      try {
        return readStatus(root, workflow, instanceId)
      } catch {
        return null
      }
    })()
    notify()

    if (st === Status.Completed) return finish('completed')
    if (st === Status.Aborted) return finish('aborted', '实例被状态机置为 aborted（超出步数/环回/重试限制）')
    if (st === null) return finish('failed', '提交后读取实例状态失败')
  }
  } catch (e: any) {
    // 兜底：任何未预期异常也不能把锁和记录留在中间态
    return finish('failed', `调度器内部异常：${e?.message ?? String(e)}`)
  }
}

async function safeFail(
  root: string,
  workflow: string,
  instanceId: string,
  reason: string,
): Promise<{ aborted: boolean; error?: string }> {
  try {
    fail(root, workflow, instanceId, reason)
    return { aborted: false }
  } catch (e: any) {
    return { aborted: true, error: e.message }
  }
}

/** 后台启动；锁被占用时同步抛错（先调 canDispatch 可获得友好提示） */
export function startDispatch(opts: DispatchOptions): { instanceId: string } {
  const workflow = opts.workflow ?? instanceWorkflow(opts.root, opts.instanceId)
  acquireLock(opts.root, workflow, opts.instanceId)
  const run = runDispatch({ ...opts, workflow }).catch(() => undefined)
  void run
  return { instanceId: opts.instanceId }
}

export type { AgentSpec, AgentType }