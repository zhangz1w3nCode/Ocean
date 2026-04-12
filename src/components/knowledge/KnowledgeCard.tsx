import type { FC } from 'react'
import { BookOpen, Edit3, Trash2, FolderOpen } from 'lucide-react'
import { Card } from '../ui/Card'
import type { KnowledgeFile } from '../../types'

interface KnowledgeCardProps {
  knowledge: KnowledgeFile
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export const KnowledgeCard: FC<KnowledgeCardProps> = ({ knowledge, onClick, onEdit, onDelete }) => {
  // 提取知识库内容的前 100 个字符作为预览
  const contentPreview = knowledge.content?.replace(/[#*`]/g, '').slice(0, 100) || ''

  return (
    <Card
      className="group relative p-0 cursor-pointer h-full flex flex-col"
      onClick={onClick}
      hoverable={true}
    >
      {/* 头部区域 */}
      <div className="px-4 pb-0 pt-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* BookOpen 图标 */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
              <BookOpen size={18} className="text-gray-600" strokeWidth={1.5} />
            </div>
            {/* 名称 */}
            <h3 className="font-bold text-[17px] text-gray-900">
              {knowledge.name}
            </h3>
          </div>

          {/* 操作按钮区 */}
          <div className="flex items-center gap-1">
            {/* 悬浮时显示的编辑按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.()
              }}
              className="p-1.5 rounded-md hover:bg-gray-100 text-macos-text-secondary opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Edit3 size={14} />
            </button>
            {/* 删除按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.()
              }}
              className="p-1.5 rounded-md hover:bg-red-50 text-macos-text-secondary hover:text-macos-error opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* 标签区域 */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {/* 分类标签 */}
          {knowledge.category && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
              <FolderOpen size={10} />
              {knowledge.category}
            </span>
          )}
          {/* 知识标签 */}
          {knowledge.tags && knowledge.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs"
            >
              {tag}
            </span>
          ))}
          {knowledge.tags && knowledge.tags.length > 3 && (
            <span className="text-xs text-gray-400">
              +{knowledge.tags.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* 内容预览区 - 浅灰色背景 */}
      <div className="flex-1 mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
          {contentPreview || knowledge.description || '暂无内容'}
        </p>
      </div>
    </Card>
  )
}