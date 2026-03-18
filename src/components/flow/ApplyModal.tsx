import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { Terminal, ArrowRight, CheckCircle2, Edit3, Eye, Type } from 'lucide-react'
import { Modal, Button, MarkdownEditor, MarkdownRenderer, Input } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useCommandStore } from '../../stores/commandStore'
import type { CommandFile } from '../../types'

interface ApplyModalProps {
  isOpen: boolean
  onClose: () => void
  workflowName: string
  workflowId: string | null
}

type ApplyTarget = 'command' | null

export const ApplyModal: FC<ApplyModalProps> = ({
  isOpen,
  onClose,
  workflowName,
  workflowId,
}) => {
  const { addToast } = useToastStore()
  const { commandFiles, addCommandFile } = useCommandStore()
  const [selectedTarget, setSelectedTarget] = useState<ApplyTarget>(null)
  const [isCreating, setIsCreating] = useState(false)
  // 编辑/预览模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview')
  // 命令名称（可编辑）
  const [commandName, setCommandName] = useState('')
  // 命令内容（可编辑）
  const [commandContent, setCommandContent] = useState('')

  // 根据当前工作流名称生成工作流路径
  const workflowPath = `.claude/workflows/${workflowName}/WORKFLOW.md`

  // 生成默认命令内容
  const generateDefaultContent = () => `# 用户需求
- $ARGUMENTS

# 工作流
- 位置：\`${workflowPath}\`

# 强制要求
- 强制按照\`工作流\`的内容执行

# 禁止事项
- 不按照强制按照\`工作流\`的内容执行 注意替换内容中的工作流位置
`

  // 弹窗打开时初始化内容
  useEffect(() => {
    if (isOpen) {
      // 生成默认命令名称
      const baseName = workflowName.toLowerCase().replace(/\s+/g, '-')
      setCommandName(`execute-${baseName}-workflow`)
      setCommandContent(generateDefaultContent())
      setViewMode('preview') // 默认显示预览模式
    }
  }, [isOpen, workflowName])

  const applyTargets = [
    {
      id: 'command' as const,
      name: '命令',
      description: '创建一个命令，引用当前工作流',
      icon: Terminal,
      color: 'bg-gray-100 text-gray-600',
    },
  ]


  const handleCreateCommand = async () => {
    if (!workflowId) {
      addToast('工作流ID无效', 'error')
      return
    }

    setIsCreating(true)

    try {
      // 确保名称唯一
      let finalCommandName = commandName.trim()
      let counter = 1
      const existingNames = commandFiles.map((c) => c.name)
      while (existingNames.includes(finalCommandName)) {
        finalCommandName = `${commandName.trim()}-${counter}`
        counter++
      }

      // 创建命令
      const newCommand: CommandFile = {
        id: `cmd-${Date.now()}`,
        name: finalCommandName,
        description: `执行 "${workflowName}" 工作流的命令`,
        content: commandContent,
        type: 'command',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await addCommandFile(newCommand)

      addToast('命令创建成功', 'success')
      onClose()
    } catch (error) {
      console.error('创建命令失败:', error)
      addToast('创建命令失败，请重试', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const handleConfirm = () => {
    if (selectedTarget === 'command') {
      handleCreateCommand()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="应用到"
      size="xl"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isCreating}>
            取消
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedTarget || isCreating}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? '创建中...' : '确认'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          选择要将工作流 "{workflowName}" 应用到哪个模块
        </p>

        <div className="space-y-2">
          {applyTargets.map((target) => {
            const Icon = target.icon
            const isSelected = selectedTarget === target.id

            return (
              <button
                key={target.id}
                onClick={() => setSelectedTarget(target.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-gray-400 bg-gray-50'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${target.color}`}
                >
                  <Icon size={24} />
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">{target.name}</h3>
                  <p className="text-sm text-gray-500">{target.description}</p>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
                    <CheckCircle2 size={14} className="text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {selectedTarget === 'command' && (
          <div className="mt-4 space-y-4">
            {/* 命令名称 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <Type size={16} className="text-gray-500" />
                命令名称 *
              </label>
              <Input
                placeholder="输入命令名称..."
                value={commandName}
                onChange={(e) => setCommandName(e.target.value)}
              />
            </div>

            {/* 编辑/预览切换 */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">命令内容预览（可编辑）：</h4>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'edit'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Edit3 size={14} />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'preview'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye size={14} />
                  预览
                </button>
              </div>
            </div>

            {/* 编辑模式 */}
            {viewMode === 'edit' && (
              <MarkdownEditor
                value={commandContent}
                onChange={(e) => setCommandContent(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            )}

            {/* 预览模式 */}
            {viewMode === 'preview' && (
              <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[300px] overflow-y-auto">
                {commandContent.trim() ? (
                  <MarkdownRenderer content={commandContent} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">
                    暂无内容
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
