import type { FC } from 'react'
import { Wand2, Edit3, Trash2, FileCode, FileText, FolderOpen } from 'lucide-react'
import { Card } from '../ui/Card'
import type { SkillFile } from '../../types'

interface SkillCardProps {
  skill: SkillFile
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export const SkillCard: FC<SkillCardProps> = ({ skill, onClick, onEdit, onDelete }) => {
  // 提取技能内容的前 100 个字符作为预览
  const contentPreview = skill.content?.replace(/[#*`]/g, '').slice(0, 100) || ''

  // 计算资源统计
  const hasScripts = skill.scripts && skill.scripts.length > 0
  const hasReferences = skill.references && skill.references.length > 0
  const hasExamples = skill.examples && skill.examples.length > 0

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
            {/* 魔法棒图标 - 紫罗兰色 */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-100">
              <Wand2 size={18} className="text-violet-600" strokeWidth={1.5} />
            </div>
            {/* 名称 */}
            <h3 className="font-bold text-[17px] text-gray-900">
              {skill.name}
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
          {contentPreview || skill.description || '暂无内容'}
        </p>

        {/* 资源统计标签 */}
        {(hasScripts || hasReferences || hasExamples) && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {hasScripts && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-violet-50 text-violet-600">
                <FileCode size={10} />
                scripts ({skill.scripts.length})
              </span>
            )}
            {hasReferences && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
                <FileText size={10} />
                references ({skill.references.length})
              </span>
            )}
            {hasExamples && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-50 text-green-600">
                <FolderOpen size={10} />
                examples ({skill.examples.length})
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}