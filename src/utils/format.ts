/**
 * 状态中文映射。同时服务两种语义不同的状态：
 * - 实例整体状态（三态）：pending / running / completed
 * - 节点 trace 事件状态（时间线表）：active / completed / failed
 * 两者仅在 completed 上同形，其余不可混用。
 */
export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    completed: '已完成',
    active: '执行中',
    failed: '失败',
    unknown: '未知',
  }
  return statusMap[status] || status
}

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
