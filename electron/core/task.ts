// 任务存储 core —— CLI（source/cli/task.ts）与桌面端（source/desktop/task.ts）共用的唯一实现。
//
// 契约（对齐 codebases.ts 样板）：全 async，统一返回 { success: true, ...data } | { success: false, error }；
// IO 异常经 guard 收敛为 { success: false, error: 'IO 错误: ...' }，不向调用方抛出——
// renderer 直连后 store 侧裸消费会 unhandled rejection，这是 PR#112 审核实测复现过的静默故障面。
//
// 数据格式与状态机语义自 electron/core/taskStore.cjs 原样平移（迁移基线探针 2026-10-29 实测录制）：
//   .tasks/{task-name}/TASK.md           — YAML frontmatter 记录元信息，正文为任务内容
//   .tasks/{task-name}/context/*.md      — 任务上下文（多个独立 markdown 文件）
//   .tasks/{task-name}/trace/trace.jsonl — 操作记录与事件流（追加式紧凑 JSON 行）
// 仅「直接包含 TASK.md 的一级子目录」视为任务，日期归档目录（.tasks/{YYYY-MM-DD}/）自动排除。
// 状态机仅前进：等待处理 --(手动 或 处理人由空变有自动)--> 处理中 --(手动)--> 已完成 | 已取消；
// 等待处理也可直接手动流转到终态；终态锁定；手动选择优先于自动规则。

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as YAML from 'yaml'

export const TASK_STATUS_PENDING = '等待处理'
export const TASK_STATUS_RUNNING = '处理中'
export const TASK_STATUS_COMPLETED = '已完成'
export const TASK_STATUS_CANCELLED = '已取消'
export const TASK_STATUSES = [TASK_STATUS_PENDING, TASK_STATUS_RUNNING, TASK_STATUS_COMPLETED, TASK_STATUS_CANCELLED] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskSummary {
  name: string
  status: TaskStatus
  handler: string
  relatedCodebases: string[]
  tags: string[]
  relatedTasks: string[]
  createdAt: string
  updatedAt: string
}

export interface TaskContextItem {
  name: string
  content: string
  updatedAt: string
}

export interface TaskTraceEvent {
  ts: string
  type: string
  message: string
  fields?: string[]
  from?: string
  to?: string
  name?: string
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
  relatedCodebases?: string[]
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

export interface TaskSearchOptions {
  top?: number
  context?: number
  status?: string
}

export type TaskResult<T> = ({ success: true } & T) | { success: false; error: string }

export function dir(root: string): string {
  return path.join(root, '.tasks')
}

function taskDir(root: string, name: string): string {
  return path.join(dir(root), name)
}

function taskMdPath(root: string, name: string): string {
  return path.join(dir(root), name, 'TASK.md')
}

function taskContextDir(root: string, name: string): string {
  return path.join(dir(root), name, 'context')
}

function taskTracePath(root: string, name: string): string {
  return path.join(dir(root), name, 'trace', 'trace.jsonl')
}

// IO 异常收敛统一契约：任何 fs 异常都转为 { success: false, error }，不向调用方抛出
async function guard<T>(fn: () => Promise<TaskResult<T>>): Promise<TaskResult<T>> {
  try {
    return await fn()
  } catch (e: any) {
    return { success: false, error: e?.message ? `IO 错误: ${e.message}` : String(e) }
  }
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
    const frontmatter = (YAML.parse(match[1]) || {}) as Record<string, unknown>
    return { frontmatter, body: match[2] }
  } catch {
    return { frontmatter: {}, body: raw }
  }
}

// 序列化 TASK.md：yaml 库处理多行内容与特殊字符，禁止手拼字符串。
// 数组字段（tags/related_codebases 等）一律流式 [ a, b ] / []，不用块式 - 列表。
function serializeTaskMd(frontmatter: Record<string, unknown>, body: string): string {
  const doc = new YAML.Document(frontmatter)
  YAML.visit(doc, { Seq(_key: any, node: any) { node.flow = true; return undefined } })
  const yamlText = String(doc)
  const trimmedBody = typeof body === 'string' ? body.replace(/\s+$/, '') : ''
  return `---\n${yamlText}---\n\n${trimmedBody ? trimmedBody + '\n' : ''}`
}

// 字符串数组归一化：去空去重，上限 20 项（related_codebases/tags 共用）
function normalizeTaskStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const s = String(item).trim()
    if (s && !seen.has(s)) { seen.add(s); result.push(s) }
  }
  return result.slice(0, 20)
}

// frontmatter 数组字段读取（容错：单值/数组/null → 数组）
function readTaskArrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (value == null || value === '') return []
  return [String(value)]
}

interface InternalTask {
  name: string
  status: TaskStatus
  handler: string
  relatedCodebases: string[]
  tags: string[]
  relatedTasks: string[]
  content: string
  createdAt: string
  updatedAt: string
  _raw: Record<string, unknown>
}

