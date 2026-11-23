import type { UpdateTaskPayload } from '../types'

// 任务内容保存只改正文，其余字段必须回填：
// core 的 updateTask 为全量覆写语义，payload 缺失的字段会被当作清空。
export interface ContentSaveSource {
  name: string
  content: string
  handler: string
  relatedCodebases: string[]
  tags: string[]
  relatedTasks: string[]
  workflow: string
  workflowInstance: string
}

export const buildContentSavePayload = (task: ContentSaveSource, content: string): UpdateTaskPayload => ({
  name: task.name,
  content,
  handler: task.handler,
  relatedCodebases: task.relatedCodebases,
  tags: task.tags,
  relatedTasks: task.relatedTasks,
  workflow: task.workflow,
  workflowInstance: task.workflowInstance,
})
