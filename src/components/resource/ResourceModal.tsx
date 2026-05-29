import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, FileText, BookOpen, Wrench, MessageSquare, Eye, Edit3, PenLine, Bot, Loader2, Wand2 } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { isElectron, loadResourceTemplateFile } from '../../utils/storage'
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../agent/AgentLoopLogger'
import type { ResourceFile, ResourceFileType } from '../../types'

// 创建模式类型
type CreateMode = 'select' | 'manual' | 'agentic'

interface ResourceModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (resource: Omit<ResourceFile, 'id' | 'createdAt' | 'updatedAt'>) => void
  mode: 'create' | 'edit'
  initialData?: ResourceFile
  existingNames?: string[]
}

const resourceTypeOptions: { id: ResourceFileType; label: string; icon: typeof FileText; color: string }[] = [
  { id: 'rule', label: '规则说明', icon: FileText, color: '#007AFF' },
  { id: 'reference', label: '参考文档', icon: BookOpen, color: '#5856D6' },
  { id: 'tool', label: '工具说明', icon: Wrench, color: '#34C759' },
]

export const ResourceModal: FC<ResourceModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  mode,
  initialData,
  existingNames = [],
}) => {
  const { addToast } = useToastStore()
  const { agenticConfig, loadAgenticConfig } = useSettingsStore()
  const { currentProject } = useProjectStore()

  // 创建模式
  const [createMode, setCreateMode] = useState<CreateMode>('select')

  const [name, setName] = useState('')
  const [resourceType, setResourceType] = useState<ResourceFileType>('rule')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')

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
        setContent(result.result)
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

  // 计算排除路径（编辑模式下排除当前资源文件）
  const excludePath = mode === 'edit' && initialData ? `.claude/resources/${initialData.name}.md` : undefined

  // 编辑/预览模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)

  // 返回选择确认弹窗状态
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  // 验证失败的字段
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  // 初始数据快照（用于检测是否有修改）
  const initialSnapshot = useRef<string>('')

  // 生成当前数据快照
  const getSnapshot = () => {
    return JSON.stringify({
      name,
      resourceType,
      description,
      content,
      createMode,
      userDescription,
    })
  }

  // 检测是否有修改
  const hasChanges = () => {
    return getSnapshot() !== initialSnapshot.current
  }

  // 当弹窗打开或 initialData 变化时，重置表单
  useEffect(() => {
    if (isOpen) {
      loadAgenticConfig()

      if (mode === 'edit' && initialData) {
        setName(initialData.name)
        setResourceType(initialData.type)
        setDescription(initialData.description || '')
        setContent(initialData.content || '')
        setCreateMode('manual')
      } else {
        setName('')
        setResourceType('rule')
        setDescription('')
        setContent('')
        setUserDescription('')
        setCreateMode('select')
      }
      setInvalidFields(new Set())
      setViewMode('edit')
      clearAgenticSteps()
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, mode, initialData, loadAgenticConfig, clearAgenticSteps])

  // Agentic 智能生成
  const handleAgenticGenerate = async () => {
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入资源描述', 'warning')
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

    const promptTemplate = await loadResourceTemplateFile('agentic-create')

    let task: string
    if (promptTemplate.includes('{{userDescription}}')) {
      task = promptTemplate.replace(/\{\{userDescription\}\}/g, userDescription)
    } else {
      console.warn('[Agentic Resource Create] 模板中未找到 {{userDescription}} 占位符，将自动追加用户描述')
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
    console.log('[Agentic Resource Create] 开始执行 Agent Loop')
    console.log('[Agentic Resource Create] 任务:', userDescription)
    console.log('[Agentic Resource Create] 提供商:', selectedProvider.name)
    console.log('[Agentic Resource Create] 模型:', selectedModel)
    console.log('[Agentic Resource Create] 工具:', enabledTools.map(t => t.type).join(', '))
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
      console.error('[Agentic Resource Create] 执行失败:', error)
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
      addToast('请输入资源名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (mode === 'create' && existingNames.includes(name.trim())) {
      addToast('资源名称已存在，请使用其他名称', 'warning')
      return
    }

    if (!content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入资源内容', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    setInvalidFields(new Set())

    onConfirm({
      name: name.trim(),
      type: resourceType,
      description: description.trim() || undefined,
      content: content.trim(),
    })

    addToast(mode === 'create' ? '资源创建成功' : '资源更新成功', 'success')
    handleClose(true)
  }

  const handleClose = (skipConfirm = false) => {
    if (!skipConfirm && hasChanges()) {
      setShowConfirm(true)
      return
    }

    setName('')
    setResourceType('rule')
    setDescription('')
    setContent('')
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
    setResourceType('rule')
    setDescription('')
    setContent('')
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
          描述你想要创建的资源
        </label>
        <Textarea
          placeholder="例如：帮我创建一个代码审查规范资源，包含审查清单和评分标准...&#10;&#10;Agentic 模式会：&#10;1. 首先查看 .claude/resources/ 目录下已有的资源文档&#10;2. 参考已有文档的格式和风格&#10;3. 根据你的描述创建新的资源文档"
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
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
      {/* 资源名称 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Type size={16} className="text-macos-text-secondary" />
          资源名称 *
        </label>
        <Input
          placeholder="例如：节点命名规范"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (invalidFields.has('name')) setInvalidFields(new Set())
          }}
          autoFocus={createMode === 'manual'}
          disabled={mode === 'edit'}
          invalid={invalidFields.has('name')}
        />
        {mode === 'edit' && (
          <p className="mt-1 text-xs text-macos-text-tertiary">编辑模式下资源名称不可修改</p>
        )}
      </div>

      {/* 资源类型 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-2">
          <BookOpen size={16} className="text-macos-text-secondary" />
          资源类型
        </label>
        <div className="flex items-center gap-2">
          {resourceTypeOptions.map((type) => {
            const Icon = type.icon
            const isSelected = resourceType === type.id
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setResourceType(type.id)}
                className={`
                  flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all
                  ${
                    isSelected
                      ? 'border-gray-400 bg-gray-100 text-gray-800'
                      : 'border-macos-border hover:border-gray-300 hover:bg-gray-50 text-macos-text-secondary'
                  }
                `}
              >
                <Icon
                  size={16}
                  style={{ color: isSelected ? type.color : '#6E6E73' }}
                  strokeWidth={1.5}
                />
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 资源描述 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <MessageSquare size={16} className="text-macos-text-secondary" />
          资源描述
        </label>
        <Textarea
          placeholder="简要描述这个资源的用途..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      {/* 资源内容 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
            <FileText size={16} className="text-macos-text-secondary" />
            资源内容 *
          </label>
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

        {viewMode === 'edit' && (
          <MarkdownEditor
            placeholder="在此输入资源文件的详细内容，支持 Markdown 格式...&#10;&#10;提示：输入@和%可引用其他业务内容"
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              if (invalidFields.has('content')) setInvalidFields(new Set())
            }}
            rows={12}
            invalid={invalidFields.has('content')}
            className="font-mono text-sm"
            excludePath={excludePath}
          />
        )}

        {viewMode === 'preview' && (
          <div
            className={`bg-gray-50 rounded-lg p-4 min-h-[280px] max-h-[400px] overflow-y-auto ${
              invalidFields.has('content') ? 'ring-2 ring-gray-400' : ''
            }`}
          >
            {content.trim() ? (
              <MarkdownRenderer content={content} />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-8">
                暂无内容，请切换到编辑模式输入内容
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // 根据模式渲染内容
  const renderContent = () => {
    if (mode === 'edit') {
      return renderManualEdit()
    }

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

  const showFooter = mode === 'edit' || createMode === 'manual'

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={mode === 'create' ? '' : '编辑资源'}
        size="xl"
        footer={
          showFooter ? (
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (mode === 'edit') {
                    handleClose()
                  } else {
                    if (name.trim() || description.trim() || content.trim()) {
                      setShowBackConfirm(true)
                    } else {
                      setCreateMode('select')
                    }
                  }
                }}
              >
                {mode === 'edit' ? '取消' : '返回选择'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSubmit}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
              >
                {mode === 'create' ? '创建' : '保存'}
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