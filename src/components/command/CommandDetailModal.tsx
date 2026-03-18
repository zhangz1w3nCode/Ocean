import type { FC } from 'react'
import { Terminal, MessageSquare, FileText } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { CommandFile } from '../../types'

interface CommandDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  command: CommandFile | null
}

// 命令统一使用深灰色，与主题保持一致
const colorConfig = {
  color: '#374151',
  bgColor: '#E5E7EB',
}

export const CommandDetailModal: FC<CommandDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  command,
}) => {
  if (!command) return null

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
        {/* 命令图标 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colorConfig.bgColor }}
        >
          <Terminal size={28} style={{ color: colorConfig.color }} />
        </div>

        {/* 命令信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">{command.name}</h2>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}
            >
              command
            </span>
            <span className="text-sm text-macos-text-tertiary">
              更新于 {formatDate(command.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
        {/* 命令描述 */}
        {command.description && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} />
              命令描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{command.description}</p>
            </div>
          </div>
        )}

        {/* 命令内容 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <FileText size={16} />
            命令内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            {command.content ? (
              <MarkdownRenderer content={command.content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-4">
                暂无命令内容
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}