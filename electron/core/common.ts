// core 层公共契约入口：聚合各领域（task、skill、knowledge 等）的统一操作与类型。
// 统一契约：原子操作返回 { success: true, ...data } | { success: false, error }，
// 业务校验失败不抛异常；适配层（source/cli、source/desktop）从这里取契约，
// 各自转换为 CLI 异常语义（exit 1/2）或 IPC 透传语义。

export {
  TASK_STATUSES,
  listTasks,
  readTaskDetail,
  createTask,
  updateTask,
  searchTasks,
  saveTaskContext,
} from './task/operate'
export type {
  TaskSummary,
  TaskTraceEvent,
  TaskContextItem,
  TaskDetail,
  TaskWritePayload,
  TaskContextPayload,
  TaskSearchMatch,
  TaskSearchResult,
  TaskSearchOpts,
} from './task/operate'
