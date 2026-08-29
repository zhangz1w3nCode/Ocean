export function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    completed: '已完成',
    executing: '执行中',
    idle: '待执行',
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
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 30) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN')
}
