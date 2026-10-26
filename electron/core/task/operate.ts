// 任务域 CRUD 统一实现 —— CLI（ocean task）与桌面端/网页端共用的唯一事实源。
// 由 core/taskStore.cjs 迁移而来：root 显式化 + TypeScript 化，行为零变更。
//
// 契约：原子操作返回 { success: true, ...data } | { success: false, error }，
// 业务校验失败不抛异常；未预期的系统异常向上抛出，由调用方决定包装方式
// （desktop 包成 { success:false }，CLI 转成错误输出）。
//
// 数据格式（存储在项目根 .tasks/ 下）：
//   .tasks/{task-name}/TASK.md           — YAML frontmatter 记录元信息，正文为任务内容
//   .tasks/{task-name}/context/*.md      — 任务上下文（多个独立 markdown 文件）
//   .tasks/{task-name}/trace/trace.jsonl — 操作记录与事件流（追加式紧凑 JSON 行）
// 与仓库任务库的日期目录（.tasks/{YYYY-MM-DD}/）共存：
// 仅「直接包含 TASK.md 的一级子目录」视为任务，日期目录自动排除。
// 状态机仅前进：等待处理 --(手动 或 处理人由空变有自动)--> 处理中 --(手动)--> 已完成 | 已取消；
// 等待处理也可直接手动流转到已完成/已取消；终态锁定；手动选择优先于自动规则。

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as YAML from 'yaml'

// ---------------------------------------------------------------------------
// 常量与契约类型
// ---------------------------------------------------------------------------

const TASK_STATUS_PENDING = '等待处理'
const TASK_STATUS_RUNNING = '处理中'
const TASK_STATUS_COMPLETED = '已完成'
const TASK_STATUS_CANCELLED = '已取消'
export const TASK_STATUSES: string[] = [
  TASK_STATUS_PENDING,
  TASK_STATUS_RUNNING,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_CANCELLED,
]

// 任务摘要（列表与各操作返回的公共结构）
export interface TaskSummary {
  name: string
  status: string
  handler: string
  repo: string[]
  tags: string[]
  relatedTasks: string[]
  createdAt: string
  updatedAt: string
}

// trace.jsonl 事件（字段按事件类型出现）
export interface TaskTraceEvent {
  ts: string
  type: string
  message: string
  fields?: string[]
  from?: string
  to?: string
  name?: string
}

export interface TaskContextItem {
  name: string
  content: string
  updatedAt: string
}

export interface TaskDetail {
  task: TaskSummary & { content: string }
  contexts: TaskContextItem[]
  trace: TaskTraceEvent[]
}

export interface TaskWritePayload {
  name?: string
  content?: string
  handler?: string
  repo?: string[]
  tags?: string[]
  relatedTasks?: string[]
  status?: string
  /** 仅创建时使用：写入「初始上下文」 */
  context?: string
}

export interface TaskContextPayload {
  taskName: string
  contextName: string
  content: string
}

// 全文命中：where = 「任务内容」或上下文主题名
export interface TaskSearchMatch {
  where: string
  line: number
  text: string
  before: string[]
  after: string[]
}

export interface TaskSearchResult extends TaskSummary {
  matches: TaskSearchMatch[]
}

export interface TaskSearchOpts {
  top?: number
  context?: number
  status?: string
}

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 内部辅助：路径 / 校验 / TASK.md 格式读写 / trace
// ---------------------------------------------------------------------------

// 任务数据存储根目录（项目根 .tasks；只读操作不创建）
function tasksDir(root: string): string {
  return path.join(root, '.tasks')
}

// 确保任务根目录存在（写入路径使用）
function ensureTasksDir(root: string): string {
  const dir = tasksDir(root)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function taskDir(root: string, name: string): string {
  return path.join(tasksDir(root), name)
}

function taskMdPath(root: string, name: string): string {
  return path.join(tasksDir(root), name, 'TASK.md')
}

function taskContextDir(root: string, name: string): string {
  return path.join(tasksDir(root), name, 'context')
}

function taskTracePath(root: string, name: string): string {
  return path.join(tasksDir(root), name, 'trace', 'trace.jsonl')
}

// 任务名称合法性校验：作为目录名使用，禁止路径分隔符/上跳/控制字符
function sanitizeTaskName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 100) return null
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
  return trimmed
}

// 解析 TASK.md：YAML frontmatter + 正文（任务内容）。frontmatter 损坏时降级为纯正文。
function parseTaskMd(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }
  try {
    const parsed = YAML.parse(match[1])
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { frontmatter: {}, body: raw }
    }
    return { frontmatter: parsed as Record<string, unknown>, body: match[2] }
  } catch (e: any) {
    console.error('TASK.md frontmatter 解析失败:', e.message)
    return { frontmatter: {}, body: raw }
  }
}

