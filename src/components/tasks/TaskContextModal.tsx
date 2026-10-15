import type { FC } from 'react'
import { Modal, MarkdownRenderer, Button } from '../ui'
import { formatRelativeTime } from '../../utils/format'
import type { TaskContextFile } from '../../types'

interface TaskContextModalProps {
  context: TaskContextFile | null
  onClose: () => void
  /** 编辑回调：进入更新上下文弹窗（同名覆盖） */
  onEdit?: (context: TaskContextFile) => void
}

// 上下文查看弹窗（Markdown 渲染），footer 提供编辑入口
export const TaskContextModal: FC<TaskContextModalProps> = ({ context, onClose, onEdit }) => {
  if (!context) return null

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={context.name}
      size="lg"
      layoutKey="task-context"
      persistLayout
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(context)}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              编辑
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
        <span className="text-xs text-macos-text-tertiary">
          更新于 {context.updatedAt ? formatRelativeTime(context.updatedAt) : '-'}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {context.content ? (
          <MarkdownRenderer content={context.content} className="text-sm" />
        ) : (
          <p className="text-sm text-macos-text-tertiary text-center py-8">上下文内容为空</p>
        )}
      </div>
    </Modal>
  )
}