// 读取单个任务（TASK.md 不存在返回 null）
function readTaskFile(root: string, taskName: string): InternalTask | null {
  const mdPath = taskMdPath(root, taskName)
  if (!fs.existsSync(mdPath)) return null
  const raw = fs.readFileSync(mdPath, 'utf-8')
  const { frontmatter, body } = parseTaskMd(raw)
  const status = frontmatter.status
  return {
    name: String(frontmatter.name || taskName),
    status: (TASK_STATUSES as readonly string[]).includes(String(status)) ? (status as TaskStatus) : TASK_STATUS_PENDING,
    handler: frontmatter.handler != null ? String(frontmatter.handler).trim() : '',
    relatedCodebases: readTaskArrayField(frontmatter.related_codebases),
    tags: readTaskArrayField(frontmatter.tags),
    relatedTasks: readTaskArrayField(frontmatter.related_tasks),
    content: body,
    createdAt: frontmatter.created_at != null ? String(frontmatter.created_at) : '',
    updatedAt: frontmatter.updated_at != null ? String(frontmatter.updated_at) : '',
    _raw: frontmatter,
  }
}

// 任务摘要（列表与 IPC 返回的公共结构）
function taskSummaryOf(task: InternalTask, dirName?: string): TaskSummary {
  return {
    name: dirName || task.name,
    status: task.status,
    handler: task.handler,
    relatedCodebases: task.relatedCodebases,
    tags: task.tags,
    relatedTasks: task.relatedTasks,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

// 确保任务根目录存在（写入路径使用）
function ensureTasksDir(root: string): void {
  const d = dir(root)
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
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
    try { events.push(JSON.parse(line)) } catch {}
  }
  return events
}

// 任务列表：仅收录直接包含 TASK.md 的一级子目录，按更新时间倒序
export async function listTasks(root: string): Promise<TaskResult<{ tasks: TaskSummary[] }>> {
  return guard<{ tasks: TaskSummary[] }>(async () => {
    const tasksDir = dir(root)
    if (!fs.existsSync(tasksDir)) return { success: true, tasks: [] }
    const tasks: TaskSummary[] = []
    for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const task = readTaskFile(root, entry.name)
      if (!task) continue
      tasks.push(taskSummaryOf(task, entry.name))
    }
    tasks.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    return { success: true, tasks }
  })
}

export async function readTaskDetail(root: string, taskName: string): Promise<TaskResult<{ detail: TaskDetail }>> {
  return guard<{ detail: TaskDetail }>(async () => {
    const name = sanitizeTaskName(taskName)
    if (!name) return { success: false, error: '非法任务名称' }
    const task = readTaskFile(root, name)
    if (!task) return { success: false, error: `任务不存在: ${name}` }
    const contextDir = taskContextDir(root, name)
    const contexts: TaskContextItem[] = []
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
    return { success: true, detail: { task: { ...taskSummaryOf(task, name), content: task.content }, contexts, trace: readTaskTraceEvents(root, name) } }
  })
}

