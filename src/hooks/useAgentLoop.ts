/**
 * useAgentLoop - Agent Loop 自定义 Hook
 *
 * 特性：
 * - 直接调用 Electron IPC，无需中间服务层
 * - 自动管理步骤列表
 * - 提供执行/中止函数
 * - 支持回调机制
 * - 自动滚动到底部
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { AgentLoopEvent, AgenticToolConfig, LLMProvider } from '../types'
import { isElectron } from '../utils/storage'

// Agent Loop 执行配置
export interface AgentLoopExecuteConfig {
  task: string
  tools: AgenticToolConfig[]
  provider: LLMProvider
  model: string
  projectPath: string
  maxIterations?: number
  timeout?: number
}

// Agent Loop 执行结果
export interface AgentLoopExecuteResult {
  success: boolean
  result: string
  error?: string
  totalTurns: number
  totalToolCalls: number
  duration: number
}

// Agent Loop 步骤（用于前端展示）
export type AgentLoopStepType =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'result'
  | 'error'
  | 'info'
  | 'turn_start'
  | 'turn_end'

export type AgentLoopStepStatus = 'pending' | 'running' | 'success' | 'error'

export interface AgentLoopStep {
  id: string
  type: AgentLoopStepType
  title: string
  content?: string
  timestamp: Date
  status: AgentLoopStepStatus
  details?: {
    request?: string
    response?: string
    duration?: number
    toolName?: string
    toolArgs?: Record<string, unknown>
    turnNumber?: number
  }
}

export interface UseAgentLoopOptions {
  onStepAdd?: (step: AgentLoopStep) => void
  onStepUpdate?: (step: AgentLoopStep, index: number) => void
  onComplete?: (result: AgentLoopExecuteResult) => void
  onError?: (error: Error) => void
  autoExpandNewSteps?: boolean
}

export interface UseAgentLoopReturn {
  // 状态
  steps: AgentLoopStep[]
  isRunning: boolean
  expandedSteps: Set<string>
  error: Error | null
  result: AgentLoopExecuteResult | null

  // 方法
  execute: (config: AgentLoopExecuteConfig) => Promise<AgentLoopExecuteResult>
  abort: () => Promise<void>
  clearSteps: () => void
  toggleStepExpand: (stepId: string) => void
  expandStep: (stepId: string) => void
  collapseStep: (stepId: string) => void
  expandAll: () => void
  collapseAll: () => void
  toggleExpandAll: () => void

  // 重试功能
  retry: () => Promise<AgentLoopExecuteResult | null>

  // 内部状态（高级使用）
  lastConfig: AgentLoopExecuteConfig | null
}

// 将 AgentLoopEvent 转换为 AgentLoopStep
function createStepFromEvent(event: AgentLoopEvent): AgentLoopStep {
  const baseStep = {
    id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(event.timestamp)
  }

  const data = event.data

  switch (event.type) {
    case 'agent_start':
      return {
        ...baseStep,
        type: 'info' as const,
        title: 'Agent 开始执行',
        status: 'success',
        content: `任务: ${data.task || ''}`
      }

    case 'thinking':
      return {
        ...baseStep,
        type: 'thinking' as const,
        title: 'LLM 思考',
        status: 'success',
        content: data.content || '',
        details: {
          response: data.content || ''
        }
      }

    case 'tool_call':
      return {
        ...baseStep,
        type: 'tool_call' as const,
        title: `调用工具: ${data.toolName || ''}`,
        status: 'running',
        details: {
          toolName: data.toolName,
          toolArgs: data.toolArgs,
          request: JSON.stringify(data.toolArgs, null, 2)
        }
      }

    case 'tool_result':
      return {
        ...baseStep,
        type: 'tool_result' as const,
        title: '工具返回结果',
        status: data.toolSuccess ? 'success' : 'error',
        content: (data.toolOutput as string)?.substring(0, 500) || '',
        details: {
          response: (data.toolOutput as string)?.substring(0, 2000)
        }
      }

    case 'error':
      return {
        ...baseStep,
        type: 'error' as const,
        title: '执行错误',
        status: 'error',
        content: data.error || '未知错误'
      }

    case 'agent_end':
      return {
        ...baseStep,
        type: 'result' as const,
        title: data.success ? '执行完成' : '执行失败',
        status: data.success ? 'success' : 'error',
        content: data.result || '',
        details: {
          duration: data.duration,
          request: `总轮次: ${data.totalTurns}\n工具调用: ${data.totalToolCalls}\n耗时: ${data.duration}ms`
        }
      }

    case 'turn_start':
      return {
        ...baseStep,
        type: 'turn_start' as const,
        title: `第 ${data.turnNumber} 轮开始`,
        status: 'running',
        details: {
          turnNumber: data.turnNumber
        }
      }

    case 'turn_end':
      return {
        ...baseStep,
        type: 'turn_end' as const,
        title: `第 ${data.turnNumber} 轮结束`,
        status: 'success',
        details: {
          turnNumber: data.turnNumber
        }
      }

    default:
      return {
        ...baseStep,
        type: 'info' as const,
        title: '未知事件',
        status: 'pending'
      }
  }
}

export function useAgentLoop(options: UseAgentLoopOptions = {}): UseAgentLoopReturn {
  const {
    onStepAdd,
    onStepUpdate,
    onComplete,
    onError
    // autoExpandNewSteps 暂不支持，步骤默认全部折叠
  } = options

  // 状态
  const [steps, setSteps] = useState<AgentLoopStep[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [error, setError] = useState<Error | null>(null)
  const [result, setResult] = useState<AgentLoopExecuteResult | null>(null)
  const [lastConfig, setLastConfig] = useState<AgentLoopExecuteConfig | null>(null)

  // refs
  const isRunningRef = useRef(false)
  const eventUnsubscribeRef = useRef<(() => void) | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 同步 ref 和 state
  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  // 清理函数
  useEffect(() => {
    return () => {
      if (eventUnsubscribeRef.current) {
        eventUnsubscribeRef.current()
        eventUnsubscribeRef.current = null
      }
      abortControllerRef.current?.abort()
    }
  }, [])

  // 添加步骤
  const addStep = useCallback((newStep: AgentLoopStep) => {
    setSteps(prev => {
      const newSteps = [...prev, newStep]
      return newSteps
    })
    onStepAdd?.(newStep)
  }, [onStepAdd])

  // 更新最后一个工具调用步骤
  const updateLastToolCallStep = useCallback((output: string, success: boolean) => {
    setSteps(prev => {
      const lastToolCallIndex = [...prev].reverse().findIndex(s => s.type === 'tool_call')
      if (lastToolCallIndex !== -1) {
        const actualIndex = prev.length - 1 - lastToolCallIndex
        const updatedSteps = [...prev]
        const step = updatedSteps[actualIndex]
        updatedSteps[actualIndex] = {
          ...step,
          status: success ? 'success' : 'error',
          content: output.substring(0, 500) || '',
          details: {
            ...step.details,
            response: output.substring(0, 2000)
          }
        }
        onStepUpdate?.(updatedSteps[actualIndex], actualIndex)
        return updatedSteps
      }
      return prev
    })
  }, [onStepUpdate])

  // 处理 Agent Loop 事件
  const handleProgressEvent = useCallback((event: AgentLoopEvent) => {
    const data = event.data

    switch (event.type) {
      case 'agent_start':
        addStep(createStepFromEvent(event))
        break

      case 'turn_start':
        // 静默处理，不显示轮次信息
        break

      case 'thinking':
        addStep(createStepFromEvent(event))
        break

      case 'tool_call':
        addStep(createStepFromEvent(event))
        break

      case 'tool_result':
        updateLastToolCallStep(
          (data.toolOutput as string) || '',
          data.toolSuccess as boolean
        )
        break

      case 'error':
        addStep(createStepFromEvent(event))
        break

      case 'agent_end':
        setSteps(prev => {
          // 检查是否已经有最终结果步骤
          if (prev.some(s => s.type === 'result')) {
            return prev
          }

          // 更新所有 running 状态的步骤为 success
          const updatedSteps = prev.map(step =>
            step.status === 'running' ? { ...step, status: 'success' as const } : step
          )

          // 添加最终结果步骤
          const success = data.success as boolean
          const finalStepId = `final-${Date.now()}`

          return [...updatedSteps, {
            id: finalStepId,
            type: 'result' as const,
            title: success ? '执行完成' : '执行失败',
            status: success ? 'success' as const : 'error' as const,
            content: (data.result as string) || '',
            timestamp: new Date(),
            details: {
              duration: data.duration as number,
              request: `总轮次: ${data.totalTurns}\n工具调用: ${data.totalToolCalls}\n耗时: ${data.duration}ms`
            }
          }]
        })
        break
    }
  }, [addStep, updateLastToolCallStep])

  // 执行 Agent Loop
  const execute = useCallback(async (config: AgentLoopExecuteConfig): Promise<AgentLoopExecuteResult> => {
    // 检查环境
    if (!isElectron() || !window.electronAPI?.runAgentLoop) {
      throw new Error('Agent Loop 功能仅在 Electron 环境中可用')
    }

    // 检查是否在运行中
    if (isRunningRef.current) {
      throw new Error('Agent Loop 正在执行中，请先中止当前任务')
    }

    setIsRunning(true)
    isRunningRef.current = true
    setError(null)
    setResult(null)
    setLastConfig(config)

    abortControllerRef.current = new AbortController()

    // 注册事件监听
    if (window.electronAPI?.onAgentLoopEvent) {
      eventUnsubscribeRef.current = window.electronAPI.onAgentLoopEvent((event: AgentLoopEvent) => {
        handleProgressEvent(event)
      })
    }

    try {
      const executeResult = await window.electronAPI.runAgentLoop({
        provider: config.provider,
        model: config.model,
        tools: config.tools,
        maxIterations: config.maxIterations ?? 10,
        timeout: config.timeout ?? 60,
        projectPath: config.projectPath,
        task: config.task
      })

      const result: AgentLoopExecuteResult = {
        success: executeResult?.success ?? false,
        result: executeResult?.result ?? '',
        error: executeResult?.error,
        totalTurns: executeResult?.totalTurns ?? 0,
        totalToolCalls: executeResult?.totalToolCalls ?? 0,
        duration: executeResult?.duration ?? 0
      }

      setResult(result)
      onComplete?.(result)

      // 更新所有 running 状态的步骤为最终状态
      if (result.success) {
        setSteps(prev => {
          const updatedSteps = prev.map(step =>
            step.status === 'running' ? { ...step, status: 'success' as const } : step
          )

          // 检查是否已经有最终结果步骤
          if (!prev.some(s => s.type === 'result')) {
            const finalStepId = `final-${Date.now()}`
            return [...updatedSteps, {
              id: finalStepId,
              type: 'result' as const,
              title: '执行完成',
              status: 'success' as const,
              content: result.result || '',
              timestamp: new Date(),
              details: {
                duration: result.duration,
                request: `总轮次: ${result.totalTurns}\n工具调用: ${result.totalToolCalls}\n耗时: ${result.duration}ms`
              }
            }]
          }
          return updatedSteps
        })
      } else {
        setSteps(prev =>
          prev.map(step =>
            step.status === 'running' ? { ...step, status: 'error' as const } : step
          )
        )
      }

      return result
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      setError(errorObj)
      onError?.(errorObj)

      // 添加错误步骤
      addStep({
        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'error',
        title: '执行失败',
        status: 'error',
        content: errorObj.message,
        timestamp: new Date()
      })

      throw errorObj
    } finally {
      setIsRunning(false)
      isRunningRef.current = false

      // 清理事件监听
      if (eventUnsubscribeRef.current) {
        eventUnsubscribeRef.current()
        eventUnsubscribeRef.current = null
      }

      abortControllerRef.current = null
    }
  }, [handleProgressEvent, onComplete, onError, addStep])

  // 中止执行
  const abort = useCallback(async (): Promise<void> => {
    abortControllerRef.current?.abort()

    if (isElectron() && window.electronAPI?.abortAgentLoop) {
      try {
        await window.electronAPI.abortAgentLoop()
      } catch (error) {
        console.error('中止 Agent Loop 失败:', error)
      }
    }

    setIsRunning(false)
    isRunningRef.current = false

    // 清理事件监听
    if (eventUnsubscribeRef.current) {
      eventUnsubscribeRef.current()
      eventUnsubscribeRef.current = null
    }
  }, [])

  // 清除步骤
  const clearSteps = useCallback(() => {
    setSteps([])
    setExpandedSteps(new Set())
  }, [])

  // 切换步骤展开
  const toggleStepExpand = useCallback((stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev)
      if (newSet.has(stepId)) {
        newSet.delete(stepId)
      } else {
        newSet.add(stepId)
      }
      return newSet
    })
  }, [])

  // 展开指定步骤
  const expandStep = useCallback((stepId: string) => {
    setExpandedSteps(prev => new Set(prev).add(stepId))
  }, [])

  // 折叠指定步骤
  const collapseStep = useCallback((stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev)
      newSet.delete(stepId)
      return newSet
    })
  }, [])

  // 展开所有步骤
  const expandAll = useCallback(() => {
    setExpandedSteps(new Set(steps.map(s => s.id)))
  }, [steps])

  // 折叠所有步骤
  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set())
  }, [])

  // 切换全部展开/折叠
  const toggleExpandAll = useCallback(() => {
    setExpandedSteps(prev => {
      if (prev.size > 0) {
        return new Set()
      } else {
        return new Set(steps.map(s => s.id))
      }
    })
  }, [steps])

  // 重试上次执行
  const retry = useCallback(async (): Promise<AgentLoopExecuteResult | null> => {
    if (!lastConfig) {
      return null
    }
    clearSteps()
    return execute(lastConfig)
  }, [lastConfig, clearSteps, execute])

  return {
    // 状态
    steps,
    isRunning,
    expandedSteps,
    error,
    result,
    lastConfig,

    // 方法
    execute,
    abort,
    clearSteps,
    toggleStepExpand,
    expandStep,
    collapseStep,
    expandAll,
    collapseAll,
    toggleExpandAll,
    retry
  }
}

export default useAgentLoop
