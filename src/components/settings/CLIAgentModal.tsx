import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { Type, Bot, FileCode, MessageSquare, CheckCircle, Power } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import type { CLIAgent, CLIAgentType } from '../../types'

interface CLIAgentModalProps {
  isOpen: boolean
  agent: CLIAgent | null
  onSave: (data: Partial<CLIAgent>) => void
  onClose: () => void
}

const AGENT_TYPES: { value: CLIAgentType; label: string }[] = [
  { value: 'claude-cli', label: 'Claude CLI' },
  { value: 'cursor-cli', label: 'Cursor CLI' },
  { value: 'custom', label: 'Custom' },
]

export const CLIAgentModal: FC<CLIAgentModalProps> = ({
  isOpen,
  agent,
  onSave,
  onClose,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'claude-cli' as CLIAgentType,
    executablePath: '',
    description: '',
    isDefault: false,
    isEnabled: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (agent) {
      // 编辑模式：填充现有数据
      setFormData({
        name: agent.name,
        type: agent.type,
        executablePath: agent.executablePath,
        description: agent.description,
        isDefault: agent.isDefault,
        isEnabled: agent.isEnabled,
      })
    } else {
      // 创建模式：重置表单
      setFormData({
        name: '',
        type: 'claude-cli',
        executablePath: '',
        description: '',
        isDefault: false,
        isEnabled: true,
      })
    }
    setErrors({})
  }, [agent, isOpen])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = '请输入 Agent 名称'
    }
    if (!formData.executablePath.trim()) {
      newErrors.executablePath = '请输入可执行文件路径'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validateForm()) return

    onSave({
      name: formData.name.trim(),
      type: formData.type,
      executablePath: formData.executablePath.trim(),
      description: formData.description.trim(),
      isDefault: formData.isDefault,
      isEnabled: formData.isEnabled,
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={agent ? '编辑 CLI Agent' : '添加 CLI Agent'}
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSubmit}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
          >
            保存
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Agent 名称 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <Type size={16} className="text-macos-text-secondary" />
            Agent 名称
          </label>
          <Input
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value })
              if (errors.name) setErrors({ ...errors, name: '' })
            }}
            placeholder="例如：Claude CLI"
            error={errors.name}
          />
        </div>

        {/* Agent 类型 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-2">
            <Bot size={16} className="text-macos-text-secondary" />
            Agent 类型
          </label>
          <div className="grid grid-cols-3 gap-2">
            {AGENT_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData({ ...formData, type: type.value })}
                className={`
                  px-3 py-2 text-sm font-medium rounded-lg border transition-all
                  ${formData.type === type.value
                    ? 'border-gray-400 bg-gray-100 text-gray-800'
                    : 'border-macos-border hover:border-gray-300 hover:bg-gray-50 text-macos-text-secondary'
                  }
                `}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* 可执行文件路径 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <FileCode size={16} className="text-macos-text-secondary" />
            可执行文件路径
          </label>
          <div className="flex gap-2">
            <Input
              value={formData.executablePath}
              onChange={(e) => {
                setFormData({ ...formData, executablePath: e.target.value })
                if (errors.executablePath) setErrors({ ...errors, executablePath: '' })
              }}
              placeholder="/usr/local/bin/claude"
              error={errors.executablePath}
              className="flex-1"
            />
            {/* 浏览按钮（Electron 环境可用） */}
            {typeof window !== 'undefined' && window.electronAPI && (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  // TODO: 实现文件选择对话框
                  console.log('文件选择功能待实现')
                }}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
              >
                浏览
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-macos-text-tertiary">输入可执行文件的完整路径</p>
        </div>

        {/* 描述 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <MessageSquare size={16} className="text-macos-text-secondary" />
            描述
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Agent 功能描述..."
            rows={3}
            className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-macos-text-tertiary focus:outline-none focus:border-gray-400 focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)] resize-none transition-[border-color,box-shadow] duration-200"
          />
        </div>

        {/* 复选框选项 */}
        <div className="space-y-2 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
              className="w-4 h-4 accent-gray-600 border-gray-300 rounded"
            />
            <CheckCircle size={16} className="text-macos-text-secondary" />
            <span className="text-sm text-macos-text">设为默认 Agent</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isEnabled}
              onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
              className="w-4 h-4 accent-gray-600 border-gray-300 rounded"
            />
            <Power size={16} className="text-macos-text-secondary" />
            <span className="text-sm text-macos-text">启用此 Agent</span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
