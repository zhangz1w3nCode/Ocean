import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, Zap, Eye, Edit3, MessageSquare, PenLine, Loader2, Bot, Wand2, Brain } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer, OptimizeModal } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { generateWithLLM, parseAbilityContent } from '../../services/llmService'
import { getDefaultLLMProvider, isElectron, loadAbilityTemplateFile } from '../../utils/storage'
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../agent/AgentLoopLogger'
import type { AbilityFile } from '../../types'

// 创建模式类型
type CreateMode = 'select' | 'manual' | 'smart' | 'agentic'

interface AbilityModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (ability: Omit<AbilityFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => void
  mode: 'create' | 'edit'
  initialData?: AbilityFile
  existingNames?: string[]
}

export const AbilityModal: FC<AbilityModalProps> = ({
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

  // 表单数据
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')

  // LLM创建的用户描述
  const [userDescription, setUserDescription] = useState('')

  // 加载状态
  const [isGenerating, setIsGenerating] = useState(false)

  // 优化弹窗状态
  const [showOptimizeModal, setShowOptimizeModal] = useState(false)

  // 使用新的 useAgentLoop hook
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
        // 执行成功后直接填充内容
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

  // 计算排除路径（编辑模式下排除当前能力）
  const excludePath = mode === 'edit' && initialData ? `.claude/abilities/${initialData.name}.md` : undefined

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
      // 加载 Agentic 配置（从本地文件）
      loadAgenticConfig()

      if (mode === 'edit' && initialData) {
        setName(initialData.name)
        setDescription(initialData.description || '')
        setContent(initialData.content || '')
        setCreateMode('manual') // 编辑模式直接进入手动模式
      } else {
        // 创建模式：重置为默认值
        setName('')
        setDescription('')
        setContent('')
        setUserDescription('')
        setCreateMode('select')
      }
      setInvalidFields(new Set())
      setViewMode('edit')
      setIsGenerating(false)
      clearAgenticSteps()
      // 延迟设置快照，确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, mode, initialData, loadAgenticConfig, clearAgenticSteps])

  // 智能生成能力
  const handleSmartGenerate = async () => {
    // 验证用户描述
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入能力描述', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 从配置文件获取启用 LLM 提供商
    const defaultProvider = await getDefaultLLMProvider()
    if (!defaultProvider) {
      addToast('请先在设置中配置并启用 LLM 提供商', 'warning')
      return
    }

    // 校验 Base URL
    if (!defaultProvider.baseUrl) {
      addToast('请先配置 Base URL', 'warning')
      return
    }

    // 校验 API Key
    if (!defaultProvider.apiKey) {
      addToast('请先配置 API Key', 'warning')
      return
    }

    // 校验模型
    if (!defaultProvider.defaultModel) {
      addToast('请先配置默认模型', 'warning')
      return
    }

    setIsGenerating(true)

    try {
      // 从本地文件加载模板
      const promptTemplate = await loadAbilityTemplateFile('llm-create')

      const result = await generateWithLLM(
        defaultProvider,
        promptTemplate,
        userDescription
      )

      if (!result.success || !result.content) {
        addToast(result.error || 'LLM 调用失败', 'error')
        setIsGenerating(false)
        return
      }

      // 解析返回的内容
      const parsed = parseAbilityContent(result.content)
      if (!parsed) {
        addToast('无法解析 LLM 返回的内容，请检查提示词模板', 'warning')
        setIsGenerating(false)
        return
      }

      // 填充表单 - 只填充内容，名称和描述由用户填写
      setContent(parsed.content)

      // 切换到手动模式以进行编辑
      setCreateMode('manual')
      addToast('创建成功', 'success')
    } catch (error) {
      addToast('生成失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Agentic 智能生成能力 - 使用 useAgentLoop hook
  const handleAgenticGenerate = async () => {
    // 验证用户描述
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入能力描述', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 检查是否在 Electron 环境
    if (!isElectron()) {
      addToast('Agentic 功能仅在 Electron 环境中可用', 'warning')
      return
    }

    // 检查 Agentic 是否启用
    if (!agenticConfig.enabled) {
      addToast('请先在设置中启用 Agentic 模式', 'warning')
      return
    }

    // 检查项目是否已选择
    if (!currentProject?.path) {
      addToast('请先选择一个项目', 'warning')
      return
    }

    // 从本地文件加载 Agentic 创建模板
    const promptTemplate = await loadAbilityTemplateFile('agentic-create')

    // 替换占位符，如果模板中没有占位符则自动追加
    let task: string
    if (promptTemplate.includes('{{userDescription}}')) {
      task = promptTemplate.replace(/\{\{userDescription\}\}/g, userDescription)
    } else {
      // 降级处理：模板中没有占位符，在末尾追加用户描述
      console.warn('[Agentic Ability Create] 模板中未找到 {{userDescription}} 占位符，将自动追加用户描述')
      task = `${promptTemplate}\n\n## 用户需求\n${userDescription}`
    }

    // 获取启用的工具
    const enabledTools = agenticConfig.tools.filter(t => t.enabled)

    // 获取 LLM 提供商
    let selectedProvider = await getDefaultLLMProvider()
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
    console.log('[Agentic Ability Create] 开始执行 Agent Loop')
    console.log('[Agentic Ability Create] 任务:', userDescription)
    console.log('[Agentic Ability Create] 提供商:', selectedProvider.name)
    console.log('[Agentic Ability Create] 模型:', selectedModel)
    console.log('[Agentic Ability Create] 工具:', enabledTools.map(t => t.type).join(', '))
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
      console.error('[Agentic Ability Create] 执行失败:', error)
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
    // 验证能力名称
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入能力名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 创建模式下检查名称唯一性
    if (mode === 'create' && existingNames.includes(name.trim())) {
      addToast('能力名称已存在，请使用其他名称', 'warning')
      return
    }

    // 验证内容
    if (!content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入能力内容', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 清除验证失败状态
    setInvalidFields(new Set())

    // 提交
    onConfirm({
      name: name.trim(),
      description: description.trim(),
      content: content.trim(),
    })

    // 显示成功提示
    addToast(mode === 'create' ? '能力创建成功' : '能力更新成功', 'success')

    handleClose(true)
  }

  const handleClose = async (skipConfirm = false) => {
    // 如果不是跳过确认，且有修改，则显示确认弹窗
    if (!skipConfirm && hasChanges()) {
      setShowConfirm(true)
      return
    }

    setName('')
    setDescription('')
    setContent('')
    setUserDescription('')
    setInvalidFields(new Set())
    setCreateMode('select')
    clearAgenticSteps()
    onClose()
  }

  // 确认关闭
  const handleConfirmClose = async () => {
    setShowConfirm(false)
    handleClose(true)
  }

  // 取消关闭
  const handleCancelClose = () => {
    setShowConfirm(false)
  }

  // 确认返回选择
  const handleConfirmBack = () => {
    setShowBackConfirm(false)
    // 清空当前创建方式的内容
    setUserDescription('')
    clearAgenticSteps()
    setName('')
    setDescription('')
    setContent('')
    setCreateMode('select')
  }

  // 取消返回选择
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
          onClick={() => setCreateMode('smart')}
          className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center">
            <Brain size={24} className="text-pink-400" />
          </div>
          <span className="text-sm font-medium text-gray-700">LLM创建</span>
        </button>
        <button
          onClick={() => setCreateMode('agentic')}
          className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <Bot size={24} className="text-blue-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">Agentic创建</span>
        </button>
      </div>
    </div>
  )

  // 渲染LLM创建界面
  const renderSmartCreate = () => (
    <div className="space-y-5">
      {/* 用户描述输入 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <MessageSquare size={16} className="text-macos-text-secondary" />
          描述你想要创建的能力
        </label>
        <Textarea
          placeholder="例如：帮我创建一个代码审查的能力，可以检查代码规范、发现潜在问题..."
          value={userDescription}
          onChange={(e) => {
            setUserDescription(e.target.value)
            if (invalidFields.has('userDescription')) setInvalidFields(new Set())
          }}
          rows={6}
          invalid={invalidFields.has('userDescription')}
          disabled={isGenerating}
        />
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // 如果有输入内容，显示确认弹窗
            if (userDescription.trim()) {
              setShowBackConfirm(true)
            } else {
              setCreateMode('select')
            }
          }}
          disabled={isGenerating}
        >
          返回选择
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSmartGenerate}
          disabled={isGenerating}
          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
        >
          {isGenerating ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1.5" />
              正在生成...
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

  // 渲染 Agentic 创建界面
  const renderAgenticCreate = () => (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
      {/* 用户描述输入 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Bot size={16} className="text-macos-text-secondary" />
          描述你想要创建的能力
        </label>
        <Textarea
          placeholder="例如：帮我创建一个代码审查的能力，可以检查代码规范、发现潜在问题...&#10;&#10;Agentic 模式会：&#10;1. 首先查看 .claude/abilities/ 目录下已有的能力文档&#10;2. 参考已有文档的格式和风格&#10;3. 根据你的描述创建新的能力文档"
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

      {/* Agent 执行日志 - 使用新的 AgentLoopLogger 组件 */}
      {agenticSteps.length > 0 && (
        <AgentLoopLogger
          steps={agenticSteps}
          isRunning={isAgenticRunning}
          expandedSteps={expandedSteps}
          onToggleExpand={toggleStepExpand}
          maxHeight={300}
        />
      )}

      {/* 控制按钮 */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // 如果有输入内容或执行日志，显示确认弹窗
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
      {/* 能力名称 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Type size={16} className="text-macos-text-secondary" />
          能力名称 *
        </label>
        <Input
          placeholder="例如：代码审查"
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
          <p className="mt-1 text-xs text-macos-text-tertiary">编辑模式下能力名称不可修改</p>
        )}
      </div>

      {/* 能力描述 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <MessageSquare size={16} className="text-macos-text-secondary" />
          能力描述
        </label>
        <Textarea
          placeholder="简要描述这个能力的用途..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      {/* 能力内容 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
            <Zap size={16} className="text-macos-text-secondary" />
            能力内容 *
          </label>
          <div className="flex items-center gap-2">
            {/* 优化按钮 - 编辑模式和手动创建模式显示 */}
            {(mode === 'edit' || createMode === 'manual') && (
              <button
                type="button"
                onClick={() => setShowOptimizeModal(true)}
                disabled={!content.trim()}
                title="优化能力内容"
                className="flex items-center justify-center w-7 h-7 rounded-md bg-gradient-to-r from-rose-400 via-fuchsia-500 to-indigo-500 text-white hover:from-rose-500 hover:via-fuchsia-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Wand2 size={14} />
              </button>
            )}
            {/* 编辑/预览切换 */}
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
        </div>

        {/* 编辑模式 */}
        {viewMode === 'edit' && (
          <MarkdownEditor
            placeholder="在此输入能力内容，支持 Markdown 格式...&#10;&#10;例如：&#10;# 能力说明&#10;- 这是一个最小能力单元...&#10;&#10;提示：输入@可引用其他业务内容"
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

        {/* 预览模式 */}
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
      case 'smart':
        return renderSmartCreate()
      case 'agentic':
        return renderAgenticCreate()
      case 'manual':
        return renderManualEdit()
      default:
        return renderModeSelect()
    }
  }

  // 计算是否显示底部按钮
  const showFooter = mode === 'edit' || createMode === 'manual'

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={mode === 'create' ? '' : '编辑能力'}
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
                    // 手动创建模式下，如果有内容，显示确认弹窗
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

      {/* 确认关闭弹窗 */}
      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要退出吗？"
        confirmText="退出"
        cancelText="继续编辑"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
      />

      {/* 确认返回选择弹窗 */}
      <ConfirmModal
        isOpen={showBackConfirm}
        title="确认返回"
        message="当前有未保存的内容，确定要返回吗？"
        confirmText="返回"
        cancelText="继续编辑"
        onConfirm={handleConfirmBack}
        onCancel={handleCancelBack}
      />

      {/* 优化弹窗 - 编辑模式和手动创建模式 */}
      {(mode === 'edit' || createMode === 'manual') && (
        <OptimizeModal
          isOpen={showOptimizeModal}
          onClose={() => setShowOptimizeModal(false)}
          currentContent={content}
          onConfirm={(optimizedContent) => {
            setContent(optimizedContent)
            addToast('已应用优化结果', 'success')
          }}
          title="优化能力内容"
          templateType="ability-optimize"
        />
      )}
    </>
  )
}