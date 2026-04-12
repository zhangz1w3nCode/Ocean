import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, BookOpen, Eye, Edit3, MessageSquare, Tag, Plus, X, Check, PenLine, Bot, Loader2, Wand2, FolderOpen, ChevronRight } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { CategorySelectModal } from './CategorySelectModal'
import { useToastStore } from '../../stores/toastStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { isElectron, loadKnowledgeTemplateFile } from '../../utils/storage'
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../agent/AgentLoopLogger'
import type { KnowledgeFile } from '../../types'

// 创建模式类型
type CreateMode = 'select' | 'manual' | 'agentic'

interface KnowledgeModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (knowledge: Omit<KnowledgeFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => void
  mode: 'create' | 'edit'
  initialData?: KnowledgeFile
  existingNames?: string[]
  isNameLocked?: boolean  // 是否锁定名称字段（用于全局索引）
}

export const KnowledgeModal: FC<KnowledgeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  mode,
  initialData,
  existingNames = [],
  isNameLocked = false,
}) => {
  const { addToast } = useToastStore()
  const { agenticConfig, loadAgenticConfig } = useSettingsStore()
  const { currentProject } = useProjectStore()

  // 创建模式
  const [createMode, setCreateMode] = useState<CreateMode>('select')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [category, setCategory] = useState('')

  // 分类选择弹窗状态
  const [isCategorySelectOpen, setIsCategorySelectOpen] = useState(false)

  // Agentic 创建的用户描述
  const [userDescription, setUserDescription] = useState('')

  // 标签输入状态
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  // 计算排除路径（编辑模式下排除当前知识库）
  const excludePath = mode === 'edit' && initialData ? `.claude/knowledges/${initialData.name}.md` : undefined

  // 编辑/预览模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)

  // 返回选择确认弹窗状态
  const [showBackConfirm, setShowBackConfirm] = useState(false)

  // 验证失败的字段
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

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

  // 初始数据快照（用于检测是否有修改）
  const initialSnapshot = useRef<string>('')

  // 生成当前数据快照
  const getSnapshot = () => {
    return JSON.stringify({
      name,
      description,
      content,
      tags,
      category,
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
        setTags(initialData.tags || [])
        setCategory(initialData.category || '')
        setCreateMode('manual') // 编辑模式直接进入手动模式
      } else {
        // 创建模式：重置为默认值
        setName('')
        setDescription('')
        setContent('')
        setTags([])
        setCategory('')
        setUserDescription('')
        setCreateMode('select')
      }
      setIsAddingTag(false)
      setNewTagInput('')
      setInvalidFields(new Set())
      setViewMode('edit')
      clearAgenticSteps()
      // 延迟设置快照，确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, mode, initialData, loadAgenticConfig, clearAgenticSteps])

  // 标签输入框自动聚焦
  useEffect(() => {
    if (isAddingTag && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isAddingTag])

  // 添加标签
  const handleAddTag = () => {
    const trimmedTag = newTagInput.trim()
    if (!trimmedTag) {
      setIsAddingTag(false)
      setNewTagInput('')
      return
    }

    // 检查标签是否已存在
    if (tags.includes(trimmedTag)) {
      addToast('标签已存在', 'warning')
      return
    }

    // 限制标签长度
    if (trimmedTag.length > 20) {
      addToast('标签长度不能超过20个字符', 'warning')
      return
    }

    setTags([...tags, trimmedTag])
    setNewTagInput('')
    setIsAddingTag(false)
  }

  // 删除标签
  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  // 取消添加标签
  const handleCancelAddTag = () => {
    setIsAddingTag(false)
    setNewTagInput('')
  }

  // 标签输入键盘事件
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    } else if (e.key === 'Escape') {
      handleCancelAddTag()
    }
  }

  // Agentic 智能生成知识 - 使用 useAgentLoop hook
  const handleAgenticGenerate = async () => {
    // 验证用户描述
    if (!userDescription.trim()) {
      setInvalidFields(new Set(['userDescription']))
      addToast('请输入知识描述', 'warning')
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
    const promptTemplate = await loadKnowledgeTemplateFile('agentic-create')

    // 替换占位符，如果模板中没有占位符则自动追加
    let task: string
    if (promptTemplate.includes('{{userDescription}}')) {
      task = promptTemplate.replace(/\{\{userDescription\}\}/g, userDescription)
    } else {
      // 降级处理：模板中没有占位符，在末尾追加用户描述
      console.warn('[Agentic Knowledge Create] 模板中未找到 {{userDescription}} 占位符，将自动追加用户描述')
      task = `${promptTemplate}\n\n## 用户需求\n${userDescription}`
    }

    // 获取启用的工具
    const enabledTools = agenticConfig.tools.filter(t => t.enabled)

    // 获取 LLM 提供商
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
    console.log('[Agentic Knowledge Create] 开始执行 Agent Loop')
    console.log('[Agentic Knowledge Create] 任务:', userDescription)
    console.log('[Agentic Knowledge Create] 提供商:', selectedProvider.name)
    console.log('[Agentic Knowledge Create] 模型:', selectedModel)
    console.log('[Agentic Knowledge Create] 工具:', enabledTools.map(t => t.type).join(', '))
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
      console.error('[Agentic Knowledge Create] 执行失败:', error)
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
    // 验证知识名称
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入知识名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 创建模式下检查名称唯一性
    if (mode === 'create' && existingNames.includes(name.trim())) {
      addToast('知识名称已存在，请使用其他名称', 'warning')
      return
    }

    // 验证内容
    if (!content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入知识内容', 'warning')
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
      tags,
      category: category.trim(),
      filepath: category.trim() ? `${category.trim()}/${name.trim()}` : name.trim(),
    })

    // 显示成功提示
    addToast(mode === 'create' ? '知识创建成功' : '知识更新成功', 'success')

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
    setTags([])
    setCategory('')
    setUserDescription('')
    setIsAddingTag(false)
    setNewTagInput('')
    setInvalidFields(new Set())
    setCreateMode('select')
    clearAgenticSteps()
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
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <PenLine size={24} className="text-blue-500" />
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
      {/* 用户描述输入 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Bot size={16} className="text-macos-text-secondary" />
          描述你想要创建的知识
        </label>
        <Textarea
          placeholder="例如：帮我创建一个代码规范的知识文档，包含命名规范、代码风格、注释规范等内容...&#10;&#10;Agentic 模式会：&#10;1. 首先查看 .claude/knowledges/ 目录下已有的知识文档&#10;2. 参考已有文档的格式和风格&#10;3. 根据你的描述创建新的知识文档"
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

  // 渲染手动编辑界面
  const renderManualEdit = () => (
    <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
      {/* 知识名称 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Type size={16} className="text-macos-text-secondary" />
          知识名称 *
        </label>
        <Input
          placeholder="例如：业务知识文档"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (invalidFields.has('name')) setInvalidFields(new Set())
          }}
          autoFocus={createMode === 'manual'}
          disabled={mode === 'edit' || isNameLocked}
          invalid={invalidFields.has('name')}
        />
        {(mode === 'edit' || isNameLocked) && (
          <p className="mt-1 text-xs text-macos-text-tertiary">
            {isNameLocked ? '全局索引文件名固定为 INDEX' : '编辑模式下知识名称不可修改'}
          </p>
        )}
      </div>

      {/* 知识描述 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <MessageSquare size={16} className="text-macos-text-secondary" />
          知识描述
        </label>
        <Textarea
          placeholder="简要描述这个知识的用途..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      {/* 知识分类 - 点击弹出文件夹选择器 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <FolderOpen size={16} className="text-macos-text-secondary" />
          知识分类
        </label>
        <button
          type="button"
          onClick={() => setIsCategorySelectOpen(true)}
          className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm border rounded-lg transition-colors
            ${category ? 'border-gray-200 bg-white hover:border-gray-300' : 'border-gray-200 bg-white hover:border-gray-300 text-macos-text-tertiary'}`}
        >
          <span className="flex items-center gap-2 truncate">
            {category ? (
              <>
                <FolderOpen size={14} className="text-gray-400 flex-shrink-0" />
                <span className="text-gray-700">{category}</span>
              </>
            ) : (
              <span>点击选择分类（留空表示根目录）</span>
            )}
          </span>
          <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
        </button>
        <p className="mt-1 text-xs text-macos-text-tertiary">
          分类路径对应子目录结构，支持多级分类
        </p>
      </div>

      {/* 知识标签 */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Tag size={16} className="text-macos-text-secondary" />
          知识标签
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {/* 已添加的标签 */}
          {tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-sm"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(index)}
                className="ml-0.5 hover:text-blue-800 transition-colors"
              >
                <X size={14} />
              </button>
            </span>
          ))}

          {/* 添加标签按钮或输入框 */}
          {isAddingTag ? (
            <div className="inline-flex items-center gap-1">
              <input
                ref={tagInputRef}
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="输入标签"
                className="px-2.5 py-1 w-24 text-sm border border-gray-300 rounded-full focus:outline-none focus:border-gray-400"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Check size={16} className="text-green-600" />
              </button>
              <button
                type="button"
                onClick={handleCancelAddTag}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingTag(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-gray-300 text-gray-500 rounded-full text-sm hover:border-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus size={14} />
              添加标签
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-macos-text-tertiary">标签用于分类和检索知识文档</p>
      </div>

      {/* 知识内容 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
            <BookOpen size={16} className="text-macos-text-secondary" />
            知识内容 *
          </label>
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

        {/* 编辑模式 */}
        {viewMode === 'edit' && (
          <MarkdownEditor
            placeholder="在此输入知识内容，支持 Markdown 格式...&#10;&#10;例如：&#10;# 知识说明&#10;- 这是业务知识...&#10;&#10;提示：输入@和%可引用其他业务内容"
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
        title={mode === 'create' ? '' : '编辑知识'}
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

      {/* 分类选择弹窗 */}
      <CategorySelectModal
        isOpen={isCategorySelectOpen}
        onClose={() => setIsCategorySelectOpen(false)}
        onSelect={(path) => setCategory(path)}
        currentCategory={category}
      />
    </>
  )
}