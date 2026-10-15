import type { FC } from 'react'
import { Modal } from '../ui'
import { formatRelativeTime } from '../../utils/format'
import type { TaskTraceEvent } from '../../types'

// 时间线事件类型标签与徽标配色（列表表格与可视化图共用）
export const traceTypeLabels: Record<string, string> = {
  'task-created': '创建任务',
  'task-updated': '更新字段',
  'status-changed': '状态变更',
  'context-created': '新增上下文',
  'context-updated': '更新上下文',
}

export const traceTypeColors: Record<string, string> = {
  'task-created': 'bg-green-50 text-green-600',
  'task-updated': 'bg-blue-50 text-blue-600',
  'status-changed': 'bg-amber-50 text-amber-600',
  'context-created': 'bg-purple-50 text-purple-600',
  'context-updated': 'bg-gray-100 text-gray-500',
}

// 可视化时间线的节点圆点配色（实心色，与徽标同色系）
const traceDotColors: Record<string, string> = {
  'task-created': 'bg-green-500',
  'task-updated': 'bg-blue-500',
  'status-changed': 'bg-amber-500',
  'context-created': 'bg-purple-500',
  'context-updated': 'bg-gray-400',
}

interface TaskTimelineModalProps {
  isOpen: boolean
  onClose: () => void
  trace: TaskTraceEvent[]
}

// 可视化时间线弹窗：垂直节点连线图，按时间正序完整展示事件流
export const TaskTimelineModal: FC<TaskTimelineModalProps> = ({ isOpen, onClose, trace }) => {
  const sorted = [...trace].sort((a, b) => {
    const cmp = new Date(a.ts).getTime() - new Date(b.ts).getTime()
    return cmp
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="处理时间线" size="xl" layoutKey="task-timeline" persistLayout>
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        {sorted.length > 0 ? (
          <div className="relative pl-1">
            {/* 纵向连线 */}
            <div className="absolute left-[5px] top-3 bottom-3 w-0.5 bg-gray-200" aria-hidden />
            {sorted.map((evt, i) => (
              <div key={i} className="relative flex gap-4 pb-4 last:pb-0">
                <div className={`relative z-10 mt-2 flex-shrink-0 w-3 h-3 rounded-full ${traceDotColors[evt.type] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0 bg-gray-50/60 rounded-lg border border-gray-100 px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${traceTypeColors[evt.type] || 'bg-gray-100 text-gray-500'}`}>
                      {traceTypeLabels[evt.type] || evt.type}
                    </span>
                    <span className="text-xs text-macos-text-tertiary font-mono" title={evt.ts}>
                      {evt.ts ? formatRelativeTime(evt.ts) : '-'}
                    </span>
                  </div>
                  <p className="text-sm text-macos-text break-words">{evt.message || '-'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-macos-text-tertiary text-center py-8">暂无事件记录</p>
        )}
      </div>
    </Modal>
  )
}
