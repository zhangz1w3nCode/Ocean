// 任务存储层 —— CLI（ocean task）与桌面端/网页端（launch.cjs）共用的唯一实现。
//
// 为什么单独成文件，而不是让 CLI 直接复用 launch.cjs 的 handler：
//   任务逻辑原本内联在 ipcMain.handle('create-task', ...) 里，没有导出；
//   打包后 CLI 是 Resources/cli/bin/ocean.js，由普通 node 执行（见 /opt/homebrew/bin/ocean 包装脚本），
//   而 launch.cjs 在 app.asar 内，普通 node 读不到（ENOTDIR），只有 Electron 的 fs 补丁认 asar。
//   所以本文件由 launch.cjs 直接 require，同时由 esbuild 构建时内联进 CLI bundle：
//   两端共享同一份源码，避免逻辑二次实现后行为漂移。
//
// 约定：业务校验失败返回 { success:false, error }（不抛异常，与 IPC 契约一致）；
// 未预期的系统异常向上抛出，由调用方决定包装方式（GUI 包成 {success:false}，CLI 转成错误输出）。
//
// 以下逻辑整体抽自 launch.cjs，数据格式与状态机语义保持一致。

const fs = require('fs')
const path = require('path')

const YAML = require('yaml')

// 状态常量（模块级）：仅用于取值校验；状态流转合法性仍只由工厂内的 updateTask 判定，
// 避免出现第二套规则。
const TASK_STATUS_PENDING = '等待处理'
const TASK_STATUS_RUNNING = '处理中'
const TASK_STATUS_COMPLETED = '已完成'
const TASK_STATUS_CANCELLED = '已取消'
const TASK_STATUSES = [TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_COMPLETED, TASK_STATUS_CANCELLED]

/**
 * 绑定项目根目录，返回该项目的任务操作集合。
 * @param {string} root 项目根目录（其下的 .tasks/ 为任务数据目录）
 */
