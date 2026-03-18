import type { FC } from 'react'
import { BookOpen, MessageSquare, FileText, Tag } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { KnowledgeFile } from '../../types'

interface KnowledgeDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  knowledge: KnowledgeFile | null
}

// 知识库详情页使用蓝色主题，区别于能力的黄色
const colorConfig = {
  color: '#3B82F6',     // 蓝色图标
  bgColor: '#DBEAFE',   // 浅蓝色背景
}

export const KnowledgeDetailModal: FC<KnowledgeDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  knowledge,
}) => {
  if (!knowledge) return null

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
          >
            编辑
          </Button>
        </div>
      }
    >
      {/* 头部信息 - 固定在顶部 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        {/* 知识库图标 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colorConfig.bgColor }}
        >
          <BookOpen size={28} style={{ color: colorConfig.color }} />
        </div>

        {/* 知识库信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">{knowledge.name}</h2>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}
            >
              knowledge
            </span>
            <span className="text-sm text-macos-text-tertiary">
              更新于 {formatDate(knowledge.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
        {/* 知识描述 */}
        {knowledge.description && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} />
              知识描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{knowledge.description}</p>
            </div>
          </div>
        )}

        {/* 知识标签 */}
        {knowledge.tags && knowledge.tags.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Tag size={16} />
              知识标签
            </label>
            <div className="flex flex-wrap gap-2">
              {knowledge.tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 知识内容 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <FileText size={16} />
            知识内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            {knowledge.content ? (
              <MarkdownRenderer content={knowledge.content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-4">
                暂无知识内容
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}