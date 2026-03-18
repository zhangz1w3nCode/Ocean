import type { FC } from 'react'
import { FileText, BookOpen, Wrench, Edit3, MessageSquare } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { ResourceFile, ResourceFileType } from '../../types'

interface ResourceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  resource: ResourceFile | null
}

// 资源类型配置
const resourceTypeConfig: Record<
  ResourceFileType,
  { label: string; color: string; bgColor: string; icon: typeof FileText }
> = {
  rule: { label: '规则说明', color: '#007AFF', bgColor: '#E3F2FD', icon: FileText },
  reference: { label: '参考文档', color: '#5856D6', bgColor: '#EDE7F6', icon: BookOpen },
  tool: { label: '工具说明', color: '#34C759', bgColor: '#E8F5E9', icon: Wrench },
}

export const ResourceDetailModal: FC<ResourceDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  resource,
}) => {
  if (!resource) return null

  const config = resourceTypeConfig[resource.type] || resourceTypeConfig.reference
  const Icon = config.icon

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

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
        {/* 资源图标 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: config.bgColor }}
        >
          <Icon size={28} style={{ color: config.color }} strokeWidth={1.5} />
        </div>

        {/* 资源信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">
            {resource.name}
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
            {/* 更新时间 */}
            <span className="text-sm text-macos-text-tertiary">
              {formatDate(resource.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
        {/* 描述 */}
        {resource.description && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} className="text-macos-text-secondary" />
              资源描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{resource.description}</p>
            </div>
          </div>
        )}

        {/* 内容 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <FileText size={16} className="text-macos-text-secondary" />
            资源内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            {resource.content ? (
              <MarkdownRenderer content={resource.content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary">暂无内容</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}