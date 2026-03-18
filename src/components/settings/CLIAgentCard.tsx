import type { FC } from 'react'
import { Edit, Trash2, Zap } from 'lucide-react'
import type { CLIAgent, CLIAgentType } from '../../types'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'

interface CLIAgentCardProps {
  agent: CLIAgent
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
  onSetDefault: () => void
  onToggleEnabled: (enabled: boolean) => void
}

const getAgentTypeBadge = (type: CLIAgentType) => {
  const badges = {
    'claude-cli': { label: 'Claude CLI', className: 'bg-orange-100 text-orange-700' },
    'cursor-cli': { label: 'Cursor CLI', className: 'bg-blue-100 text-blue-700' },
    'custom': { label: 'Custom', className: 'bg-gray-100 text-gray-700' },
  }
  return badges[type] || badges.custom
}

const getStatusColor = (agent: CLIAgent) => {
  if (agent.testStatus === 'testing') return 'bg-yellow-500'
  if (agent.testStatus === 'success' && agent.isEnabled) return 'bg-green-500'
  return 'bg-gray-300'
}

export const CLIAgentCard: FC<CLIAgentCardProps> = ({
  agent,
  onEdit,
  onDelete,
  onTest,
  onSetDefault,
  onToggleEnabled,
}) => {
  const badge = getAgentTypeBadge(agent.type)

  return (
    <div className="group border border-gray-200 rounded-lg p-0 bg-white hover:shadow-md transition-shadow overflow-hidden">
      {/* 头部区域 */}
      <div className="px-4 pb-0 pt-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* 状态指示灯 */}
            <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(agent)}`} />
            {/* 名称 */}
            <h3 className="font-bold text-[17px] text-gray-900">
              {agent.name}
            </h3>
          </div>

          {/* 操作按钮区 */}
          <div className="flex items-center gap-1">
            {/* 测试按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onTest()
              }}
              className="p-1.5 rounded-md hover:bg-gray-100 text-macos-text-secondary opacity-0 group-hover:opacity-100 transition-opacity"
              title="测试可执行文件"
            >
              <Zap size={14} />
            </button>
            {/* 编辑按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="p-1.5 rounded-md hover:bg-gray-100 text-macos-text-secondary opacity-0 group-hover:opacity-100 transition-opacity"
              title="编辑"
            >
              <Edit size={14} />
            </button>
            {/* 删除按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="p-1.5 rounded-md hover:bg-red-50 text-macos-text-secondary hover:text-macos-error opacity-0 group-hover:opacity-100 transition-opacity"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* 类型标签 */}
        <div className="mb-3">
          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${badge.className}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* 内容预览区 - 浅灰色背景 */}
      <div className="mx-4 mb-4 p-4 rounded-lg bg-gray-50">
        <div className="space-y-1">
          <p className="text-xs text-gray-500 truncate">
            <span className="font-medium">路径:</span> {agent.executablePath}
          </p>
          {agent.description && (
            <p className="text-xs text-gray-500 truncate">
              <span className="font-medium">描述:</span> {agent.description}
            </p>
          )}
        </div>

        {/* 开关控制 */}
        <div className="space-y-2 pt-3 mt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">设为默认</span>
            <Switch
              checked={agent.isDefault}
              onChange={onSetDefault}
              size="sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">启用</span>
            <Switch
              checked={agent.isEnabled}
              onChange={(checked) => onToggleEnabled(checked)}
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  )
}