function createTaskStore(root) {

  // 任务数据存储在打开项目根目录的 .tasks/ 下：
  //   .tasks/{task-name}/TASK.md           — YAML frontmatter 记录元信息，正文为任务内容
  //   .tasks/{task-name}/context/*.md      — 任务上下文（多个独立 markdown 文件）
  //   .tasks/{task-name}/trace/trace.jsonl — 操作记录与事件流（追加式紧凑 JSON 行）
  // 与仓库任务库的日期目录（.tasks/{YYYY-MM-DD}/）共存：
  // 仅「直接包含 TASK.md 的一级子目录」视为任务，日期目录自动排除。
  // 状态机仅前进：等待处理 --(手动 或 处理人由空变有自动)--> 处理中 --(手动)--> 已完成 | 已取消；
  // 等待处理也可直接手动流转到已完成/已取消；终态锁定；手动选择优先于自动规则。



  // 任务数据存储根目录（项目根 .tasks；只读操作不创建）
  const getTasksDir = () => path.join(root, '.tasks')

  // 确保任务根目录存在（写入路径使用）
  const ensureTasksDir = () => {
    const dir = getTasksDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  // 任务名称合法性校验：作为目录名使用，禁止路径分隔符/上跳/控制字符
  const sanitizeTaskName = (name) => {
    if (typeof name !== 'string') return null
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100) return null
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return null
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
    return trimmed
  }

  const getTaskDir = (name) => path.join(getTasksDir(), name)
  const getTaskMdPath = (name) => path.join(getTasksDir(), name, 'TASK.md')
  const getTaskContextDir = (name) => path.join(getTasksDir(), name, 'context')
  const getTaskTracePath = (name) => path.join(getTasksDir(), name, 'trace', 'trace.jsonl')

  // 解析 TASK.md：YAML frontmatter + 正文（任务内容）。frontmatter 损坏时降级为纯正文。
  const parseTaskMd = (raw) => {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) return { frontmatter: {}, body: raw }
    try {
      const frontmatter = YAML.parse(match[1]) || {}
      return { frontmatter, body: match[2] }
    } catch (e) {
      console.error('TASK.md frontmatter 解析失败:', e.message)
      return { frontmatter: {}, body: raw }
    }
  }

  // 序列化 TASK.md：yaml 库处理多行内容与特殊字符，禁止手拼字符串。
  // 数组字段（tags/repo 等）一律流式 [ a, b ] / []，不用块式 - 列表。
  const serializeTaskMd = (frontmatter, body) => {
    const doc = new YAML.Document(frontmatter)
    YAML.visit(doc, { Seq(_key, node) { node.flow = true; return undefined } })
    const yamlText = String(doc)
    const trimmedBody = typeof body === 'string' ? body.replace(/\s+$/, '') : ''
    return `---\n${yamlText}---\n\n${trimmedBody ? trimmedBody + '\n' : ''}`
  }

  // 字符串数组归一化：去空去重，上限 20 项（repo/tags 共用）
  const normalizeTaskStringArray = (value) => {
    if (!Array.isArray(value)) return []
    const seen = new Set()
    const result = []
    for (const item of value) {
      const s = String(item).trim()
      if (s && !seen.has(s)) { seen.add(s); result.push(s) }
    }
    return result.slice(0, 20)
  }

  // frontmatter 数组字段读取（容错：单值/数组/null → 数组）
  const readTaskArrayField = (value) => {
    if (Array.isArray(value)) return value.map(String)
    if (value == null || value === '') return []
    return [String(value)]
  }

  // 读取单个任务（TASK.md 不存在返回 null）
  const readTaskFile = (taskName) => {
    const mdPath = getTaskMdPath(taskName)
    if (!fs.existsSync(mdPath)) return null
    const raw = fs.readFileSync(mdPath, 'utf-8')
    const { frontmatter, body } = parseTaskMd(raw)
    return {
      name: String(frontmatter.name || taskName),
      status: TASK_STATUSES.includes(frontmatter.status) ? frontmatter.status : TASK_STATUS_PENDING,
      handler: frontmatter.handler != null ? String(frontmatter.handler).trim() : '',
      repo: readTaskArrayField(frontmatter.repo),
      tags: readTaskArrayField(frontmatter.tags),
      relatedTasks: readTaskArrayField(frontmatter.related_tasks),
      content: body,
      createdAt: frontmatter.created_at != null ? String(frontmatter.created_at) : '',
      updatedAt: frontmatter.updated_at != null ? String(frontmatter.updated_at) : '',
      _raw: frontmatter,
    }
  }

  // 任务摘要（列表与 IPC 返回的公共结构）
  const taskSummaryOf = (task, dirName) => ({
    name: dirName || task.name,
    status: task.status,
    handler: task.handler,
    repo: task.repo,
    tags: task.tags,
    relatedTasks: task.relatedTasks,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  })

  // 追加 trace 事件（紧凑 JSON 行）
  const appendTaskTrace = (taskName, entry) => {
    const tracePath = getTaskTracePath(taskName)
    fs.mkdirSync(path.dirname(tracePath), { recursive: true })
    fs.appendFileSync(tracePath, JSON.stringify(entry) + '\n', 'utf-8')
  }

  // 读取 trace 事件流（坏行跳过，不阻塞）
  const readTaskTraceEvents = (taskName) => {
    const tracePath = getTaskTracePath(taskName)
    if (!fs.existsSync(tracePath)) return []
    const events = []
    for (const line of fs.readFileSync(tracePath, 'utf-8').split('\n')) {
      if (!line.trim()) continue
      try { events.push(JSON.parse(line)) } catch {}
    }
    return events
  }

  // 任务列表：仅收录直接包含 TASK.md 的一级子目录

  const listTasks = () => {
    const tasksDir = getTasksDir()
    if (!fs.existsSync(tasksDir)) return { success: true, tasks: [] }
    const tasks = []
    for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const task = readTaskFile(entry.name)
      if (!task) continue
      tasks.push(taskSummaryOf(task, entry.name))
    }
    tasks.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    return { success: true, tasks }
  }

  const readTaskDetail = (taskName) => {
    const name = sanitizeTaskName(taskName)
    if (!name) return { success: false, error: '非法任务名称' }
    const task = readTaskFile(name)
    if (!task) return { success: false, error: `任务不存在: ${name}` }
    const contextDir = getTaskContextDir(name)
    const contexts = []
    if (fs.existsSync(contextDir)) {
      for (const entry of fs.readdirSync(contextDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        const filePath = path.join(contextDir, entry.name)
        contexts.push({
          name: entry.name.slice(0, -3),
          content: fs.readFileSync(filePath, 'utf-8'),
          updatedAt: fs.statSync(filePath).mtime.toISOString(),
        })
      }
    }
    contexts.sort((a, b) => a.name.localeCompare(b.name))
    return { success: true, detail: { task: { ...taskSummaryOf(task, name), content: task.content }, contexts, trace: readTaskTraceEvents(name) } }
  }

  const createTask = (payload) => {
    const p = payload || {}
    const name = sanitizeTaskName(p.name)
    if (!name) return { success: false, error: '任务名称不能为空，且不能包含 / \\ .. 等非法字符' }
    const content = typeof p.content === 'string' ? p.content.trim() : ''
    if (!content) return { success: false, error: '任务内容不能为空' }
    const taskDir = getTaskDir(name)
    if (fs.existsSync(taskDir)) return { success: false, error: '任务名称已存在' }

    ensureTasksDir()
    fs.mkdirSync(getTaskContextDir(name), { recursive: true })
    fs.mkdirSync(path.dirname(getTaskTracePath(name)), { recursive: true })

    const now = new Date().toISOString()
    const handler = typeof p.handler === 'string' ? p.handler.trim() : ''
    const repo = normalizeTaskStringArray(p.repo)
    const tags = normalizeTaskStringArray(p.tags)
    // 关联任务：仅收录当前已存在的任务名，防止引用不存在的任务
    const relatedTasks = normalizeTaskStringArray(p.relatedTasks).filter(t => fs.existsSync(getTaskDir(t)))
    fs.writeFileSync(getTaskMdPath(name), serializeTaskMd({
      name,
      status: TASK_STATUS_PENDING,
      handler,
      repo,
      tags,
      related_tasks: relatedTasks,
      created_at: now,
      updated_at: now,
    }, content), 'utf-8')
    appendTaskTrace(name, { ts: now, type: 'task-created', message: '创建任务' })

    // 创建时填写的任务上下文 → 初始上下文文件
    const contextContent = typeof p.context === 'string' ? p.context.trim() : ''
    if (contextContent) {
      const contextName = '初始上下文'
      fs.writeFileSync(path.join(getTaskContextDir(name), `${contextName}.md`), contextContent + '\n', 'utf-8')
      appendTaskTrace(name, { ts: now, type: 'context-created', name: contextName, message: `新增上下文：${contextName}` })
    }

    return { success: true, task: { name, status: TASK_STATUS_PENDING, handler, repo, tags, relatedTasks, createdAt: now, updatedAt: now } }
  }

  const updateTask = (payload) => {
    const p = payload || {}
    const name = sanitizeTaskName(p.name)
    if (!name) return { success: false, error: '非法任务名称' }
    const existing = readTaskFile(name)
    if (!existing) return { success: false, error: `任务不存在: ${name}` }
    const content = typeof p.content === 'string' ? p.content.trim() : ''
    if (!content) return { success: false, error: '任务内容不能为空' }
    const handler = typeof p.handler === 'string' ? p.handler.trim() : ''
    const repo = normalizeTaskStringArray(p.repo)
    const tags = normalizeTaskStringArray(p.tags)
    // 关联任务：仅收录当前已存在的任务名（排除自身）
    const relatedTasks = normalizeTaskStringArray(p.relatedTasks).filter(t => t !== name && fs.existsSync(getTaskDir(t)))

    // 状态机（仅前进）：
    //   等待处理 --(手动 或 处理人由空变有自动)--> 处理中 --(手动)--> 已完成 | 已取消；
    //   等待处理也可直接手动流转到已完成/已取消；终态锁定；手动选择优先于自动规则；
    //   等待处理 → 处中 需先指定处理人
    let nextStatus = existing.status
    const requested = typeof p.status === 'string' && TASK_STATUSES.includes(p.status) ? p.status : null
    if (requested && requested !== existing.status) {
      const allowed = existing.status === TASK_STATUS_PENDING
        ? [TASK_STATUS_RUNNING, TASK_STATUS_COMPLETED, TASK_STATUS_CANCELLED]
        : existing.status === TASK_STATUS_RUNNING
          ? [TASK_STATUS_COMPLETED, TASK_STATUS_CANCELLED]
          : []
      if (!allowed.includes(requested)) {
        return { success: false, error: `当前状态「${existing.status}」不能变更为「${requested}」` }
      }
      // 等待处理 → 处理中 门禁：必须先指定任务处理人
      if (existing.status === TASK_STATUS_PENDING && requested === TASK_STATUS_RUNNING && handler === '') {
        return { success: false, error: '请先指定任务处理人，再推进到「处理中」' }
      }
      nextStatus = requested
    }
    // 自动流转仅在没有手动选择目标状态时生效（手动优先）
    if ((!requested || requested === existing.status) && existing.status === TASK_STATUS_PENDING && !existing.handler && handler !== '') {
      nextStatus = TASK_STATUS_RUNNING
    }

    const now = new Date().toISOString()
    const changedFields = []
    if (content !== existing.content.trim()) changedFields.push('任务内容')
    if (handler !== existing.handler) changedFields.push('处理人')
    if (JSON.stringify(repo) !== JSON.stringify(existing.repo)) changedFields.push('关联仓库')
    if (JSON.stringify(tags) !== JSON.stringify(existing.tags)) changedFields.push('标签')
    if (JSON.stringify(relatedTasks) !== JSON.stringify(existing.relatedTasks)) changedFields.push('关联任务')
    const statusChanged = nextStatus !== existing.status
    if (!changedFields.length && !statusChanged) {
      return { success: true, task: taskSummaryOf(existing, name) }
    }

    // 以解析出的原始 frontmatter 为基底增量更新，未知字段原样保留
    const frontmatter = { ...existing._raw }
    frontmatter.name = name
    frontmatter.status = nextStatus
    frontmatter.handler = handler
    frontmatter.repo = repo
    frontmatter.tags = tags
    frontmatter.related_tasks = relatedTasks
    frontmatter.updated_at = now
    fs.writeFileSync(getTaskMdPath(name), serializeTaskMd(frontmatter, content), 'utf-8')

    // 事件顺序：先字段变更后状态变更——字段变更（如指定处理人）是因，状态推进是果
    if (changedFields.length) {
      appendTaskTrace(name, { ts: now, type: 'task-updated', fields: changedFields, message: `更新字段：${changedFields.join('、')}` })
    }
    if (statusChanged) {
      appendTaskTrace(name, { ts: now, type: 'status-changed', from: existing.status, to: nextStatus, message: `状态变更：${existing.status} → ${nextStatus}` })
    }

    return { success: true, task: { name, status: nextStatus, handler, repo, tags, relatedTasks, createdAt: existing.createdAt, updatedAt: now } }
  }

  // 全文检索：任务正文 + 每个上下文正文。
  // 与列表关键词的分工：列表只过摘要字段（与桌面端任务库一致），
  // 这里负表正文维度；只输出命中位置与上下文行，不返回全文。
  const searchTasks = (keyword, opts) => {
    const kw = typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''
    if (!kw) return { success: true, results: [] }
    const top = typeof opts?.top === 'number' && opts.top >= 0 ? opts.top : 5
    const context = typeof opts?.context === 'number' && opts.context >= 0 ? opts.context : 2
    const tasksDir = getTasksDir()
    if (!fs.existsSync(tasksDir)) return { success: true, results: [] }

    const results = []
    for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const task = readTaskFile(entry.name)
      if (!task) continue
      if (opts?.status && task.status !== opts.status) continue

      // 检索范围：正文标为「任务内容」，上下文标为其主题名。
      // TASK.md 正文读回时总带一个空行（serializeTaskMd 在 frontmatter 后插了两个 \n，
      // 解析只吞掉一个），不剥掉会让行号比用户看到的内容多一行。
      const stripLeadingBlank = (text) => String(text).replace(/^\n+/, '')
      const sections = [{ where: '任务内容', text: stripLeadingBlank(task.content) }]
      const contextDir = getTaskContextDir(entry.name)
      if (fs.existsSync(contextDir)) {
        for (const ce of fs.readdirSync(contextDir, { withFileTypes: true })) {
          if (!ce.isFile() || !ce.name.endsWith('.md')) continue
          sections.push({
            where: ce.name.slice(0, -3),
            text: fs.readFileSync(path.join(contextDir, ce.name), 'utf-8'),
          })
        }
      }

      const matches = []
      for (const section of sections) {
        const lines = String(section.text).split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].toLowerCase().includes(kw)) continue
          matches.push({
            where: section.where,
            line: i + 1,
            text: lines[i],
            before: lines.slice(Math.max(0, i - context), i),
            after: lines.slice(i + 1, i + 1 + context),
          })
        }
      }
      if (matches.length === 0) continue
      results.push({ ...taskSummaryOf(task, entry.name), matches })
    }

    results.sort((a, b) => b.matches.length - a.matches.length || String(a.name).localeCompare(String(b.name)))
    return { success: true, results: results.slice(0, top) }
  }

  const saveTaskContext = (payload) => {
    const p = payload || {}
    const taskName = sanitizeTaskName(p.taskName)
    if (!taskName) return { success: false, error: '非法任务名称' }
    const existing = readTaskFile(taskName)
    if (!existing) return { success: false, error: `任务不存在: ${taskName}` }
    const contextName = sanitizeTaskName(p.contextName)
    if (!contextName) return { success: false, error: '上下文主题不能为空，且不能包含 / \\ .. 等非法字符' }
    const content = typeof p.content === 'string' ? p.content : ''
    if (!content.trim()) return { success: false, error: '上下文内容不能为空' }

    const contextPath = path.join(getTaskContextDir(taskName), `${contextName}.md`)
    const isUpdate = fs.existsSync(contextPath)
    fs.mkdirSync(getTaskContextDir(taskName), { recursive: true })
    fs.writeFileSync(contextPath, content.trim() + '\n', 'utf-8')

    const now = new Date().toISOString()
    const frontmatter = { ...existing._raw }
    frontmatter.updated_at = now
    fs.writeFileSync(getTaskMdPath(taskName), serializeTaskMd(frontmatter, existing.content), 'utf-8')
    appendTaskTrace(taskName, {
      ts: now,
      type: isUpdate ? 'context-updated' : 'context-created',
      name: contextName,
      message: `${isUpdate ? '更新' : '新增'}上下文：${contextName}`,
    })
    return { success: true, isUpdate }
  }

  return {
    listTasks,
    readTaskDetail,
    createTask,
    updateTask,
    saveTaskContext,
    searchTasks,
  }
}

module.exports = {
  createTaskStore,
  TASK_STATUS_PENDING,
  TASK_STATUS_RUNNING,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_CANCELLED,
  TASK_STATUSES,
}
