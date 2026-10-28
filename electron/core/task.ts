// ocean task CLI 侧适配层。
// 业务实现全部在 ./taskStore.cjs —— 与桌面端/网页端的 launch.cjs IPC 薄壳同源，
// 这里只做两件事：按项目根绑定 store、把 { success, error } 契约转成 CLI 的异常语义。

const taskStoreModule = require('./taskStore.cjs')

export const TASK_STATUSES: string[] = taskStoreModule.TASK_STATUSES

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

type StoreResult<T> = { success: boolean; error?: string } & Partial<T>

type Store = {
  listTasks(): StoreResult<{ tasks: TaskSummary[] }>
  readTaskDetail(taskName: string): StoreResult<{ detail: TaskDetail }>
  createTask(payload: TaskWritePayload): StoreResult<{ task: TaskSummary }>
  updateTask(payload: TaskWritePayload): StoreResult<{ task: TaskSummary }>
  saveTaskContext(payload: TaskContextPayload): StoreResult<{ isUpdate: boolean }>
  searchTasks(keyword: string, opts?: { top?: number; context?: number; status?: string }): StoreResult<{ results: TaskSearchResult[] }>
}

function bind(root: string): Store {
  return taskStoreModule.createTaskStore(root) as Store
}

// 业务校验失败（如「任务名称已存在」「状态不能变更」）在 store 内是 { success:false, error }，
// 对 CLI 而言就是执行失败 → 抛出，由 main() 统一按运行时错误（exit 1）输出。
function unwrap<T>(res: StoreResult<T>, fallback: string): T {
  if (!res || res.success !== true) throw new Error(res && res.error ? res.error : fallback)
  return res as T
}

export function listTasks(root: string): TaskSummary[] {
  return unwrap(bind(root).listTasks(), '列出任务失败').tasks || []
}

export function readTaskDetail(root: string, name: string): TaskDetail {
  return unwrap(bind(root).readTaskDetail(name), '读取任务详情失败').detail
}

export function createTask(root: string, payload: TaskWritePayload): TaskSummary {
  return unwrap(bind(root).createTask(payload), '创建任务失败').task
}

export function updateTask(root: string, payload: TaskWritePayload): TaskSummary {
  return unwrap(bind(root).updateTask(payload), '更新任务失败').task
}

export function saveTaskContext(root: string, payload: TaskContextPayload): boolean {
  return !!unwrap(bind(root).saveTaskContext(payload), '保存任务上下文失败').isUpdate
}

// 全文检索任务正文与上下文正文（list --keyword 不覆盖正文维度）
export function searchTasks(
  root: string,
  keyword: string,
  opts?: { top?: number; context?: number; status?: string },
): TaskSearchResult[] {
  return unwrap(bind(root).searchTasks(keyword, opts), '检索任务失败').results || []
}

// 列表过滤：与桌面端任务库同一套语义 —— 状态精确匹配，
// 关键词对 名称/处理人/关联仓库/标签/状态 做大小写不敏感的子串匹配。
export function filterTasks(tasks: TaskSummary[], status?: string, keyword?: string): TaskSummary[] {
  const q = (keyword || '').toLowerCase()
  return tasks.filter((task) => {
    if (status && task.status !== status) return false
    if (!q) return true
    return task.name.toLowerCase().includes(q) ||
      task.handler.toLowerCase().includes(q) ||
      task.repo.some(r => r.toLowerCase().includes(q)) ||
      task.tags.some(t => t.toLowerCase().includes(q)) ||
      task.status.toLowerCase().includes(q)
  })
}