// 序列化 TASK.md：yaml 库处理多行内容与特殊字符，禁止手拼字符串。
// 数组字段（tags/repo 等）一律流式 [ a, b ] / []，不用块式 - 列表。
function serializeTaskMd(frontmatter: Record<string, unknown>, body: string): string {
  const doc = new YAML.Document(frontmatter)
  YAML.visit(doc, {
    Seq(_key: unknown, node: YAML.YAMLSeq) {
      node.flow = true
      return undefined
    },
  })
  const yamlText = String(doc)
  const trimmedBody = typeof body === 'string' ? body.replace(/\s+$/, '') : ''
  return `---\n${yamlText}---\n\n${trimmedBody ? trimmedBody + '\n' : ''}`
}

// 字符串数组归一化：去空去重，上限 20 项（repo/tags 共用）
function normalizeTaskStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const s = String(item).trim()
    if (s && !seen.has(s)) {
      seen.add(s)
      result.push(s)
    }
  }
  return result.slice(0, 20)
}

// frontmatter 数组字段读取（容错：单值/数组/null → 数组）
function readTaskArrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (value == null || value === '') return []
  return [String(value)]
}

// 解析后的任务结构（raw 为原始 frontmatter，增量更新时保留未知字段用）
interface TaskFile {
  name: string
  status: string
  handler: string
  repo: string[]
  tags: string[]
  relatedTasks: string[]
  content: string
  createdAt: string
  updatedAt: string
  raw: Record<string, unknown>
}

// 读取单个任务（TASK.md 不存在返回 null）
function readTaskFile(root: string, taskName: string): TaskFile | null {
  const mdPath = taskMdPath(root, taskName)
  if (!fs.existsSync(mdPath)) return null
  const raw = fs.readFileSync(mdPath, 'utf-8')
  const { frontmatter, body } = parseTaskMd(raw)
  return {
    name: String(frontmatter.name || taskName),
    status: TASK_STATUSES.includes(frontmatter.status as string) ? (frontmatter.status as string) : TASK_STATUS_PENDING,
    handler: frontmatter.handler != null ? String(frontmatter.handler).trim() : '',
    repo: readTaskArrayField(frontmatter.repo),
    tags: readTaskArrayField(frontmatter.tags),
    relatedTasks: readTaskArrayField(frontmatter.related_tasks),
    content: body,
    createdAt: frontmatter.created_at != null ? String(frontmatter.created_at) : '',
    updatedAt: frontmatter.updated_at != null ? String(frontmatter.updated_at) : '',
    raw: frontmatter,
  }
}

function taskSummaryOf(task: TaskFile, dirName?: string): TaskSummary {
  return {
    name: dirName || task.name,
    status: task.status,
    handler: task.handler,
    repo: task.repo,
    tags: task.tags,
    relatedTasks: task.relatedTasks,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

// 追加 trace 事件（紧凑 JSON 行）
function appendTaskTrace(root: string, taskName: string, entry: TaskTraceEvent): void {
  const tracePath = taskTracePath(root, taskName)
  fs.mkdirSync(path.dirname(tracePath), { recursive: true })
  fs.appendFileSync(tracePath, JSON.stringify(entry) + '\n', 'utf-8')
}

// 读取 trace 事件流（坏行跳过，不阻塞）
function readTaskTraceEvents(root: string, taskName: string): TaskTraceEvent[] {
  const tracePath = taskTracePath(root, taskName)
  if (!fs.existsSync(tracePath)) return []
  const events: TaskTraceEvent[] = []
  for (const line of fs.readFileSync(tracePath, 'utf-8').split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line))
    } catch {}
  }
  return events
}

