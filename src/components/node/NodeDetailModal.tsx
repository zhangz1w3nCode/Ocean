import type { FC } from 'react'
import { Square, UserCheck, Edit3, MessageSquare } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { NodeDefinition } from '../../types'

interface NodeDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  node: NodeDefinition | null
}

// 节点类型配置
const nodeTypeConfig: Record<
  string,
  { label: string; color: string; bgColor: string; icon: typeof Square }
> = {
  process: { label: '处理', color: '#007AFF', bgColor: '#E3F2FD', icon: Square },
  business: { label: '业务', color: '#5856D6', bgColor: '#EDE7F6', icon: UserCheck },
}

export const NodeDetailModal: FC<NodeDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  node,
}) => {
  if (!node) return null

  const config = nodeTypeConfig[node.type] || nodeTypeConfig.process
  const Icon = config.icon

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="xl"
      footer={
        <div className="flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500"
          >
            关闭
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
          >
            <Edit3 size={16} className="mr-1.5" />
            编辑
          </Button>
        </div>
      }
    >
      {/* 头部信息 - 固定在顶部 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        {/* 节点图标 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: config.bgColor }}
        >
          <Icon size={28} style={{ color: config.color }} strokeWidth={1.5} />
        </div>

        {/* 节点信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">
            {node.name}
          </h2>
          <div className="flex items-center gap-3">
            {/* 类型标签 */}
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: config.bgColor,
                color: config.color,
              }}
            >
              {config.label}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
        {/* 节点描述 */}
        {node.description && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} className="text-macos-text-secondary" />
              节点描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{node.description}</p>
            </div>
          </div>
        )}

        {/* 节点内容 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <Square size={16} className="text-macos-text-secondary" />
            节点内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            {node.content ? (
              <MarkdownRenderer content={node.content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-4">暂无内容</p>
            )}
          </div>
        </div>

        {/* 如果没有任何内容，显示空状态 */}
        {!node.description && !node.content && (
          <div className="text-center py-8 text-macos-text-tertiary">
            暂无详细信息
          </div>
        )}
      </div>
    </Modal>
  )
}