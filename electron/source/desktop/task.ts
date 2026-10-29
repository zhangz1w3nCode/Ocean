import * as taskCore from '../../core/task'
import type { TaskSummary, TaskStatus, TaskContextItem, TaskTraceEvent, TaskDetail, TaskWritePayload, TaskContextPayload, TaskResult } from '../../core/task'

// 桌面端适配层：被渲染进程经 src/stores/taskStore.ts 内嵌 loadDesktopModule 直接 require（nodeIntegration）。
// 入口职责：参数形状校验拦截（类型/必填/可选字段类型），拦截失败返回 { success: false }，不抛异常
// 出口职责：透传 core 统一契约（{ success: true, ...data } | { success: false, error }）。
// root 由 store 层从项目状态传入，本层无状态。
// GUI 调用面即以下 5 个方法（全文检索 search 是 CLI 独有能力，不在桌面端暴露）。

export type { TaskSummary, TaskStatus, TaskContextItem, TaskTraceEvent, TaskDetail, TaskWritePayload, TaskContextPayload, TaskResult }

function bad(error: string): { success: false; error: string } {
  return { success: false, error }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// 可选 string 字段类型检查（对齐 CLI 侧语义：未提供=保留原值，提供了就必须是字符串）
// 返回错误文案或 null（通过）
function checkOptionalString(v: unknown, label: string): string | null {
  if (v == null) return null
  if (typeof v !== 'string') return `${label}必须是字符串`
  return null
}

// 可选 string[] 字段类型检查
function checkOptionalStringArray(v: unknown, label: string): string | null {
  if (v == null) return null
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return `${label}必须是字符串数组`
  return null
}

export async function listTasks(root: string): Promise<TaskResult<{ tasks: TaskSummary[] }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  return taskCore.listTasks(root)
}

export async function readTaskDetail(root: string, taskName: string): Promise<TaskResult<{ detail: TaskDetail }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!isNonEmptyString(taskName)) return bad('任务名称不能为空')
  return taskCore.readTaskDetail(root, taskName)
}

export async function createTask(root: string, payload: TaskWritePayload): Promise<TaskResult<{ task: TaskSummary }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!payload || typeof payload !== 'object') return bad('创建参数无效')
  if (!isNonEmptyString(payload.name)) return bad('任务名称不能为空')
  if (typeof payload.content !== 'string' || !payload.content.trim()) return bad('任务内容不能为空')
  const e1 = checkOptionalString(payload.handler, '处理人')
  if (e1) return bad(e1)
  const e2 = checkOptionalString(payload.context, '初始上下文')
  if (e2) return bad(e2)
  const e3 = checkOptionalStringArray(payload.relatedCodebases, '关联仓库')
  if (e3) return bad(e3)
  const e4 = checkOptionalStringArray(payload.tags, '标签')
  if (e4) return bad(e4)
  const e5 = checkOptionalStringArray(payload.relatedTasks, '关联任务')
  if (e5) return bad(e5)
  return taskCore.createTask(root, payload)
}

export async function updateTask(root: string, payload: TaskWritePayload): Promise<TaskResult<{ task: TaskSummary }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!payload || typeof payload !== 'object') return bad('更新参数无效')
  if (!isNonEmptyString(payload.name)) return bad('任务名称不能为空')
  if (typeof payload.content !== 'string' || !payload.content.trim()) return bad('任务内容不能为空')
  const e1 = checkOptionalString(payload.handler, '处理人')
  if (e1) return bad(e1)
  const e2 = checkOptionalStringArray(payload.relatedCodebases, '关联仓库')
  if (e2) return bad(e2)
  const e3 = checkOptionalStringArray(payload.tags, '标签')
  if (e3) return bad(e3)
  const e4 = checkOptionalStringArray(payload.relatedTasks, '关联任务')
  if (e4) return bad(e4)
  if (payload.status != null && !(taskCore.TASK_STATUSES as readonly string[]).includes(String(payload.status))) {
    return bad(`无效的状态: ${String(payload.status)}，可选: ${taskCore.TASK_STATUSES.join(' | ')}`)
  }
  return taskCore.updateTask(root, payload)
}

export async function saveTaskContext(root: string, payload: TaskContextPayload): Promise<TaskResult<{ isUpdate: boolean }>> {
  if (!isNonEmptyString(root)) return bad('项目根路径无效')
  if (!payload || typeof payload !== 'object') return bad('上下文参数无效')
  if (!isNonEmptyString(payload.taskName)) return bad('任务名称不能为空')
  if (!isNonEmptyString(payload.contextName)) return bad('上下文主题不能为空')
  if (typeof payload.content !== 'string' || !payload.content.trim()) return bad('上下文内容不能为空')
  return taskCore.saveTaskContext(root, payload)
}