export async function createTask(root: string, payload: TaskWritePayload): Promise<TaskResult<{ task: TaskSummary }>> {
  return guard<{ task: TaskSummary }>(async () => {
    const p = payload || {}
    const name = sanitizeTaskName(p.name)
    if (!name) return { success: false, error: '任务名称不能为空，且不能包含 / \\ .. 等非法字符' }
    const content = typeof p.content === 'string' ? p.content.trim() : ''
    if (!content) return { success: false, error: '任务内容不能为空' }
    if (fs.existsSync(taskDir(root, name))) return { success: false, error: '任务名称已存在' }

    ensureTasksDir(root)
    fs.mkdirSync(taskContextDir(root, name), { recursive: true })
    fs.mkdirSync(path.dirname(taskTracePath(root, name)), { recursive: true })

    const now = new Date().toISOString()
    const handler = typeof p.handler === 'string' ? p.handler.trim() : ''
    const relatedCodebases = normalizeTaskStringArray(p.relatedCodebases)
    const tags = normalizeTaskStringArray(p.tags)
    // 关联任务：仅收录当前已存在的任务名，防止引用不存在的任务
    const relatedTasks = normalizeTaskStringArray(p.relatedTasks).filter(t => fs.existsSync(taskDir(root, t)))
    fs.writeFileSync(taskMdPath(root, name), serializeTaskMd({
      name,
      status: TASK_STATUS_PENDING,
      handler,
      related_codebases: relatedCodebases,
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

    return { success: true, task: { name, status: TASK_STATUS_PENDING, handler, relatedCodebases, tags, relatedTasks, createdAt: now, updatedAt: now } }
  })
}

export async function updateTask(root: string, payload: TaskWritePayload): Promise<TaskResult<{ task: TaskSummary }>> {
  return guard<{ task: TaskSummary }>(async () => {
    const p = payload || {}
    const name = sanitizeTaskName(p.name)
    if (!name) return { success: false, error: '非法任务名称' }
    const existing = readTaskFile(root, name)
    if (!existing) return { success: false, error: `任务不存在: ${name}` }
    const content = typeof p.content === 'string' ? p.content.trim() : ''
    if (!content) return { success: false, error: '任务内容不能为空' }
    const handler = typeof p.handler === 'string' ? p.handler.trim() : ''
    const relatedCodebases = normalizeTaskStringArray(p.relatedCodebases)
    const tags = normalizeTaskStringArray(p.tags)
    // 关联任务：仅收录当前已存在的任务名（排除自身）
    const relatedTasks = normalizeTaskStringArray(p.relatedTasks).filter(t => t !== name && fs.existsSync(taskDir(root, t)))

    // 状态机（仅前进）：
    //   等待处理 --(手动 或 处理人由空变有自动)--> 处理中 --(手动)--> 已完成 | 已取消；
    //   等待处理也可直接手动流转到已完成/已取消；终态锁定；手动选择优先于自动规则；
    //   等待处理 → 处理中 需先指定任务处理人
    let nextStatus: TaskStatus = existing.status
    const requested = typeof p.status === 'string' && (TASK_STATUSES as readonly string[]).includes(p.status) ? (p.status as TaskStatus) : null
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
    if (JSON.stringify(relatedCodebases) !== JSON.stringify(existing.relatedCodebases)) changedFields.push('关联仓库')
    if (JSON.stringify(tags) !== JSON.stringify(existing.tags)) changedFields.push('标签')
    if (JSON.stringify(relatedTasks) !== JSON.stringify(existing.relatedTasks)) changedFields.push('关联任务')
    const statusChanged = nextStatus !== existing.status
    if (!changedFields.length && !statusChanged) {
      return { success: true, task: taskSummaryOf(existing, name) }
    }

    // 以解析出的原始 frontmatter 为基底增量更新，未知字段原样保留；
    // 旧字段名 repo 已废弃（不做兼容），写入时一并清除
    const frontmatter = { ...existing._raw }
    delete frontmatter.repo
    frontmatter.name = name
    frontmatter.status = nextStatus
    frontmatter.handler = handler
    frontmatter.related_codebases = relatedCodebases
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

    return { success: true, task: { name, status: nextStatus, handler, relatedCodebases, tags, relatedTasks, createdAt: existing.createdAt, updatedAt: now } }
  })
}

// 全文检索：任务正文 + 每个上下文正文。
// 与列表关键词的分工：列表只过摘要字段（与桌面端任务库一致），这里补正文维度；
// 只输出命中位置与上下文行，不返回全文。
export async function searchTasks(root: string, keyword: string, opts?: TaskSearchOptions): Promise<TaskResult<{ results: TaskSearchResult[] }>> {
  return guard<{ results: TaskSearchResult[] }>(async () => {
    const kw = typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''
    if (!kw) return { success: true, results: [] }
    const top = typeof opts?.top === 'number' && opts.top >= 0 ? opts.top : 5
    const context = typeof opts?.context === 'number' && opts.context >= 0 ? opts.context : 2
    const tasksDir = dir(root)
    if (!fs.existsSync(tasksDir)) return { success: true, results: [] }

    const results: TaskSearchResult[] = []
    for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const task = readTaskFile(root, entry.name)
      if (!task) continue
      if (opts?.status && task.status !== opts.status) continue

      // 检索范围：正文标为「任务内容」，上下文标为其主题名。
      // TASK.md 正文读回时总带一个空行（serializeTaskMd 在 frontmatter 后插了两个 \n，
      // 解析只吞掉一个），不剥掉会让行号比用户看到的内容多一行。
      const stripLeadingBlank = (text: string): string => String(text).replace(/^\n+/, '')
      const sections: Array<{ where: string; text: string }> = [{ where: '任务内容', text: stripLeadingBlank(task.content) }]
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
  })
}

export async function saveTaskContext(root: string, payload: TaskContextPayload): Promise<TaskResult<{ isUpdate: boolean }>> {
  return guard<{ isUpdate: boolean }>(async () => {
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
    const frontmatter = { ...existing._raw }
    frontmatter.updated_at = now
    fs.writeFileSync(taskMdPath(root, taskName), serializeTaskMd(frontmatter, existing.content), 'utf-8')
    appendTaskTrace(root, taskName, {
      ts: now,
      type: isUpdate ? 'context-updated' : 'context-created',
      name: contextName,
      message: `${isUpdate ? '更新' : '新增'}上下文：${contextName}`,
    })
    return { success: true, isUpdate }
  })
}
