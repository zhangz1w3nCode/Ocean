import type { FC } from 'react'
import { Wand2, MessageSquare, FileText } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { SkillFile } from '../../types'

interface SkillDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  skill: SkillFile | null
}

// 技能使用紫罗兰色
const colorConfig = {
  color: '#7C3AED',
  bgColor: '#EDE9FE',
}

export const SkillDetailModal: FC<SkillDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  skill,
}) => {
  if (!skill) return null

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
        {/* 技能图标 - 魔法棒 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colorConfig.bgColor }}
        >
          <Wand2 size={28} style={{ color: colorConfig.color }} />
        </div>

        {/* 技能信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">{skill.name}</h2>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}
            >
              skill
            </span>
            <span className="text-sm text-macos-text-tertiary">
              更新于 {formatDate(skill.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
        {/* 技能描述 */}
        {skill.description && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} />
              技能描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{skill.description}</p>
            </div>
          </div>
        )}

        {/* 技能内容 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <FileText size={16} />
            技能内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            {skill.content ? (
              <MarkdownRenderer content={skill.content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-4">
                暂无技能内容
              </p>
            )}
          </div>
        </div>

        {/* 资源文件统计 */}
        {(skill.scripts?.length || 0) > 0 || (skill.references?.length || 0) > 0 || (skill.examples?.length || 0) > 0 ? (
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs text-macos-text-tertiary">包含资源:</span>
            {skill.scripts && skill.scripts.length > 0 && (
              <span className="px-2 py-0.5 rounded text-xs bg-violet-50 text-violet-600">
                scripts ({skill.scripts.length})
              </span>
            )}
            {skill.references && skill.references.length > 0 && (
              <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
                references ({skill.references.length})
              </span>
            )}
            {skill.examples && skill.examples.length > 0 && (
              <span className="px-2 py-0.5 rounded text-xs bg-green-50 text-green-600">
                examples ({skill.examples.length})
              </span>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}