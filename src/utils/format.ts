export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    completed: '已完成',
    active: '执行中',
    executing: '执行中',
    idle: '待执行',
    awaitingchoice: '等待选择',
    awaiting_choice: '等待选择',
    aborted: '已中止',
    failed: '失败',
    'in-progress': '进行中',
    unknown: '未知',
  }
  return statusMap[status] || status
}

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