// 读取任务全部上下文（context/*.md，按主题名排序）
function listContexts(root: string, taskName: string): TaskContextItem[] {
  const contextDir = taskContextDir(root, taskName)
  const contexts: TaskContextItem[] = []
  if (!fs.existsSync(contextDir)) return contexts
  for (const entry of fs.readdirSync(contextDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const filePath = path.join(contextDir, entry.name)
    contexts.push({
      name: entry.name.slice(0, -3),
      content: fs.readFileSync(filePath, 'utf-8'),
      updatedAt: fs.statSync(filePath).mtime.toISOString(),
    })
  }
  contexts.sort((a, b) => a.name.localeCompare(b.name))
  return contexts
}

// ---------------------------------------------------------------------------
// 原子操作（对外契约）
// ---------------------------------------------------------------------------

// 任务列表：仅收录直接包含 TASK.md 的一级子目录，按更新时间倒序
export function listTasks(root: string): { success: true; tasks: TaskSummary[] } | Failed {
  const dir = tasksDir(root)
  if (!fs.existsSync(dir)) return { success: true, tasks: [] }
  const tasks: TaskSummary[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const task = readTaskFile(root, entry.name)
    if (!task) continue
    tasks.push(taskSummaryOf(task, entry.name))
  }
  tasks.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
  return { success: true, tasks }
}

// 读取任务详情：任务本体（摘要 + 正文）+ 全部上下文 + trace 事件流
export function readTaskDetail(root: string, taskName: string): { success: true; detail: TaskDetail } | Failed {
  const name = sanitizeTaskName(taskName)
  if (!name) return { success: false, error: '非法任务名称' }
  const task = readTaskFile(root, name)
  if (!task) return { success: false, error: `任务不存在: ${name}` }
  const contexts = listContexts(root, name)
  return {
    success: true,
    detail: {
      task: { ...taskSummaryOf(task, name), content: task.content },
      contexts,
      trace: readTaskTraceEvents(root, name),
    },
  }
}

// 创建任务：目录骨架 + TASK.md（初始状态固定「等待处理」）+ trace 首事件 + 可选初始上下文
export function createTask(root: string, payload: TaskWritePayload): { success: true; task: TaskSummary } | Failed {
  // 运行时容错外部输入（IPC / 适配层之外不允许 null 进入）
  const p = payload || {}
  const name = sanitizeTaskName(p.name)
  if (!name) return { success: false, error: '任务名称不能为空，且不能包含 / \\ .. 等非法字符' }
  const content = typeof p.content === 'string' ? p.content.trim() : ''
  if (!content) return { success: false, error: '任务内容不能为空' }
  const dir = taskDir(root, name)
  if (fs.existsSync(dir)) return { success: false, error: '任务名称已存在' }

  ensureTasksDir(root)
  fs.mkdirSync(taskContextDir(root, name), { recursive: true })
  fs.mkdirSync(path.dirname(taskTracePath(root, name)), { recursive: true })

  const now = new Date().toISOString()
  const handler = typeof p.handler === 'string' ? p.handler.trim() : ''
  const repo = normalizeTaskStringArray(p.repo)
  const tags = normalizeTaskStringArray(p.tags)
  // 关联任务：仅收录当前已存在的任务名，防止引用不存在的任务
  const relatedTasks = normalizeTaskStringArray(p.relatedTasks).filter(t => fs.existsSync(taskDir(root, t)))
  fs.writeFileSync(taskMdPath(root, name), serializeTaskMd({
    name,
    status: TASK_STATUS_PENDING,
    handler,
    repo,
    tags,
    related_tasks: relatedTasks,
    created_at: now,
    updated_at: now,
  }, content), 'utf-8')
  appendTaskTrace(root, name, { ts: now, type: 'task-created', message: '创建任务' })

  // 创建时填写的任务上下文 → 初始上下文文件
  const contextContent = typeof p.context === 'string' ? p.context.trim() : ''
  if (contextContent) {
    const contextName = '初始上下文'
    fs.writeFileSync(path.join(taskContextDir(root, name), `${contextName}.md`), contextContent + '\n', 'utf-8')
    appendTaskTrace(root, name, { ts: now, type: 'context-created', name: contextName, message: `新增上下文：${contextName}` })
  }

  return { success: true, task: { name, status: TASK_STATUS_PENDING, handler, repo, tags, relatedTasks, createdAt: now, updatedAt: now } }
}

// 更新任务：以解析出的原始 frontmatter 为基底增量更新（未知字段原样保留），
// 状态机仅前进；未提供的字段按全量覆写语义处理（CLI 侧负责回填原值）
export function updateTask(root: string, payload: TaskWritePayload): { success: true; task: TaskSummary } | Failed {
  // 运行时容错外部输入
  const p = payload || {}
  const name = sanitizeTaskName(p.name)
  if (!name) return { success: false, error: '非法任务名称' }
  const existing = readTaskFile(root, name)
  if (!existing) return { success: false, error: `任务不存在: ${name}` }
  const content = typeof p.content === 'string' ? p.content.trim() : ''
  if (!content) return { success: false, error: '任务内容不能为空' }
  const handler = typeof p.handler === 'string' ? p.handler.trim() : ''
  const repo = normalizeTaskStringArray(p.repo)
  const tags = normalizeTaskStringArray(p.tags)
  // 关联任务：仅收录当前已存在的任务名（排除自身）
  const relatedTasks = normalizeTaskStringArray(p.relatedTasks).filter(t => t !== name && fs.existsSync(taskDir(root, t)))

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
  const changedFields: string[] = []
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
  const frontmatter = { ...existing.raw }
  frontmatter.name = name
  frontmatter.status = nextStatus
  frontmatter.handler = handler
  frontmatter.repo = repo
  frontmatter.tags = tags
  frontmatter.related_tasks = relatedTasks
  frontmatter.updated_at = now
  fs.writeFileSync(taskMdPath(root, name), serializeTaskMd(frontmatter, content), 'utf-8')

  // 事件顺序：先字段变更后状态变更——字段变更（如指定处理人）是因，状态推进是果
  if (changedFields.length) {
    appendTaskTrace(root, name, { ts: now, type: 'task-updated', fields: changedFields, message: `更新字段：${changedFields.join('、')}` })
  }
  if (statusChanged) {
    appendTaskTrace(root, name, { ts: now, type: 'status-changed', from: existing.status, to: nextStatus, message: `状态变更：${existing.status} → ${nextStatus}` })
  }

  return { success: true, task: { name, status: nextStatus, handler, repo, tags, relatedTasks, createdAt: existing.createdAt, updatedAt: now } }
}

// 全文检索：任务正文 + 每个上下文正文。
// 与列表关键词的分工：列表只过摘要字段（与桌面端任务库一致），
// 这里负责正文维度；只输出命中位置与上下文行，不返回全文。
export function searchTasks(root: string, keyword: string, opts?: TaskSearchOpts): { success: true; results: TaskSearchResult[] } | Failed {
  const kw = typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''
  if (!kw) return { success: true, results: [] }
  const top = typeof opts?.top === 'number' && opts.top >= 0 ? opts.top : 5
  const context = typeof opts?.context === 'number' && opts.context >= 0 ? opts.context : 2
  const dir = tasksDir(root)
  if (!fs.existsSync(dir)) return { success: true, results: [] }

  const results: TaskSearchResult[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const task = readTaskFile(root, entry.name)
    if (!task) continue
    if (opts?.status && task.status !== opts.status) continue

    // 检索范围：正文标为「任务内容」，上下文标为其主题名。
    // TASK.md 正文读回时总带一个空行（serializeTaskMd 在 frontmatter 后插了两个 \n，
    // 解析只吞掉一个），不剥掉会让行号比用户看到的内容多一行。
    const stripLeadingBlank = (text: string): string => String(text).replace(/^\n+/, '')
    const sections = [{ where: '任务内容', text: stripLeadingBlank(task.content) }]
    const contextDir = taskContextDir(root, entry.name)
    if (fs.existsSync(contextDir)) {
      for (const ce of fs.readdirSync(contextDir, { withFileTypes: true })) {
        if (!ce.isFile() || !ce.name.endsWith('.md')) continue
        sections.push({
          where: ce.name.slice(0, -3),
          text: fs.readFileSync(path.join(contextDir, ce.name), 'utf-8'),
        })
      }
    }

    const matches: TaskSearchMatch[] = []
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

// 保存任务上下文（upsert：主题已存在则更新，否则新建）
export function saveTaskContext(root: string, payload: TaskContextPayload): { success: true; isUpdate: boolean } | Failed {
  const p = payload || {}
  const taskName = sanitizeTaskName(p.taskName)
  if (!taskName) return { success: false, error: '非法任务名称' }
  const existing = readTaskFile(root, taskName)
  if (!existing) return { success: false, error: `任务不存在: ${taskName}` }
  const contextName = sanitizeTaskName(p.contextName)
  if (!contextName) return { success: false, error: '上下文主题不能为空，且不能包含 / \\ .. 等非法字符' }
  const content = typeof p.content === 'string' ? p.content : ''
  if (!content.trim()) return { success: false, error: '上下文内容不能为空' }

  const contextPath = path.join(taskContextDir(root, taskName), `${contextName}.md`)
  const isUpdate = fs.existsSync(contextPath)
  fs.mkdirSync(taskContextDir(root, taskName), { recursive: true })
  fs.writeFileSync(contextPath, content.trim() + '\n', 'utf-8')

  const now = new Date().toISOString()
  const frontmatter = { ...existing.raw }
  frontmatter.updated_at = now
  fs.writeFileSync(taskMdPath(root, taskName), serializeTaskMd(frontmatter, existing.content), 'utf-8')
  appendTaskTrace(root, taskName, {
    ts: now,
    type: isUpdate ? 'context-updated' : 'context-created',
    name: contextName,
    message: `${isUpdate ? '更新' : '新增'}上下文：${contextName}`,
  })
  return { success: true, isUpdate }
}
