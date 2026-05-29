import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { FileText, Type, PenLine, Bot, Loader2, Wand2 } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { isElectron, loadWorkflowTemplateFile } from '../../utils/storage'
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../agent/AgentLoopLogger'

// 创建模式类型
type CreateMode = 'select' | 'manual' | 'agentic'

interface CreateWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (name: string, description: string) => void
  existingNames?: string[]
}

export const CreateWorkflowModal: FC<CreateWorkflowModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  existingNames = [],
}) => {
  const { addToast } = useToastStore()
  const { agenticConfig, loadAgenticConfig } = useSettingsStore()
  const { currentProject } = useProjectStore()

  // 创建模式
  const [createMode, setCreateMode] = useState<CreateMode>('select')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Agentic 创建的用户描述
  const [userDescription, setUserDescription] = useState('')

  // 使用 useAgentLoop hook
  const {
    steps: agenticSteps,
    isRunning: isAgenticRunning,
    expandedSteps,
    toggleStepExpand,
    clearSteps: clearAgenticSteps,
    execute: executeAgenticLoop,
    abort: abortAgenticLoop,
  } = useAgentLoop({
    onComplete: (result) => {
      if (result.success && result.result) {
        setDescription(result.result)
        setCreateMode('manual')
        addToast('创建成功', 'success')
      } else {
        addToast(result.error || 'Agentic 执行失败', 'error')
      }
    },
    onError: (error) => {
      addToast(error.message || 'Agentic 执行失败', 'error')
    }
  })

  // 验证失败的字段
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)

  // 返回选择确认弹窗状态
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  // 初始数据快照（用于检测是否有修改）
  const initialSnapshot = useRef<string>('')

  // 生成当前数据快照
  const getSnapshot = () => {
    return JSON.stringify({ name, description, createMode, userDescription })
  }

  // 检测是否有修改
  const hasChanges = () => {
    return getSnapshot() !== initialSnapshot.current
  }

  // 当弹窗打开时，重置表单
  useEffect(() => {
    if (isOpen) {
      loadAgenticConfig()
      setName('')
      setDescription('')
      setUserDescription('')
      setCreateMode('select')
      setInvalidFields(new Set())
      clearAgenticSteps()
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, loadAgenticConfig, clearAgenticSteps])

  // Agentic 智能生成
  const handleAgenticGenerate = async () => {
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入工作流描述', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (!isElectron()) {
      addToast('Agentic 功能仅在 Electron 环境中可用', 'warning')
      return
    }

    if (!agenticConfig.enabled) {
      addToast('请先在设置中启用 Agentic 模式', 'warning')
      return
    }

    if (!currentProject?.path) {
      addToast('请先选择一个项目', 'warning')
      return
    }

    const promptTemplate = await loadWorkflowTemplateFile('agentic-create')

    let task: string
    if (promptTemplate.includes('{{userDescription}}')) {
      task = promptTemplate.replace(/\{\{userDescription\}\}/g, userDescription)
    } else {
      console.warn('[Agentic Workflow Create] 模板中未找到 {{userDescription}} 占位符，将自动追加用户描述')
      task = `${promptTemplate}\n\n## 用户需求\n${userDescription}`
    }

    const enabledTools = agenticConfig.tools.filter(t => t.enabled)

    let selectedProvider = await (await import('../../utils/storage')).getDefaultLLMProvider()
    if (agenticConfig.providerId) {
      const { loadLLMProvidersFromFile } = await import('../../utils/storage')
      const providers = await loadLLMProvidersFromFile()
      const found = providers.find(p => p.id === agenticConfig.providerId)
      if (found) selectedProvider = found
    }

    if (!selectedProvider) {
      addToast('未找到可用的 LLM 提供商', 'error')
      return
    }

    const selectedModel = agenticConfig.modelId || selectedProvider.defaultModel

    console.log('='.repeat(60))
    console.log('[Agentic Workflow Create] 开始执行 Agent Loop')
    console.log('[Agentic Workflow Create] 任务:', userDescription)
    console.log('[Agentic Workflow Create] 提供商:', selectedProvider.name)
    console.log('[Agentic Workflow Create] 模型:', selectedModel)
    console.log('[Agentic Workflow Create] 工具:', enabledTools.map(t => t.type).join(', '))
    console.log('='.repeat(60))

    try {
      await executeAgenticLoop({
        task,
        tools: enabledTools,
        provider: selectedProvider,
        model: selectedModel,
        projectPath: currentProject.path,
        maxIterations: agenticConfig.maxIterations,
        timeout: agenticConfig.timeout
      })
    } catch (error) {
      console.error('[Agentic Workflow Create] 执行失败:', error)
    }
  }

  // 中止 Agentic 执行
  const handleAbortAgentic = async () => {
    try {
      await abortAgenticLoop()
      addToast('已发送中止信号', 'warning')
    } catch (error) {
      console.error('中止 Agentic 失败:', error)
    }
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入工作流名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (existingNames.includes(name.trim())) {
      setInvalidFields(new Set(['name']))
      addToast('工作流名称已存在，请使用其他名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    setInvalidFields(new Set())

    onConfirm(name.trim(), description.trim())

    addToast('工作流创建成功', 'success')
    handleClose(true)
  }

  const handleClose = (skipConfirm = false) => {
    if (!skipConfirm && hasChanges()) {
      setShowConfirm(true)
      return
    }

    setName('')
    setDescription('')
    setUserDescription('')
    setInvalidFields(new Set())
    setCreateMode('select')
    clearAgenticSteps()
    onClose()
  }

  const handleConfirmClose = () => {
    setShowConfirm(false)
    handleClose(true)
  }

  const handleCancelClose = () => {
    setShowConfirm(false)
  }

  const handleConfirmBack = () => {
    setShowBackConfirm(false)
    setUserDescription('')
    clearAgenticSteps()
    setName('')
    setDescription('')
    setCreateMode('select')
  }

  const handleCancelBack = () => {
    setShowBackConfirm(false)
  }

  // 渲染模式选择界面
  const renderModeSelect = () => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="flex gap-4">
        <button
          onClick={() => setCreateMode('manual')}
          className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
            <PenLine size={24} className="text-yellow-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">手动创建</span>
        </button>
        <button
          onClick={() => setCreateMode('agentic')}
          className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center">
            <Bot size={24} className="text-purple-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">Agentic创建</span>
        </button>
      </div>
    </div>
  )

  // 渲染 Agentic 创建界面
  const renderAgenticCreate = () => (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Bot size={16} className="text-macos-text-secondary" />
          描述你想要创建的工作流
        </label>
        <Textarea
          placeholder="例如：帮我创建一个订单处理工作流，包含下单、支付、发货、签收等阶段...&#10;&#10;Agentic 模式会：&#10;1. 首先查看 .claude/workflows/ 目录下已有的工作流文档&#10;2. 参考已有文档的格式和风格&#10;3. 根据你的描述生成工作流描述"
          value={userDescription}
          onChange={(e) => {
            setUserDescription(e.target.value)
            if (invalidFields.has('userDescription')) setInvalidFields(new Set())
          }}
          rows={6}
          invalid={invalidFields.has('userDescription')}
          disabled={isAgenticRunning}
        />
      </div>

      {agenticSteps.length > 0 && (
        <AgentLoopLogger
          steps={agenticSteps}
          isRunning={isAgenticRunning}
          expandedSteps={expandedSteps}
          onToggleExpand={toggleStepExpand}
          maxHeight={300}
        />
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (userDescription.trim() || agenticSteps.length > 0) {
              setShowBackConfirm(true)
            } else {
              setCreateMode('select')
            }
          }}
          disabled={isAgenticRunning}
        >
          返回选择
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!isAgenticRunning) {
              clearAgenticSteps()
              handleAgenticGenerate()
            } else {
              handleAbortAgentic()
            }
          }}
          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
        >
          {isAgenticRunning ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1.5" />
              中止生成
            </>
          ) : (
            <>
              <Wand2 size={14} className="mr-1.5" />
              开始生成
            </>
          )}
        </Button>
      </div>
    </div>
  )

  // 渲染手动编辑界面
  const renderManualEdit = () => (
    <div className="space-y-4">
      {/* 名称输入 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Type size={16} className="text-macos-text-secondary" />
          工作流名称 *
        </label>
        <Input
          placeholder="例如：订单处理流程"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (invalidFields.has('name')) setInvalidFields(new Set())
          }}
          autoFocus={createMode === 'manual'}
          invalid={invalidFields.has('name')}
        />
      </div>

      {/* 描述输入 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <FileText size={16} className="text-macos-text-secondary" />
          描述（可选）
        </label>
        <Textarea
          placeholder="简要描述这个工作流的用途..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
        />
      </div>
    </div>
  )

  // 根据模式渲染内容
  const renderContent = () => {
    switch (createMode) {
      case 'select':
        return renderModeSelect()
      case 'agentic':
        return renderAgenticCreate()
      case 'manual':
        return renderManualEdit()
      default:
        return renderModeSelect()
    }
  }

  const showFooter = createMode === 'manual'

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title=""
        footer={
          showFooter ? (
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (name.trim() || description.trim()) {
                    setShowBackConfirm(true)
                  } else {
                    setCreateMode('select')
                  }
                }}
              >
                返回选择
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSubmit}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
              >
                创建
              </Button>
            </div>
          ) : undefined
        }
      >
        {renderContent()}
      </Modal>

      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要退出吗？"
        confirmText="退出"
        cancelText="继续编辑"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
      />

      <ConfirmModal
        isOpen={showBackConfirm}
        title="确认返回"
        message="当前有未保存的内容，确定要返回吗？"
        confirmText="返回"
        cancelText="继续编辑"
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
      />
    </>
  )
}