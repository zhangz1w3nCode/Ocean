/**
 * useAgenticExecutor - Agentic 执行器 Hook
 *
 * 封装 AgenticSettings 的核心能力，让其他业务模块一行代码复用：
 * - 自动获取 Agentic 配置（工具、LLM、参数）
 * - 自动获取项目路径
 * - 自动校验（配置是否完整、工具是否启用、是否有项目）
 * - 自动 Toast 通知
 * - 内置日志展示组件
 *
 * 使用示例：
 * ```typescript
 * const { execute, isRunning, AgenticPanel, canExecute } = useAgenticExecutor({
 *   taskBuilder: (input) => `根据描述生成能力：${input}`,
 *   onComplete: (result, input) => { console.log('完成', result) },
 *   onError: (error, input) => { console.log('失败', error) }
 * })
 *
 * // 执行
 * await execute(userInput)
 *
 * // 渲染日志面板
 * <AgenticPanel />
 * ```
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { useProjectStore } from '../stores/projectStore'
import { useToastStore } from '../stores/toastStore'
import { useAgentLoop, AgentLoopExecuteResult, AgentLoopStep } from './useAgentLoop'
import { AgentLoopLogger } from '../components/agent/AgentLoopLogger'
import type { LLMProvider, AgenticToolConfig } from '../types'
import { isElectron } from '../utils/storage'

// 执行器配置选项
export interface UseAgenticExecutorOptions<TInput = string> {
  /** 构建任务提示词 */
  taskBuilder: (input: TInput) => string

  /** 执行完成回调 */
  onComplete?: (result: AgentLoopExecuteResult, input: TInput) => void

  /** 执行失败回调 */
  onError?: (error: Error, input: TInput) => void

  /** 步骤添加回调（可选） */
  onStepAdd?: (step: AgentLoopStep) => void

  /** Toast 成功消息（默认：执行完成） */
  successMessage?: string

  /** Toast 失败消息（默认：执行失败） */
  errorMessage?: string

  /** 日志面板标题 */
  logTitle?: string

  /** 日志面板最大高度 */
  logMaxHeight?: number

  /** 是否自动显示 Toast */
  autoToast?: boolean

  /** 是否自动清除上次的步骤（执行前） */
  autoClearSteps?: boolean

  /** 自定义工具过滤器（可选，默认使用启用的工具） */
  toolFilter?: (tools: AgenticToolConfig[]) => AgenticToolConfig[]
}

// 执行器返回值
export interface UseAgenticExecutorReturn<TInput = string> {
  // ===== 核心方法 =====
  /** 执行 Agentic 任务 */
  execute: (input: TInput) => Promise<AgentLoopExecuteResult | null>

  /** 中止执行 */
  abort: () => Promise<void>

  /** 清除步骤 */
  clearSteps: () => void

  // ===== 状态 =====
  /** 是否执行中 */
  isRunning: boolean

  /** 步骤列表 */
  steps: AgentLoopStep[]

  /** 执行结果 */
  result: AgentLoopExecuteResult | null

  /** 错误对象 */
  error: Error | null

  /** 是否可执行（配置完整） */
  canExecute: boolean

  /** 不能执行的原因 */
  cannotExecuteReason: string | null

  // ===== 配置信息（供 UI 展示） =====
  /** Agentic 配置 */
  agenticConfig: {
    enabled: boolean
    maxIterations: number
    timeout: number
    enabledToolsCount: number
  }

  /** 当前选中的 LLM 提供商 */
  selectedProvider: LLMProvider | null

  /** 当前选中的模型 */
  selectedModel: string | null

  /** 是否有 LLM 配置 */
  hasLLMConfig: boolean

  /** 当前项目路径 */
  projectPath: string | null

  // ===== UI 组件 =====
  /** 日志展示面板组件 */
  AgenticPanel: React.FC<AgenticPanelProps>

  /** 紧凑的执行状态指示器 */
  AgenticStatus: React.FC
}

// 日志面板属性
export interface AgenticPanelProps {
  /** 自定义标题 */
  title?: string

  /** 自定义最大高度 */
  maxHeight?: number

  /** 是否显示步骤数 */
  showStepCount?: boolean

  /** 是否自动滚动 */
  autoScroll?: boolean

  /** 额外的头部操作按钮 */
  headerActions?: React.ReactNode

  /** 自定义样式 */
  className?: string

  /** 空状态内容 */
  emptyContent?: React.ReactNode
}

