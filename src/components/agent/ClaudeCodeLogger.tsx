/**
 * ClaudeCodeLogger - Claude Code 执行日志组件
 *
 * 参考 AgentLoopLogger 样式设计
 * 展示 claude -p 流式输出的步骤信息
 */

import type { FC } from 'react'
import { useRef, useEffect, useState } from 'react'
import {
  Brain,
  Wrench,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  Terminal
} from 'lucide-react'
import type { ClaudeCodeStep, ClaudeCodeEventType } from '../../types'

// 步骤图标映射
const stepTypeIcons: Record<ClaudeCodeEventType, typeof Terminal> = {
  thinking: Brain,
  text: MessageSquare,
  tool_use: Wrench,
  tool_result: CheckCircle,
  system: Terminal,
  stop: CheckCircle,
  error: AlertCircle
}

// 步骤颜色映射
const stepTypeColors: Record<ClaudeCodeEventType, { icon: string; bg: string }> = {
  thinking: { icon: 'text-blue-500', bg: 'bg-blue-50' },
  text: { icon: 'text-gray-600', bg: 'bg-gray-50' },
  tool_use: { icon: 'text-amber-500', bg: 'bg-amber-50' },
  tool_result: { icon: 'text-green-500', bg: 'bg-green-50' },
  system: { icon: 'text-gray-500', bg: 'bg-gray-50' },
  stop: { icon: 'text-green-500', bg: 'bg-green-50' },
  error: { icon: 'text-red-500', bg: 'bg-red-50' }
}

interface ClaudeCodeLoggerProps {
  steps: ClaudeCodeStep[]
  isRunning: boolean
  expandedSteps: Set<string>
  onToggleExpand: (stepId: string) => void
  maxHeight?: number
  className?: string
  defaultCollapsed?: boolean
}

export const ClaudeCodeLogger: FC<ClaudeCodeLoggerProps> = ({
  steps,
  isRunning,
  expandedSteps,
  onToggleExpand,
  maxHeight = 300,
  className = '',
  defaultCollapsed = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  // 自动滚动到底部
  useEffect(() => {
    if (containerRef.current && !isCollapsed) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [steps, isCollapsed])

  if (steps.length === 0) {
    return null
  }

  // 判断步骤是否可展开
  const isExpandable = (step: ClaudeCodeStep): boolean => {
    if (step.type === 'thinking' && step.content && step.content.length > 100) return true
    if (step.type === 'text' && step.content && step.content.length > 100) return true
    if (step.type === 'tool_use' && step.details?.toolInput) return true
    if (step.type === 'tool_result' && step.details?.toolOutput) return true
    if (step.type === 'error' && step.content) return true
    return false
  }

  // 渲染步骤内容
  const renderStepContent = (step: ClaudeCodeStep) => {
    if (step.type === 'tool_use' && step.details?.toolInput) {
      return (
        <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(step.details.toolInput, null, 2)}
        </pre>
      )
    }

    if (step.type === 'tool_result' && step.details?.toolOutput) {
      return (
        <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
          {step.details.toolOutput}
        </pre>
      )
    }

    if (step.content) {
      return (
        <p className="text-xs text-gray-600 whitespace-pre-wrap break-words">
          {step.content}
        </p>
      )
    }

    return null
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer select-none"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          {isCollapsed ? (
            <ChevronRight size={14} className="text-gray-400" />
          ) : (
            <ChevronDown size={14} className="text-gray-400" />
          )}
          <span className="text-xs font-medium text-gray-700">Claude Code 执行日志</span>
          <span className="text-xs text-gray-400">({steps.length})</span>
          {isRunning && (
            <Loader2 size={12} className="animate-spin text-violet-500" />
          )}
        </div>
      </div>

      {/* 日志列表 */}
      {!isCollapsed && (
        <div
          ref={containerRef}
          className="p-2 space-y-1.5 overflow-y-auto"
          style={{ maxHeight }}
        >
          {steps.map((step) => {
            const Icon = stepTypeIcons[step.type] || Terminal
            const colors = stepTypeColors[step.type] || stepTypeColors.system
            const expanded = expandedSteps.has(step.id)
            const expandable = isExpandable(step)

            return (
              <div
                key={step.id}
                className={`border rounded-md overflow-hidden ${
                  step.type === 'error'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                {/* 标题栏 */}
                <div
                  className={`flex items-center gap-2 px-2.5 py-1.5 ${
                    expandable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  onClick={() => expandable && onToggleExpand(step.id)}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center ${colors.bg}`}>
                    <Icon size={12} className={colors.icon} />
                  </div>
                  <span className="text-xs font-medium text-gray-700 flex-1 truncate">
                    {step.title}
                  </span>
                  {expandable && (
                    expanded ? (
                      <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />
                    )
                  )}
                </div>

                {/* 展开详情 */}
                {expanded && expandable && (
                  <div className="px-2.5 pb-2 pt-0.5 border-t border-gray-100">
                    {renderStepContent(step)}
                  </div>
                )}
              </div>
            )
          })}

          {/* 运行中指示 */}
          {isRunning && (
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <Loader2 size={12} className="animate-spin text-violet-500" />
              <span className="text-xs text-gray-400">Claude 正在执行...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ClaudeCodeLogger