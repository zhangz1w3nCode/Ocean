import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useToastStore } from '../../stores/toastStore'
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../agent/AgentLoopLogger'
import { Switch } from '../ui'
import {
  FileText,
  FolderTree,
  Terminal,
  Settings2,
  Sparkles,
  Cpu,
  Check,
  AlertCircle,
  ChevronDown,
  Zap,
  Search,
  FileSearch,
  FileEdit,
  Square,
  Send,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react'
import type { AgenticToolType, LLMProvider } from '../../types'
import { isElectron } from '../../utils/storage'

// 工具图标映射 - 使用 pi-coding-agent 提供的工具
const toolIcons: Record<AgenticToolType, typeof FileText> = {
  'file-read': FileText,
  'file-write': FileText,
  'file-edit': FileEdit,
  'file-ls': FolderTree,
  'file-grep': Search,
  'file-find': FileSearch,
  'bash-execute': Terminal
}

// 工具标签映射
const toolLabels: Record<AgenticToolType, string> = {
  'file-read': '文件读取',
  'file-write': '文件写入',
  'file-edit': '文件编辑',
  'file-ls': '目录列表',
  'file-grep': '内容搜索',
  'file-find': '文件查找',
  'bash-execute': '终端执行'
}

export const AgenticSettings: FC = () => {
  const { agenticConfig, toggleAgenticEnabled, toggleAgenticTool, updateAgenticConfig, setCurrentCategory } = useSettingsStore()
  const { currentProject } = useProjectStore()
  const { addToast } = useToastStore()

  // 本地状态：直接从 llm-config.json 读取的提供商列表
  const [llmProviders, setLLMProviders] = useState<LLMProvider[]>([])
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const providerDropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  // 卡片折叠状态 - 默认全部折叠
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['llm', 'tools', 'params', 'agentic-debug']))

  // Agent Loop 任务输入
  const [agentTask, setAgentTask] = useState('')

  // 使用新的 useAgentLoop hook
  const {
    steps: agentSteps,
    isRunning: isAgentRunning,
    expandedSteps,
    toggleStepExpand,
    clearSteps: clearAgentSteps,
    execute: executeAgentLoop,
    abort: abortAgentLoop
  } = useAgentLoop({
    onComplete: (result) => {
      if (result.success) {
        addToast('Agent 执行完成', 'success')
      } else {
        addToast(result.error || 'Agent 执行失败', 'error')
      }
    },
    onError: (error) => {
      addToast(error.message || 'Agent 执行失败', 'error')
    }
  })

  // 切换卡片折叠状态
  const toggleSectionCollapse = (sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId)
      } else {
        newSet.add(sectionId)
      }
      return newSet
    })
  }

  // 组件挂载时读取 llm-config.json
  useEffect(() => {
    const loadLLMProviders = async () => {
      if (isElectron() && window.electronAPI?.loadLLMConfig) {
        try {
          const result = await window.electronAPI.loadLLMConfig()
          if (result.success && result.config?.providers) {
            setLLMProviders(result.config.providers)
          }
        } catch (error) {
          console.error('加载 LLM 配置失败:', error)
        }
      }
    }
    loadLLMProviders()
  }, [])

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target as Node)) {
        setIsProviderDropdownOpen(false)
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggleEnabled = (enabled: boolean) => {
    toggleAgenticEnabled(enabled)
    addToast(enabled ? 'Agentic 模式已启用' : 'Agentic 模式已禁用', 'success')
  }

  const handleToggleTool = (toolType: AgenticToolType, enabled: boolean) => {
    toggleAgenticTool(toolType, enabled)
    const toolName = toolLabels[toolType]
    addToast(`${toolName} ${enabled ? '已启用' : '已禁用'}`, 'success')
  }

  const handleMaxIterationsChange = (value: number) => {
    updateAgenticConfig({ maxIterations: value })
  }

  const handleTimeoutChange = (value: number) => {
    updateAgenticConfig({ timeout: value })
  }

  // 获取所有已配置的 LLM 提供商
  const allProviders = llmProviders
  const selectedProvider = agenticConfig.providerId
    ? allProviders.find(p => p.id === agenticConfig.providerId)
    : allProviders[0]

  // 获取当前选中的模型
  const selectedModel = agenticConfig.modelId
    ? selectedProvider?.availableModels.find(m => m === agenticConfig.modelId)
    : selectedProvider?.defaultModel

  // 检查 LLM 配置状态
  const hasLLMConfig = allProviders.length > 0

  // 处理提供商选择变化
  const handleProviderChange = (providerId: string) => {
    const newProvider = allProviders.find(p => p.id === providerId)

    // 切换提供商时，重置模型选择（使用新提供商的默认模型）
    const newModelId = newProvider?.defaultModel

    updateAgenticConfig({
      providerId: providerId,
      modelId: newModelId
    })
    setIsProviderDropdownOpen(false)
    addToast('LLM 提供商已更新', 'success')
  }

  // 处理模型选择变化
  const handleModelChange = (modelId: string) => {
    updateAgenticConfig({ modelId: modelId })
    setIsModelDropdownOpen(false)
    addToast('模型已更新', 'success')
  }

  // 执行 Agent Loop（使用新的 useAgentLoop hook）
  const handleRunAgentLoop = async () => {
    if (!selectedProvider || !selectedModel) {
      addToast('请先选择 LLM 提供商和模型', 'warning')
      return
    }

    if (!agentTask.trim()) {
      addToast('请输入要执行的任务', 'warning')
      return
    }

    if (!currentProject?.path) {
      addToast('请先选择一个项目', 'warning')
      return
    }

    const enabledTools = agenticConfig.tools.filter(t => t.enabled)
    if (enabledTools.length === 0) {
      addToast('请至少启用一个工具', 'warning')
      return
    }

    console.log('='.repeat(60))
    console.log('[Agent Loop UI] 开始执行 Agent Loop')
    console.log('[Agent Loop UI] 任务:', agentTask)
    console.log('[Agent Loop UI] 提供商:', selectedProvider.name)
    console.log('[Agent Loop UI] 模型:', selectedModel)
    console.log('[Agent Loop UI] 工具:', enabledTools.map(t => t.type).join(', '))
    console.log('='.repeat(60))

    try {
      await executeAgentLoop({
        task: agentTask,
        tools: enabledTools,
        provider: selectedProvider,
        model: selectedModel,
        projectPath: currentProject.path,
        maxIterations: agenticConfig.maxIterations,
        timeout: agenticConfig.timeout
      })
    } catch (error) {
      console.error('[Agent Loop UI] 执行失败:', error)
    }
  }

  // 中止 Agent Loop
  const handleAbortAgentLoop = async () => {
    try {
      await abortAgentLoop()
      addToast('已发送中止信号', 'warning')
    } catch (error) {
      console.error('中止 Agent Loop 失败:', error)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 页面头部 */}
      <div className="flex items-center justify-end mb-6">
        {/* 总开关 */}
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className={agenticConfig.enabled ? 'text-macos-accent' : 'text-gray-400'} />
            <span className="text-sm font-medium text-gray-700">
              {agenticConfig.enabled ? 'Agentic 模式已启用' : 'Agentic 模式已禁用'}
            </span>
          </div>
          <Switch
            checked={agenticConfig.enabled}
            onChange={handleToggleEnabled}
          />
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 space-y-6 overflow-y-auto">
        {/* LLM 配置状态 */}
        {!hasLLMConfig && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle size={20} className="text-macos-error mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-800 font-medium">未配置 LLM 提供商</p>
              <p className="text-sm text-red-700 mt-1">
                Agentic 模式需要 LLM 驱动才能工作。请先前往
                <button
                  onClick={() => setCurrentCategory('llm')}
                  className="mx-1 text-red-800 underline hover:text-red-900 font-medium"
                >
                  LLM 设置
                </button>
                配置至少一个 LLM 提供商。
              </p>
            </div>
          </div>
        )}

        {/* LLM 提供商选择 */}
        <div className={`bg-white rounded-lg border ${agenticConfig.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'} transition-opacity`}>
          <div
            className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleSectionCollapse('llm')}
          >
            <Cpu size={18} className="text-macos-text-secondary" />
            <h3 className="font-medium text-gray-900 flex-1">LLM 配置</h3>
            <ChevronDown
              size={18}
              className={`text-macos-text-tertiary transition-transform duration-200 ${!collapsedSections.has('llm') ? 'rotate-180' : ''}`}
            />
          </div>

          <div className={`transition-all duration-200 ${collapsedSections.has('llm') ? 'hidden' : ''}`}>
          <div className="p-5">
            {hasLLMConfig ? (
              <div className="space-y-4">
                {/* 当前选中的 LLM 信息卡片 */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Check size={20} className="text-macos-success" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {selectedProvider?.name || '未选择'}
                      </p>
                      <p className="text-xs text-macos-text-secondary">
                        {selectedModel || '未指定模型'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-full font-medium">
                    当前使用
                  </span>
                </div>

                {/* 第一步：选择提供商 */}
                <div className="relative" ref={providerDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="text-macos-accent mr-1">①</span>选择 LLM 提供商
                  </label>
                  <div
                    onClick={() => {
                      if (agenticConfig.enabled && allProviders.length > 0) {
                        setIsProviderDropdownOpen(!isProviderDropdownOpen)
                        setIsModelDropdownOpen(false)
                      }
                    }}
                    className={`w-full px-4 py-2.5 bg-white border rounded-lg text-sm
                               transition-all duration-200 cursor-pointer flex items-center justify-between
                               ${agenticConfig.enabled && allProviders.length > 0
                                 ? 'border-gray-300 hover:border-gray-400'
                                 : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
                  >
                    <span className="font-medium text-gray-900">
                      {selectedProvider?.name || '选择提供商'}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-macos-text-tertiary transition-transform duration-200 ${isProviderDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </div>

                  {/* 下拉选项列表 */}
                  {isProviderDropdownOpen && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <div className="max-h-60 overflow-y-auto">
                        {allProviders.map((provider) => (
                          <div
                            key={provider.id}
                            onClick={() => handleProviderChange(provider.id)}
                            className={`px-4 py-3 cursor-pointer transition-colors duration-150 flex items-center justify-between
                                       ${provider.id === selectedProvider?.id
                                         ? 'bg-gray-100 text-gray-900'
                                         : 'hover:bg-gray-50 text-gray-900'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                provider.id === selectedProvider?.id ? 'bg-macos-success' : 'bg-gray-300'
                              }`} />
                              <span className="font-medium">{provider.name}</span>
                            </div>
                            {provider.id === selectedProvider?.id && (
                              <Check size={16} className="text-macos-accent" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 第二步：选择模型 */}
                <div className="relative" ref={modelDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="text-macos-accent mr-1">②</span>选择模型
                  </label>
                  <div
                    onClick={() => {
                      if (agenticConfig.enabled && selectedProvider) {
                        setIsModelDropdownOpen(!isModelDropdownOpen)
                        setIsProviderDropdownOpen(false)
                      }
                    }}
                    className={`w-full px-4 py-2.5 bg-white border rounded-lg text-sm
                               transition-all duration-200 cursor-pointer flex items-center justify-between
                               ${agenticConfig.enabled && selectedProvider
                                 ? 'border-gray-300 hover:border-gray-400'
                                 : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
                  >
                    <span className="font-medium text-gray-900">
                      {selectedModel || '选择模型'}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-macos-text-tertiary transition-transform duration-200 ${isModelDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </div>

                  {/* 下拉选项列表 */}
                  {isModelDropdownOpen && selectedProvider && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      <div className="max-h-60 overflow-y-auto">
                        {selectedProvider.availableModels.map((model) => (
                          <div
                            key={model}
                            onClick={() => handleModelChange(model)}
                            className={`px-4 py-3 cursor-pointer transition-colors duration-150 flex items-center justify-between
                                       ${model === selectedModel
                                         ? 'bg-gray-100 text-gray-900'
                                         : 'hover:bg-gray-50 text-gray-900'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                model === selectedModel ? 'bg-macos-success' : 'bg-gray-300'
                              }`} />
                              <span className="font-medium">{model}</span>
                              {model === selectedProvider.defaultModel && (
                                <span className="text-xs text-gray-500">(默认)</span>
                              )}
                            </div>
                            {model === selectedModel && (
                              <Check size={16} className="text-macos-accent" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-macos-text-secondary">
                <p>未找到 LLM 提供商配置</p>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* 工具配置 */}
        <div className={`bg-white rounded-lg border ${agenticConfig.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'} transition-opacity`}>
          <div
            className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleSectionCollapse('tools')}
          >
            <Settings2 size={18} className="text-macos-text-secondary" />
            <h3 className="font-medium text-gray-900 flex-1">工具配置</h3>
            <ChevronDown
              size={18}
              className={`text-macos-text-tertiary transition-transform duration-200 ${!collapsedSections.has('tools') ? 'rotate-180' : ''}`}
            />
          </div>

          <div className={`transition-all duration-200 ${collapsedSections.has('tools') ? 'hidden' : ''}`}>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {agenticConfig.tools.map((tool) => {
                const Icon = toolIcons[tool.type]
                return (
                  <div
                    key={tool.type}
                    className={`p-4 rounded-lg border transition-all duration-200
                               ${agenticConfig.enabled && tool.enabled
                                 ? 'bg-gray-50 border-gray-200'
                                 : 'bg-gray-50/50 border-gray-200 opacity-70'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                                        ${agenticConfig.enabled && tool.enabled
                                          ? 'bg-gray-100 text-gray-700'
                                          : 'bg-gray-200 text-gray-500'}`}
                        >
                          <Icon size={18} className={
                            agenticConfig.enabled && tool.enabled
                              ? 'text-gray-700'
                              : 'text-gray-500'
                          } />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{toolLabels[tool.type]}</p>
                          <p className="text-xs text-gray-500">{tool.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={tool.enabled}
                        onChange={(enabled) => handleToggleTool(tool.type, enabled)}
                        disabled={!agenticConfig.enabled}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          </div>
        </div>

        {/* 高级参数配置 */}
        <div className={`bg-white rounded-lg border ${agenticConfig.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'} transition-opacity`}>
          <div
            className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleSectionCollapse('params')}
          >
            <SlidersHorizontal size={18} className="text-macos-text-secondary" />
            <h3 className="font-medium text-gray-900 flex-1">高级参数</h3>
            <ChevronDown
              size={18}
              className={`text-macos-text-tertiary transition-transform duration-200 ${!collapsedSections.has('params') ? 'rotate-180' : ''}`}
            />
          </div>

          <div className={`transition-all duration-200 ${collapsedSections.has('params') ? 'hidden' : ''}`}>
          <div className="p-5 space-y-6">
            {/* 最大迭代次数 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">最大迭代次数</label>
                <span className="text-sm text-gray-700 font-medium">{agenticConfig.maxIterations}</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={agenticConfig.maxIterations}
                onChange={(e) => handleMaxIterationsChange(parseInt(e.target.value))}
                disabled={!agenticConfig.enabled}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-600 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                AI Agent 单次任务的最大工具调用次数，防止无限循环
              </p>
            </div>

            {/* 超时时间 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">超时时间（秒）</label>
                <span className="text-sm text-gray-700 font-medium">{agenticConfig.timeout}s</span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="10"
                value={agenticConfig.timeout}
                onChange={(e) => handleTimeoutChange(parseInt(e.target.value))}
                disabled={!agenticConfig.enabled}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-600 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                AI Agent 单次任务的最大执行时间
              </p>
            </div>
          </div>
          </div>
        </div>

        {/* Agentic 调试区域 */}
        <div className={`bg-white rounded-lg border ${agenticConfig.enabled && hasLLMConfig ? 'border-gray-200' : 'border-gray-100 opacity-60'} transition-opacity`}>
          <div
            className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => toggleSectionCollapse('agentic-debug')}
          >
            <Zap size={18} className="text-macos-text-secondary" />
            <h3 className="font-medium text-gray-900 flex-1">Agentic 调试</h3>
            <ChevronDown
              size={18}
              className={`text-macos-text-tertiary transition-transform duration-200 ${!collapsedSections.has('agentic-debug') ? 'rotate-180' : ''}`}
            />
          </div>

          <div className={`transition-all duration-200 ${collapsedSections.has('agentic-debug') ? 'hidden' : ''}`}>
          <div className="p-5">
            {/* 任务输入区域 */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  任务描述
                </label>
                <div className="relative">
                  <textarea
                    value={agentTask}
                    onChange={(e) => setAgentTask(e.target.value)}
                    placeholder="例如：查看 src 目录下的所有 TypeScript 文件，找出包含 'export' 关键字的文件"
                    disabled={!agenticConfig.enabled || isAgentRunning}
                    className={`w-full px-4 py-3 bg-white border rounded-lg text-sm resize-none
                               transition-all duration-200
                               ${agenticConfig.enabled && !isAgentRunning
                                 ? 'border-gray-300 focus:border-gray-400 focus:ring-2 focus:ring-gray-100'
                                 : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
                    rows={3}
                  />
                  {!currentProject?.path && (
                    <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle size={12} />
                      请先选择一个项目
                    </p>
                  )}
                </div>
              </div>

              {/* 控制按钮 */}
              <div className="flex items-center gap-3">
                {!isAgentRunning ? (
                  <button
                    onClick={handleRunAgentLoop}
                    disabled={!agenticConfig.enabled || !selectedProvider || !selectedModel || !agentTask.trim() || !currentProject?.path}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-900
                               text-white rounded-lg font-medium text-sm
                               hover:bg-gray-800 active:bg-gray-700
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all duration-200"
                  >
                    <Send size={16} />
                    开始执行
                  </button>
                ) : (
                  <button
                    onClick={handleAbortAgentLoop}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600
                               text-white rounded-lg font-medium text-sm
                               hover:bg-red-700 active:bg-red-800
                               transition-all duration-200"
                  >
                    <Square size={16} />
                    中止执行
                  </button>
                )}

                <button
                  onClick={clearAgentSteps}
                  disabled={isAgentRunning || agentSteps.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-100
                             text-gray-700 rounded-lg font-medium text-sm
                             hover:bg-gray-200 active:bg-gray-300
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200"
                >
                  <RotateCcw size={16} />
                  清除结果
                </button>
              </div>

              {/* Agent 执行日志 - 使用新的 AgentLoopLogger 组件 */}
              <AgentLoopLogger
                steps={agentSteps}
                isRunning={isAgentRunning}
                expandedSteps={expandedSteps}
                onToggleExpand={toggleStepExpand}
                maxHeight={500}
              />
            </div>
          </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">关于 Agentic 模式</h4>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>启用后，AI 可以使用工具与本地文件系统交互</li>
            <li>能力模块等后续功能可以利用 Agentic 方式构建更智能的结果</li>
            <li>AI 可以读取项目文件作为参考，生成更符合项目上下文的内容</li>
            <li>所有文件操作都在用户授权的项目目录范围内进行</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default AgenticSettings