export function useAgenticExecutor<TInput = string>(
  options: UseAgenticExecutorOptions<TInput>
): UseAgenticExecutorReturn<TInput> {
  const {
    taskBuilder,
    onComplete,
    onError,
    onStepAdd,
    successMessage = '执行完成',
    errorMessage = '执行失败',
    logTitle = '执行日志',
    logMaxHeight = 500,
    autoToast = true,
    autoClearSteps = true,
    toolFilter
  } = options

  // ===== 获取全局状态 =====
  const { agenticConfig } = useSettingsStore()
  const { currentProject } = useProjectStore()
  const { addToast } = useToastStore()

  // ===== 本地状态：LLM 提供商 =====
  const [llmProviders, setLLMProviders] = useState<LLMProvider[]>([])

  // 加载 LLM 配置
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

  // ===== 计算派生状态 =====
  const hasLLMConfig = llmProviders.length > 0

  const selectedProvider = useMemo(() => {
    if (!hasLLMConfig) return null
    if (agenticConfig.providerId) {
      return llmProviders.find(p => p.id === agenticConfig.providerId) || llmProviders[0]
    }
    return llmProviders[0]
  }, [llmProviders, agenticConfig.providerId, hasLLMConfig])

  const selectedModel = useMemo(() => {
    if (!selectedProvider) return null
    if (agenticConfig.modelId && selectedProvider.availableModels.includes(agenticConfig.modelId)) {
      return agenticConfig.modelId
    }
    return selectedProvider.defaultModel
  }, [selectedProvider, agenticConfig.modelId])

  const projectPath = currentProject?.path || null

  // 获取启用的工具
  const enabledTools = useMemo(() => {
    const tools = agenticConfig.tools.filter(t => t.enabled)
    return toolFilter ? toolFilter(tools) : tools
  }, [agenticConfig.tools, toolFilter])

  // ===== 校验是否可执行 =====
  const { canExecute, cannotExecuteReason } = useMemo(() => {
    if (!agenticConfig.enabled) {
      return { canExecute: false, cannotExecuteReason: 'Agentic 模式未启用' }
    }
    if (!hasLLMConfig) {
      return { canExecute: false, cannotExecuteReason: '未配置 LLM 提供商' }
    }
    if (!selectedProvider) {
      return { canExecute: false, cannotExecuteReason: '未选择 LLM 提供商' }
    }
    if (!selectedModel) {
      return { canExecute: false, cannotExecuteReason: '未选择模型' }
    }
    if (!projectPath) {
      return { canExecute: false, cannotExecuteReason: '未选择项目' }
    }
    if (enabledTools.length === 0) {
      return { canExecute: false, cannotExecuteReason: '未启用任何工具' }
    }
    return { canExecute: true, cannotExecuteReason: null }
  }, [agenticConfig.enabled, hasLLMConfig, selectedProvider, selectedModel, projectPath, enabledTools])

  // ===== 使用 useAgentLoop =====
  const {
    steps,
    isRunning,
    execute: executeAgentLoop,
    abort,
    clearSteps,
    expandedSteps,
    toggleStepExpand,
    expandAll,
    collapseAll,
    result,
    error,
    retry
  } = useAgentLoop({
    onComplete: (result) => {
      if (autoToast) {
        if (result.success) {
          addToast(successMessage, 'success')
        } else {
          addToast(result.error || errorMessage, 'error')
        }
      }
    },
    onError: (error) => {
      if (autoToast) {
        addToast(error.message || errorMessage, 'error')
      }
    },
    onStepAdd
  })

  // ===== 封装执行方法 =====
  const execute = useCallback(async (input: TInput): Promise<AgentLoopExecuteResult | null> => {
    // 前置校验
    if (!canExecute) {
      const reason = cannotExecuteReason || '无法执行'
      addToast(reason, 'warning')
      throw new Error(reason)
    }

    // 自动清除步骤
    if (autoClearSteps) {
      clearSteps()
    }

    const task = taskBuilder(input)

    console.log('='.repeat(60))
    console.log('[AgenticExecutor] 开始执行')
    console.log('[AgenticExecutor] 任务:', task)
    console.log('[AgenticExecutor] 提供商:', selectedProvider!.name)
    console.log('[AgenticExecutor] 模型:', selectedModel)
    console.log('[AgenticExecutor] 工具:', enabledTools.map(t => t.type).join(', '))
    console.log('='.repeat(60))

    try {
      const executeResult = await executeAgentLoop({
        task,
        tools: enabledTools,
        provider: selectedProvider!,
        model: selectedModel!,
        projectPath: projectPath!,
        maxIterations: agenticConfig.maxIterations,
        timeout: agenticConfig.timeout
      })

      onComplete?.(executeResult, input)
      return executeResult
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      onError?.(errorObj, input)
      throw errorObj
    }
  }, [
    canExecute,
    cannotExecuteReason,
    taskBuilder,
    enabledTools,
    selectedProvider,
    selectedModel,
    projectPath,
    agenticConfig.maxIterations,
    agenticConfig.timeout,
    executeAgentLoop,
    clearSteps,
    autoClearSteps,
    addToast,
    onComplete,
    onError
  ])

  // ===== 日志面板组件 =====
  const AgenticPanel: React.FC<AgenticPanelProps> = useCallback(({
    title = logTitle,
    maxHeight = logMaxHeight,
    showStepCount = true,
    autoScroll = true,
    headerActions,
    className = '',
    emptyContent
  }) => {
    return (
      <AgentLoopLogger
        steps={steps}
        isRunning={isRunning}
        expandedSteps={expandedSteps}
        onToggleExpand={toggleStepExpand}
        title={title}
        maxHeight={maxHeight}
        showStepCount={showStepCount}
        autoScroll={autoScroll}
        headerActions={headerActions}
        className={className}
        emptyContent={emptyContent}
      />
    )
  }, [steps, isRunning, expandedSteps, toggleStepExpand, logTitle, logMaxHeight])

  // ===== 状态指示器组件 =====
  const AgenticStatus: React.FC = useCallback(() => {
    if (!agenticConfig.enabled) {
      return <span className="text-gray-400">Agentic 未启用</span>
    }
    if (isRunning) {
      return <span className="text-blue-500">执行中...</span>
    }
    if (steps.length > 0) {
      return <span className="text-green-500">已完成 {steps.length} 步</span>
    }
    return <span className="text-gray-500">就绪</span>
  }, [agenticConfig.enabled, isRunning, steps.length])

  return {
    // 方法
    execute,
    abort,
    clearSteps,

    // 状态
    isRunning,
    steps,
    result,
    error,

    // 校验
    canExecute,
    cannotExecuteReason,

    // 配置信息
    agenticConfig: {
      enabled: agenticConfig.enabled,
      maxIterations: agenticConfig.maxIterations,
      timeout: agenticConfig.timeout,
      enabledToolsCount: enabledTools.length
    },
    selectedProvider,
    selectedModel,
    hasLLMConfig,
    projectPath,

    // UI 组件
    AgenticPanel,
    AgenticStatus
  }
}

export default useAgenticExecutor
