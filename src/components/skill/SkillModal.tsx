import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, Wand2, Eye, Edit3, MessageSquare, FileCode, FileText, FolderOpen, Plus, Trash2, X, PenLine, Brain, Bot, Loader2, Sparkles } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer, OptimizeModal } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useSkillStore } from '../../stores/skillStore'
import { generateWithLLM, parseAbilityContent } from '../../services/llmService'
import { getDefaultLLMProvider, isElectron, loadSkillTemplateFile } from '../../utils/storage'
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../agent/AgentLoopLogger'
import { useClaudeCode } from '../../hooks/useClaudeCode'
import { ClaudeCodeLogger } from '../agent/ClaudeCodeLogger'
import type { SkillFile, SkillResource } from '../../types'

// 创建模式类型
type CreateMode = 'select' | 'manual' | 'smart' | 'agentic' | 'claude'

interface SkillModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (skill: Omit<SkillFile, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'scripts' | 'references' | 'examples'>) => void
  mode: 'create' | 'edit'
  initialData?: SkillFile
  existingNames?: string[]
}

type TabType = 'content' | 'scripts' | 'references' | 'examples'

const tabConfig = {
  content: {
    label: '技能内容',
    icon: Wand2,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
  },
  scripts: {
    label: '脚本',
    icon: FileCode,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
  },
  references: {
    label: '参考文档',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  examples: {
    label: '示例',
    icon: FolderOpen,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
}

export const SkillModal: FC<SkillModalProps> = ({
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
  const { loadResources, saveResource, deleteResource } = useSkillStore()

  // 创建模式
  const [createMode, setCreateMode] = useState<CreateMode>('select')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')

  // LLM创建的用户描述
  const [userDescription, setUserDescription] = useState('')

  // 加载状态
  const [isGenerating, setIsGenerating] = useState(false)

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

  // 使用 useClaudeCode hook
  const {
    steps: claudeSteps,
    isRunning: isClaudeRunning,
    expandedSteps: claudeExpandedSteps,
    sessionId: claudeSessionId,
    toggleStepExpand: toggleClaudeStepExpand,
    clearSteps: clearClaudeSteps,
    execute: executeClaudeCode,
    abort: abortClaudeCode,
  } = useClaudeCode({
    onComplete: (result) => {
      if (result.success && result.result) {
        setContent(result.result)
        setCreateMode('manual')
        addToast('Claude 创建成功', 'success')
      } else {
        addToast(result.error || 'Claude Code 执行失败', 'error')
      }
    },
    onError: (error) => {
      addToast(error.message || 'Claude Code 执行失败', 'error')
    }
  })

  // 计算排除路径（编辑模式下排除当前技能）
  const excludePath = mode === 'edit' && initialData ? `.claude/skills/${initialData.name}/SKILL.md` : undefined

  // 编辑/预览模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

  // 标签页状态
  const [activeTab, setActiveTab] = useState<TabType>('content')

  // 资源文件状态
  const [resources, setResources] = useState<Record<TabType, SkillResource[]>>({
    scripts: [],
    references: [],
    examples: [],
    content: [],
  })

  // 资源编辑状态
  const [isEditingResource, setIsEditingResource] = useState(false)
  const [editingFileName, setEditingFileName] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)
  const [showBackConfirm, setShowBackConfirm] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null)

  // 优化弹窗状态
  const [showOptimizeModal, setShowOptimizeModal] = useState(false)

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
      resources,
      createMode,
      userDescription,
    })
  }

  // 检测是否有修改
  const hasChanges = () => {
    return getSnapshot() !== initialSnapshot.current
  }

  // 加载资源文件
  const loadAllResources = async (skillName: string) => {
    const [scripts, references, examples] = await Promise.all([
      loadResources(skillName, 'scripts'),
      loadResources(skillName, 'references'),
      loadResources(skillName, 'examples'),
    ])
    setResources({
      content: [],
      scripts,
      references,
      examples,
    })
  }

  // 当弹窗打开或 initialData 变化时，重置表单
  useEffect(() => {
    if (isOpen) {
      // 加载 Agentic 配置
      loadAgenticConfig()

      if (mode === 'edit' && initialData) {
        setName(initialData.name)
        setDescription(initialData.description || '')
        setContent(initialData.content || '')
        setCreateMode('manual') // 编辑模式直接进入手动模式
        // 加载资源文件
        loadAllResources(initialData.name)
      } else {
        // 创建模式：重置为默认值
        setName('')
        setDescription('')
        setContent('')
        setUserDescription('')
        setCreateMode('select')
        setResources({
          content: [],
          scripts: [],
          references: [],
          examples: [],
        })
      }
      setInvalidFields(new Set())
      setViewMode('edit')
      setActiveTab('content')
      resetResourceEditState()
      clearAgenticSteps()
      clearClaudeSteps()
      // 延迟设置快照，确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, mode, initialData, loadAgenticConfig, clearAgenticSteps])

  // 智能生成技能
  const handleSmartGenerate = async () => {
    // 验证用户描述
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入技能描述', 'warning')
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
      const promptTemplate = await loadSkillTemplateFile('llm-create')

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

  // Agentic 智能生成技能
  const handleAgenticGenerate = async () => {
    // 验证用户描述
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入技能描述', 'warning')
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
    const promptTemplate = await loadSkillTemplateFile('agentic-create')

    // 替换占位符，如果模板中没有占位符则自动追加
    let task: string
    if (promptTemplate.includes('{{userDescription}}')) {
      task = promptTemplate.replace(/\{\{userDescription\}\}/g, userDescription)
    } else {
      // 降级处理：模板中没有占位符，在末尾追加用户描述
      console.warn('[Agentic Skill Create] 模板中未找到 {{userDescription}} 占位符，将自动追加用户描述')
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
    console.log('[Agentic Skill Create] 开始执行 Agent Loop')
    console.log('[Agentic Skill Create] 任务:', userDescription)
    console.log('[Agentic Skill Create] 提供商:', selectedProvider.name)
    console.log('[Agentic Skill Create] 模型:', selectedModel)
    console.log('[Agentic Skill Create] 工具:', enabledTools.map(t => t.type).join(', '))
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
      console.error('[Agentic Skill Create] 执行失败:', error)
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

  // Claude 创建 - 使用本地 claude CLI
  const handleClaudeCreate = async () => {
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入技能描述', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (!isElectron()) {
      addToast('Claude 创建功能仅在 Electron 环境中可用', 'warning')
      return
    }

    if (!currentProject?.path) {
      addToast('请先选择一个项目', 'warning')
      return
    }

    try {
      await executeClaudeCode(userDescription, {
        projectPath: currentProject.path,
        maxTurns: 10,
        permissionMode: 'acceptEdits'
      })
    } catch (error) {
      console.error('[Claude Skill Create] 执行失败:', error)
    }
  }

  // Claude 继续对话
  const handleClaudeContinue = async () => {
    if (!claudeSessionId || !userDescription.trim()) {
      addToast('请输入继续对话的内容', 'warning')
      return
    }

    if (!currentProject?.path) {
      addToast('请先选择一个项目', 'warning')
      return
    }

    try {
      await executeClaudeCode(userDescription, {
        projectPath: currentProject.path,
        sessionId: claudeSessionId,
        maxTurns: 10,
        permissionMode: 'acceptEdits'
      })
    } catch (error) {
      console.error('[Claude Skill Continue] 执行失败:', error)
    }
  }

  // 中止 Claude 执行
  const handleAbortClaude = async () => {
    try {
      await abortClaudeCode()
      addToast('已中止 Claude 执行', 'warning')
    } catch (error) {
      console.error('中止 Claude Code 失败:', error)
    }
  }

  const handleSubmit = () => {
    // 验证技能名称
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入技能名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 验证名称格式（只允许字母、数字、中划线、下划线）
    const nameRegex = /^[a-zA-Z0-9_-]+$/
    if (!nameRegex.test(name.trim())) {
      setInvalidFields(new Set(['name']))
      addToast('技能名称只能包含字母、数字、中划线和下划线', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 创建模式下检查名称唯一性
    if (mode === 'create' && existingNames.includes(name.trim())) {
      addToast('技能名称已存在，请使用其他名称', 'warning')
      return
    }

    // 验证内容
    if (!content.trim()) {
      setActiveTab('content')
      setInvalidFields(new Set(['content']))
      addToast('请输入技能内容', 'warning')
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
    addToast(mode === 'create' ? '技能创建成功' : '技能更新成功', 'success')

    handleClose(true)
  }

  const handleClose = (skipConfirm = false) => {
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
    setActiveTab('content')
    setCreateMode('select')
    resetResourceEditState()
    clearAgenticSteps()
    clearClaudeSteps()
    onClose()
  }

  // 确认关闭
  const handleConfirmClose = () => {
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
    clearClaudeSteps()
    setName('')
    setDescription('')
    setContent('')
    setCreateMode('select')
  }

  // 取消返回选择
  const handleCancelBack = () => {
    setShowBackConfirm(false)
  }

  // 重置资源编辑状态
  const resetResourceEditState = () => {
    setIsEditingResource(false)
    setEditingFileName(null)
    setFileName('')
    setFileContent('')
  }

  // 创建模式下不能编辑资源
  const canEditResources = mode === 'edit' && initialData

  // 新建资源文件
  const handleCreateResource = () => {
    resetResourceEditState()
    setIsEditingResource(true)
  }

  // 编辑资源文件
  const handleEditResource = (resource: SkillResource) => {
    setEditingFileName(resource.name)
    setFileName(resource.name)
    setFileContent(resource.content || '')
    setIsEditingResource(true)
  }

  // 保存资源文件
  const handleSaveResource = async () => {
    if (!initialData) return

    if (!fileName.trim()) {
      addToast('请输入文件名', 'warning')
      return
    }

    if (!fileContent.trim()) {
      addToast('请输入文件内容', 'warning')
      return
    }

    const success = await saveResource(
      initialData.name,
      activeTab as 'scripts' | 'references' | 'examples',
      fileName.trim(),
      fileContent.trim()
    )

    if (success) {
      addToast(editingFileName ? '文件更新成功' : '文件创建成功', 'success')
      // 重新加载资源列表
      await loadAllResources(initialData.name)
      resetResourceEditState()
    } else {
      addToast('保存失败', 'error')
    }
  }

  // 点击删除资源
  const handleDeleteResourceClick = (name: string) => {
    setDeletingFileName(name)
    setDeleteConfirmOpen(true)
  }

  // 确认删除资源
  const handleConfirmDeleteResource = async () => {
    if (!initialData || !deletingFileName) return

    const success = await deleteResource(
      initialData.name,
      activeTab as 'scripts' | 'references' | 'examples',
      deletingFileName
    )

    if (success) {
      addToast('文件删除成功', 'success')
      // 重新加载资源列表
      await loadAllResources(initialData.name)
    } else {
      addToast('删除失败', 'error')
    }
    setDeleteConfirmOpen(false)
    setDeletingFileName(null)
  }

  // 获取文件扩展名提示
  const getFilePlaceholder = () => {
    switch (activeTab) {
      case 'scripts':
        return 'main.py'
      case 'references':
      case 'examples':
        return 'document.md'
      default:
        return 'filename'
    }
  }

  // 获取内容提示
  const getContentPlaceholder = () => {
    switch (activeTab) {
      case 'scripts':
        return '# 在此输入脚本内容...'
      case 'references':
        return '# 在此输入参考文档内容...'
      case 'examples':
        return '# 在此输入示例文档内容...'
      default:
        return ''
    }
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
        <button
          onClick={() => setCreateMode('claude')}
          className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center">
            <Sparkles size={24} className="text-violet-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">Claude创建</span>
        </button>
      </div>
    </div>
  )

  // 渲染 LLM 创建界面
  const renderSmartCreate = () => (
    <div className="space-y-5">
      {/* 用户描述输入 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <MessageSquare size={16} className="text-macos-text-secondary" />
          描述你想要创建的技能
        </label>
        <Textarea
          placeholder="例如：帮我创建一个代码分析技能，可以检查代码质量、发现潜在问题..."
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
          描述你想要创建的技能
        </label>
        <Textarea
          placeholder="例如：帮我创建一个代码分析技能，可以检查代码质量、发现潜在问题...&#10;&#10;Agentic 模式会：&#10;1. 首先查看 .claude/skills/ 目录下已有的技能文档&#10;2. 参考已有文档的格式和风格&#10;3. 根据你的描述创建新的技能文档"
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

      {/* Agent 执行日志 - 使用 AgentLoopLogger 组件 */}
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

  // 渲染 Claude 创建界面
  const renderClaudeCreate = () => (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
      {/* 用户描述输入 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Sparkles size={16} className="text-violet-500" />
          描述你想要创建的技能
        </label>
        <Textarea
          placeholder="例如：帮我创建一个代码分析技能，可以检查代码质量、发现潜在问题...&#10;&#10;Claude 模式会利用本机 Claude Code CLI 自动执行：&#10;1. 读取项目中已有的技能文档作为参考&#10;2. 根据你的描述智能生成技能内容&#10;3. 支持多轮对话，逐步调整优化"
          value={userDescription}
          onChange={(e) => {
            setUserDescription(e.target.value)
            if (invalidFields.has('userDescription')) setInvalidFields(new Set())
          }}
          rows={6}
          invalid={invalidFields.has('userDescription')}
          disabled={isClaudeRunning}
        />
      </div>

      {/* 会话信息 */}
      {claudeSessionId && (
        <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 rounded-lg">
          <Sparkles size={14} className="text-violet-400" />
          <span className="text-xs text-violet-600">
            会话 {claudeSessionId.substring(0, 12)}... 可继续对话
          </span>
        </div>
      )}

      {/* Claude Code 执行日志 */}
      {claudeSteps.length > 0 && (
        <ClaudeCodeLogger
          steps={claudeSteps}
          isRunning={isClaudeRunning}
          expandedSteps={claudeExpandedSteps}
          onToggleExpand={toggleClaudeStepExpand}
          maxHeight={300}
        />
      )}

      {/* 控制按钮 */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (userDescription.trim() || claudeSteps.length > 0) {
              setShowBackConfirm(true)
            } else {
              setCreateMode('select')
            }
          }}
          disabled={isClaudeRunning}
        >
          返回选择
        </Button>
        {claudeSessionId && !isClaudeRunning && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleClaudeContinue}
            disabled={!userDescription.trim()}
            className="bg-white border border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300 rounded-lg"
          >
            <Sparkles size={14} className="mr-1.5" />
            继续对话
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!isClaudeRunning) {
              if (claudeSessionId) {
                clearClaudeSteps()
              }
              handleClaudeCreate()
            } else {
              handleAbortClaude()
            }
          }}
          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
        >
          {isClaudeRunning ? (
            <>
              <Loader2 size={14} className="animate-spin mr-1.5" />
              中止生成
            </>
          ) : (
            <>
              <Sparkles size={14} className="mr-1.5" />
              开始生成
            </>
          )}
        </Button>
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
      case 'claude':
        return renderClaudeCreate()
      case 'manual':
        return renderManualEdit()
      default:
        return renderModeSelect()
    }
  }

  // 渲染手动编辑界面
  const renderManualEdit = () => (
    <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-2">
      {/* 技能名称 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Type size={16} className="text-macos-text-secondary" />
          技能名称 *
        </label>
        <Input
          placeholder="例如：code-analyzer"
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
          <p className="mt-1 text-xs text-macos-text-tertiary">编辑模式下技能名称不可修改</p>
        )}
        {mode === 'create' && (
          <p className="mt-1 text-xs text-macos-text-tertiary">只能包含字母、数字、中划线和下划线</p>
        )}
      </div>

      {/* 技能描述 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <MessageSquare size={16} className="text-macos-text-secondary" />
          技能描述
        </label>
        <Textarea
          placeholder="简要描述这个技能的用途..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </div>

      {/* 标签页切换 - 仅编辑模式显示 */}
      {mode === 'edit' && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1.5">
          {(Object.keys(tabConfig) as TabType[]).map((tab) => {
            const config = tabConfig[tab]
            const Icon = config.icon
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab)
                  resetResourceEditState()
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center ${
                  isActive
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                <Icon size={16} className={isActive && 'color' in config ? config.color : ''} />
                {config.label}
              </button>
            )
          })}
        </div>
      )}

      {/* 内容区域 */}
      {activeTab === 'content' ? (
        /* 技能内容编辑 */
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
              <Wand2 size={16} className="text-violet-500" />
              技能内容 *
            </label>
            <div className="flex items-center gap-2">
              {/* 优化按钮 - 编辑模式和手动创建模式显示 */}
              {(mode === 'edit' || createMode === 'manual') && (
                <button
                  type="button"
                  onClick={() => setShowOptimizeModal(true)}
                  disabled={!content.trim()}
                  title="优化技能内容"
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
              placeholder="在此输入技能内容，支持 Markdown 格式...&#10;&#10;例如：&#10;# 技能说明&#10;这是一个代码分析技能...&#10;&#10;提示：输入@和%可引用其他业务内容 "
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                if (invalidFields.has('content')) setInvalidFields(new Set())
              }}
              rows={8}
              invalid={invalidFields.has('content')}
              className="font-mono text-sm"
              excludePath={excludePath}
            />
          )}

          {/* 预览模式 */}
          {viewMode === 'preview' && (
            <div
              className={`bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[50vh] overflow-y-auto ${
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
      ) : (
        /* 资源文件管理 */
        <div className="space-y-3">
          {/* 目录说明 */}
          <div className={`${currentTabConfig.bgColor} rounded-lg p-3`}>
            <div className="flex items-center gap-2">
              <currentTabConfig.icon size={16} className={currentTabConfig.color} />
              <span className={`text-sm font-medium ${currentTabConfig.color}`}>
                {activeTab}/
              </span>
            </div>
          </div>

          {/* 编辑区域 */}
          {isEditingResource ? (
            <div className="space-y-3 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700">
                  {editingFileName ? '编辑文件' : '新建文件'}
                </h4>
                <button
                  onClick={resetResourceEditState}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">文件名</label>
                <Input
                  placeholder={getFilePlaceholder()}
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  disabled={!!editingFileName}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">文件内容</label>
                <Textarea
                  placeholder={getContentPlaceholder()}
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={resetResourceEditState}>
                  取消
                </Button>
                <Button variant="outline" size="sm" onClick={handleSaveResource}>
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 文件列表 */}
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                {currentResources.length > 0 ? (
                  currentResources.map((resource) => (
                    <div
                      key={resource.name}
                      className="flex items-center justify-between p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <currentTabConfig.icon size={16} className={currentTabConfig.color} />
                        <span className="text-sm text-gray-700">{resource.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditResource(resource)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteResourceClick(resource.name)}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-sm text-gray-400 mb-2">暂无文件</p>
                    <p className="text-xs text-gray-300">点击下方按钮添加文件</p>
                  </div>
                )}
              </div>

              {/* 新建按钮 */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateResource}
                className="w-full border-dashed"
              >
                <Plus size={16} />
                添加文件
              </Button>
            </>
          )}
        </div>
      )}

      {/* 创建模式提示 */}
      {mode === 'create' && createMode === 'manual' && (
        <div className="text-xs text-macos-text-tertiary bg-violet-50 rounded-lg p-3">
          <p className="font-medium text-violet-700 mb-1">创建提示</p>
          <p>先创建技能，保存后可以在编辑界面管理 scripts、references、examples 等资源文件。</p>
        </div>
      )}
    </div>
  )

  // 计算是否显示底部按钮
  const showFooter = mode === 'edit' || createMode === 'manual'

  // 获取当前 tab 的资源列表
  const currentResources = resources[activeTab] || []
  const currentTabConfig = tabConfig[activeTab]

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={mode === 'create' ? '' : '编辑技能'}
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

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message={`确定要删除文件 "${deletingFileName}" 吗？此操作不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDeleteResource}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeletingFileName(null)
        }}
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
          title="优化技能内容"
          templateType="skill-optimize"
        />
      )}
    </>
  )
}
