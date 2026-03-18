import type { FC } from 'react'
import { FileText, Edit3, Trash2 } from 'lucide-react'
import { Card } from '../ui/Card'
import type { ResourceFile } from '../../types'

interface ResourceCardProps {
  resource: ResourceFile
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export const ResourceCard: FC<ResourceCardProps> = ({ resource, onClick, onEdit, onDelete }) => {
  // 提取资源内容的前 100 个字符作为预览
  const contentPreview = resource.content?.replace(/[#*`]/g, '').slice(0, 100) || ''

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
            {/* FileText 图标 */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
              <FileText size={18} className="text-gray-600" strokeWidth={1.5} />
            </div>
            {/* 名称 */}
            <h3 className="font-bold text-[17px] text-gray-900">
              {resource.name}
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
      </div>

      {/* 内容预览区 - 浅灰色背景 */}
      <div className="flex-1 mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
          {contentPreview || resource.description || '暂无内容'}
        </p>
      </div>
    </Card>
  )
}
