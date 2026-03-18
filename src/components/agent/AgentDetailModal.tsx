import type { FC } from 'react'
import { Bot, Edit3, Cpu, Palette, FileText } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { AgentFile } from '../../types'

interface AgentDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  agent: AgentFile | null
}

// 颜色配置
const colorConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  blue: { label: '蓝色', color: '#007AFF', bgColor: '#E3F2FD' },
  green: { label: '绿色', color: '#34C759', bgColor: '#E8F5E9' },
  purple: { label: '紫色', color: '#5856D6', bgColor: '#EDE7F6' },
  yellow: { label: '黄色', color: '#FF9500', bgColor: '#FFF3E0' },
  red: { label: '红色', color: '#FF3B30', bgColor: '#FFEBEE' },
  orange: { label: '橙色', color: '#FF9500', bgColor: '#FFF3E0' },
}

// model 配置
const modelConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  haiku: { label: 'Haiku', color: '#34C759', bgColor: '#E8F5E9' },
  sonnet: { label: 'Sonnet', color: '#FF9500', bgColor: '#FFF3E0' },
  opus: { label: 'Opus', color: '#FF3B30', bgColor: '#FFEBEE' },
}

export const AgentDetailModal: FC<AgentDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  agent,
}) => {
  if (!agent) return null

  const colorCfg = colorConfig[agent.color] || colorConfig.blue
  const modelCfg = modelConfig[agent.model] || modelConfig.haiku

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
        {/* 智能体图标 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colorCfg.bgColor }}
        >
          <Bot size={28} style={{ color: colorCfg.color }} strokeWidth={1.5} />
        </div>

        {/* 智能体信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">
            {agent.name}
          </h2>
          <div className="flex items-center gap-3">
            {/* 类型标签 */}
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: colorCfg.bgColor,
                color: colorCfg.color,
              }}
            >
              sub-agent
            </span>
            {/* model 标签 */}
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: modelCfg.bgColor,
                color: modelCfg.color,
              }}
            >
              {modelCfg.label}
            </span>
            {/* 更新时间 */}
            <span className="text-sm text-macos-text-tertiary">
              {formatDate(agent.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
        {/* 描述 */}
        {agent.description && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <FileText size={16} className="text-macos-text-secondary" />
              智能体描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{agent.description}</p>
            </div>
          </div>
        )}

        {/* 模型和颜色信息 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Cpu size={16} className="text-macos-text-secondary" />
              模型
            </label>
            <div className="bg-gray-50 rounded-lg p-3 flex items-center h-11">
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: modelCfg.bgColor,
                  color: modelCfg.color,
                }}
              >
                {modelCfg.label}
              </span>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Palette size={16} className="text-macos-text-secondary" />
              图标颜色
            </label>
            <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2 h-11">
              <span
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: colorCfg.color }}
              />
              <span className="text-sm text-macos-text-secondary">{colorCfg.label}</span>
            </div>
          </div>
        </div>

        {/* 内容 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <Bot size={16} className="text-macos-text-secondary" />
            角色指令内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            {agent.content ? (
              <MarkdownRenderer content={agent.content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary">暂无内容</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}