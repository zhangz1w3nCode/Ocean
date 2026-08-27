import type { FC } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Edit3, FileText } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { SkillResource } from '../../types'

interface SkillResourceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  resource: SkillResource | null
  tabLabel?: string
  TabIcon?: LucideIcon
  tabColor?: string
}

export const SkillResourceDetailModal: FC<SkillResourceDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  resource,
  tabLabel = '资源',
  TabIcon = FileText,
  tabColor = 'text-gray-500',
}) => {
  if (!resource) return null

  const Icon = TabIcon

  return (
    <Modal
      layoutKey="skill-resource"
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="lg"
      footer={
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
          <Button variant="outline" size="sm" onClick={onEdit} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg">
            <Edit3 size={16} className="mr-1.5" />
            编辑
          </Button>
        </div>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <Icon size={16} className={tabColor} />
            {tabLabel}文件
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-mono text-gray-700">{resource.name}</p>
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <FileText size={16} className="text-macos-text-secondary" />
            文件内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4 min-h-[100px]">
            {resource.content?.trim() ? (
              <MarkdownRenderer content={resource.content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-4">
                暂无内容
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
