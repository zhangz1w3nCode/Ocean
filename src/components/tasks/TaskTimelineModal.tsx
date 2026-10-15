import type { FC } from 'react'
import { Modal } from '../ui'
import type { TaskTraceEvent } from '../../types'
import { TaskTimelineVisual } from './TaskTimelineVisual'

interface TaskTimelineModalProps {
  isOpen: boolean
  onClose: () => void
  trace: TaskTraceEvent[]
}

// 可视化时间线弹窗（完整大图）：ReactFlow 纵向节点链，可平移缩放
export const TaskTimelineModal: FC<TaskTimelineModalProps> = ({ isOpen, onClose, trace }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="处理时间线" size="xl" layoutKey="task-timeline" persistLayout>
      <div className="flex-1 min-h-0">
        <TaskTimelineVisual trace={trace} fullHeight />
      </div>
    </Modal>
  )
}
