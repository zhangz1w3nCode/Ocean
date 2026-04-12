/**
 * useClaudeCode - Claude Code CLI 集成 Hook
 *
 * 调用本机 claude -p CLI，支持流式输出和多轮对话
 * 参考 useAgentLoop 的接口设计风格
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { ClaudeCodeEvent, ClaudeCodeStep, ClaudeCodeExecuteConfig, ClaudeCodeExecuteResult } from '../types'
import { isElectron } from '../utils/storage'

export interface UseClaudeCodeOptions {
  onComplete?: (result: ClaudeCodeExecuteResult) => void
  onError?: (error: Error) => void
}

export interface UseClaudeCodeReturn {
  // 状态
  steps: ClaudeCodeStep[]
  isRunning: boolean
  expandedSteps: Set<string>
  error: Error | null
  sessionId: string | null
  result: ClaudeCodeExecuteResult | null

  // 方法
  execute: (prompt: string, options?: Partial<ClaudeCodeExecuteConfig>) => Promise<ClaudeCodeExecuteResult>
  abort: () => Promise<void>
  clearSteps: () => void
  toggleStepExpand: (stepId: string) => void
  expandAll: () => void
  collapseAll: () => void
}

// 将 ClaudeCodeEvent 转换为 ClaudeCodeStep
function createStepFromEvent(event: ClaudeCodeEvent): ClaudeCodeStep {
  const baseStep = {
    id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(event.timestamp)
  }

  const data = event.data

  switch (event.type) {
    case 'system':
      return {
        ...baseStep,
        type: 'system',
        title: data.sessionId ? '会话已建立' : '系统消息',
        content: data.sessionId ? `Session: ${data.sessionId.substring(0, 12)}...` : '',
        details: undefined
      }

    case 'thinking':
      return {
        ...baseStep,
        type: 'thinking',
        title: 'Claude 思考',
        content: data.content || '',
        details: undefined
      }

    case 'text':
      return {
        ...baseStep,
        type: 'text',
        title: 'Claude 输出',
        content: data.content || '',
        details: undefined
      }

    case 'tool_use':
      return {
        ...baseStep,
        type: 'tool_use',
        title: `调用工具: ${data.toolName || ''}`,
        content: undefined,
        details: {
          toolName: data.toolName,
          toolInput: data.toolInput
        }
      }

    case 'tool_result':
      return {
        ...baseStep,
        type: 'tool_result',
        title: `工具结果: ${data.toolName || ''}`,
        content: (data.toolOutput || '').substring(0, 500),
        details: {
          toolOutput: (data.toolOutput || '').substring(0, 2000)
        }
      }

    case 'error':
      return {
        ...baseStep,
        type: 'error',
        title: '执行错误',
        content: data.error || '未知错误',
        details: undefined
      }

    default:
      return {
        ...baseStep,
        type: 'system',
        title: '未知事件',
        content: '',
        details: undefined
      }
  }
}

export function useClaudeCode(options: UseClaudeCodeOptions = {}): UseClaudeCodeReturn {
  const { onComplete, onError } = options

  // 状态
  const [steps, setSteps] = useState<ClaudeCodeStep[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [error, setError] = useState<Error | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [result, setResult] = useState<ClaudeCodeExecuteResult | null>(null)

  // refs
  const isRunningRef = useRef(false)
  const eventUnsubscribeRef = useRef<(() => void) | null>(null)
  const collectedTextRef = useRef('')
  const collectedSessionIdRef = useRef<string | null>(null)

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
    }
  }, [])

  // 添加步骤
  const addStep = useCallback((newStep: ClaudeCodeStep) => {
    setSteps(prev => [...prev, newStep])
  }, [])

  // 处理事件
  const handleClaudeCodeEvent = useCallback((event: ClaudeCodeEvent) => {
    const data = event.data

    // 提取 session_id
    if (event.type === 'system' && data.sessionId) {
      setSessionId(data.sessionId)
      collectedSessionIdRef.current = data.sessionId
    }

    // 累计文本内容
    if (event.type === 'text' && data.content) {
      collectedTextRef.current += data.content
    }

    // 转换为步骤
    const step = createStepFromEvent(event)

    // 对于 tool_result，更新上一个 tool_use 步骤而不是新增步骤
    if (event.type === 'tool_result') {
      setSteps(prev => {
        // 找到最近的 tool_use 步骤
        const lastToolUseIndex = [...prev].reverse().findIndex(s => s.type === 'tool_use')
        if (lastToolUseIndex !== -1) {
          const actualIndex = prev.length - 1 - lastToolUseIndex
          const updatedSteps = [...prev]
          const existingStep = updatedSteps[actualIndex]
          updatedSteps[actualIndex] = {
            ...existingStep,
            content: (data.toolOutput || '').substring(0, 500),
            details: {
              ...existingStep.details,
              toolOutput: (data.toolOutput || '').substring(0, 2000)
            }
          }
          return updatedSteps
        }
        // 没有找到 tool_use 步骤，则直接添加
        return [...prev, step]
      })
    } else {
      addStep(step)
    }
  }, [addStep])

  // 执行
  const execute = useCallback(async (prompt: string, executeOptions?: Partial<ClaudeCodeExecuteConfig>): Promise<ClaudeCodeExecuteResult> => {
    // 检查环境
    if (!isElectron() || !window.electronAPI?.runClaudeCode) {
      const err = new Error('Claude Code 功能仅在 Electron 环境中可用')
      setError(err)
      onError?.(err)
      throw err
    }

    // 检查是否在运行中
    if (isRunningRef.current) {
      const err = new Error('Claude Code 正在执行中，请先中止当前任务')
      setError(err)
      throw err
    }

    // 验证输入
    if (!prompt.trim()) {
      const err = new Error('请输入描述内容')
      setError(err)
      throw err
    }

    setIsRunning(true)
    isRunningRef.current = true
    setError(null)
    setResult(null)

    // 重置累计文本
    collectedTextRef.current = ''

    // 如果是新执行（非 resume），清空 sessionId
    if (!executeOptions?.sessionId) {
      setSessionId(null)
      collectedSessionIdRef.current = null
    }

    // 注册事件监听
    if (window.electronAPI?.onClaudeCodeEvent) {
      eventUnsubscribeRef.current = window.electronAPI.onClaudeCodeEvent((event: ClaudeCodeEvent) => {
        handleClaudeCodeEvent(event)
      })
    }

    // 添加开始步骤
    addStep({
      id: `step-${Date.now()}-start`,
      type: 'system',
      title: executeOptions?.sessionId ? '恢复会话执行' : 'Claude Code 开始执行',
      content: executeOptions?.sessionId ? `恢复会话: ${executeOptions.sessionId.substring(0, 12)}...` : `任务: ${prompt.substring(0, 100)}`,
      timestamp: new Date()
    })

    try {
      const config: ClaudeCodeExecuteConfig = {
        prompt,
        projectPath: executeOptions?.projectPath || '',
        sessionId: executeOptions?.sessionId,
        maxTurns: executeOptions?.maxTurns,
        permissionMode: executeOptions?.permissionMode || 'acceptEdits'
      }

      const executeResult = await window.electronAPI.runClaudeCode(config)

      const finalResult: ClaudeCodeExecuteResult = {
        success: executeResult?.success ?? false,
        result: executeResult?.result || collectedTextRef.current || '',
        sessionId: executeResult?.sessionId || collectedSessionIdRef.current || undefined,
        error: executeResult?.error
      }

      // 更新 sessionId
      if (finalResult.sessionId) {
        setSessionId(finalResult.sessionId)
      }

      setResult(finalResult)

      // 如果 Claude 返回了结果但 collectedText 为空，用结果填充
      if (!collectedTextRef.current && finalResult.result) {
        collectedTextRef.current = finalResult.result
      }

      // 添加完成步骤
      addStep({
        id: `step-${Date.now()}-end`,
        type: finalResult.success ? 'stop' : 'error',
        title: finalResult.success ? '执行完成' : '执行失败',
        content: finalResult.success ? finalResult.result.substring(0, 500) : (finalResult.error || '未知错误'),
        timestamp: new Date()
      })

      onComplete?.(finalResult)
      return finalResult
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      setError(errorObj)
      onError?.(errorObj)

      addStep({
        id: `step-${Date.now()}-error`,
        type: 'error',
        title: '执行失败',
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
    }
  }, [handleClaudeCodeEvent, onComplete, onError, addStep])

  // 中止执行
  const abort = useCallback(async (): Promise<void> => {
    if (isElectron() && window.electronAPI?.abortClaudeCode) {
      try {
        await window.electronAPI.abortClaudeCode()
      } catch (error) {
        console.error('中止 Claude Code 失败:', error)
      }
    }

    setIsRunning(false)
    isRunningRef.current = false

    // 清理事件监听
    if (eventUnsubscribeRef.current) {
      eventUnsubscribeRef.current()
      eventUnsubscribeRef.current = null
    }

    // 添加中止步骤
    addStep({
      id: `step-${Date.now()}-abort`,
      type: 'stop',
      title: '已中止执行',
      content: '用户手动中止了 Claude Code 执行',
      timestamp: new Date()
    })
  }, [addStep])

  // 清除步骤
  const clearSteps = useCallback(() => {
    setSteps([])
    setExpandedSteps(new Set())
    collectedTextRef.current = ''
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

  // 展开所有
  const expandAll = useCallback(() => {
    setExpandedSteps(new Set(steps.map(s => s.id)))
  }, [steps])

  // 折叠所有
  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set())
  }, [])

  return {
    steps,
    isRunning,
    expandedSteps,
    error,
    sessionId,
    result,
    execute,
    abort,
    clearSteps,
    toggleStepExpand,
    expandAll,
    collapseAll
  }
}

export default useClaudeCode