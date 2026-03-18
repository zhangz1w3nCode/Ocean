/**
 * AgentLoopLogger - Agent Loop 执行日志组件
 *
 * 特性：
 * - 整个日志区域可折叠
 * - 卡片式步骤展示
 * - 可折叠的详情区域
 * - 类型图标和颜色
 * - 状态动画
 * - 自动滚动到底部
 *
 * 设计规范：
 * - 使用灰色系（macOS 风格）
 * - 仅错误状态使用红色系
 * - 统一的卡片样式
 */

import type { FC, ReactNode } from 'react'
import { useRef, useEffect, useState } from 'react'
import {
  Brain,
  Wrench,
  Check,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText
} from 'lucide-react'
import type { AgentLoopStep, AgentLoopStepType } from '../../hooks/useAgentLoop'

// 步骤图标映射
const stepTypeIcons: Record<AgentLoopStepType | string, typeof FileText> = {
  thinking: Brain,
  tool_call: Wrench,
  tool_result: Check,
  result: Check,
  error: AlertCircle,
  info: MessageSquare,
  turn_start: MessageSquare,
  turn_end: MessageSquare
}

interface AgentLoopLoggerProps {
  steps: AgentLoopStep[]
  isRunning: boolean
  expandedSteps: Set<string>
  onToggleExpand: (stepId: string) => void
  title?: string
  maxHeight?: number
  className?: string
  emptyContent?: ReactNode
  headerActions?: ReactNode
  showStepCount?: boolean
  autoScroll?: boolean
  /** 整个日志区域是否默认折叠，默认为 false */
  defaultCollapsed?: boolean
  /** 是否允许折叠整个日志区域，默认为 true */
  collapsible?: boolean
}

export const AgentLoopLogger: FC<AgentLoopLoggerProps> = ({
  steps,
  isRunning,
  expandedSteps,
  onToggleExpand,
  title = 'Agent 执行日志',
  maxHeight = 500,
  className = '',
  emptyContent,
  headerActions,
  showStepCount = true,
  autoScroll = true,
  defaultCollapsed = false,
  collapsible = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  // 整个日志区域的折叠状态
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && containerRef.current && !isCollapsed) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [steps, autoScroll, isCollapsed])

  // 如果没有步骤，显示空状态
  if (steps.length === 0 && emptyContent) {
    return <>{emptyContent}</>
  }

  if (steps.length === 0) {
    return null
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      {/* 头部 - 可点击折叠整个日志区域 */}
      <div
        className={`px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between ${collapsible ? 'cursor-pointer hover:bg-gray-100' : ''}`}
        onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <ChevronRight
              size={14}
              className={`text-macos-text-tertiary transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
            />
          )}
          <Brain size={16} className="text-macos-text-secondary" />
          <span className="text-sm font-medium text-macos-text">{title}</span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {showStepCount && (
            <span className="text-xs text-macos-text-tertiary">{steps.length} 条记录</span>
          )}
          {headerActions}
        </div>
      </div>

      {/* 步骤列表 - 整个区域可折叠 */}
      {!isCollapsed && (
        <div
          ref={containerRef}
          className="overflow-y-auto p-4 space-y-3"
          style={{ maxHeight }}
        >
          {steps.map((step) => (
            <StepCard
              key={step.id}
              step={step}
              isExpanded={expandedSteps.has(step.id)}
              onToggleExpand={() => onToggleExpand(step.id)}
            />
          ))}

          {/* 执行中提示 */}
          {isRunning && (
            <div className="flex items-center gap-2 px-3 py-2 text-macos-text-tertiary">
              <div className="flex gap-1">
                <div
                  className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
              <span className="text-xs">等待 Agent 响应...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 步骤卡片组件
interface StepCardProps {
  step: AgentLoopStep
  isExpanded: boolean
  onToggleExpand: () => void
}

const StepCard: FC<StepCardProps> = ({ step, isExpanded, onToggleExpand }) => {
  // 判断是否有可展示的详情
  const hasDetails =
    step.content ||
    step.details?.request ||
    step.details?.response ||
    step.details?.toolArgs ||
    step.details?.toolName

  // 获取步骤样式
  const getStepStyle = (): string => {
    if (step.status === 'error' || step.type === 'error') {
      return 'border-red-200 bg-red-50'
    }
    return 'border-gray-200 bg-gray-50'
  }

  // 获取图标颜色
  const getIconColor = (): string => {
    if (step.status === 'error' || step.type === 'error') return 'text-macos-error'
    return 'text-macos-text-secondary'
  }

  // 获取图标
  const getIcon = (): ReactNode => {
    if (step.status === 'running') {
      return <Loader2 size={14} className="text-macos-text-secondary animate-spin" />
    }

    if (step.status === 'error' || step.type === 'error') {
      return <AlertCircle size={14} className={getIconColor()} />
    }

    const IconComponent = stepTypeIcons[step.type] || MessageSquare
    return <IconComponent size={14} className={getIconColor()} />
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${getStepStyle()} transition-colors duration-200`}>
      {/* 步骤标题 - 可点击折叠/展开 */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 ${hasDetails ? 'cursor-pointer hover:bg-gray-100/50' : ''}`}
        onClick={() => hasDetails && onToggleExpand()}
      >
        <div className="w-5 h-5 rounded flex items-center justify-center bg-white">{getIcon()}</div>
        <span className="text-sm font-medium text-macos-text flex-1">{step.title}</span>
        {step.status === 'running' && (
          <span className="text-xs text-macos-text-secondary animate-pulse">执行中...</span>
        )}
        {step.details?.duration && (
          <span className="text-xs text-macos-text-tertiary">{step.details.duration}ms</span>
        )}
        {hasDetails && (
          <ChevronDown
            size={14}
            className={`text-macos-text-tertiary transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {/* 内容区域 - 折叠展示 */}
      <div className={isExpanded ? '' : 'hidden'}>
        {/* 思考内容展示 */}
        {step.type === 'thinking' && (step.content || step.details?.response) && (
          <div className="bg-white border-t border-gray-100">
            <div className="px-3 py-2">
              <div className="text-xs text-macos-text-tertiary mb-1 font-medium">思考内容:</div>
              <pre className="text-xs font-mono text-macos-text whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-200 max-h-96 overflow-y-auto">
                {step.details?.response || step.content}
              </pre>
            </div>
          </div>
        )}

        {/* 工具调用展示 - 输入和输出在同一卡片 */}
        {step.type === 'tool_call' && (
          <div className="bg-white border-t border-gray-100">
            {/* 输入参数 */}
            {step.details?.toolArgs && (
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-xs text-macos-text-tertiary mb-1 font-medium">输入:</div>
                <pre className="text-xs font-mono text-macos-text whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-200">
                  {JSON.stringify(step.details.toolArgs, null, 2)}
                </pre>
              </div>
            )}
            {/* 输出结果 */}
            {step.details?.response && (
              <div className="px-3 py-2">
                <div className="text-xs text-macos-text-tertiary mb-1 font-medium">输出:</div>
                <pre className="text-xs font-mono text-macos-text-secondary whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-200 max-h-60 overflow-y-auto">
                  {step.details.response}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 工具结果展示 */}
        {step.type === 'tool_result' && step.details?.response && (
          <div className="bg-white border-t border-gray-100">
            <div className="px-3 py-2">
              <div className="text-xs text-macos-text-tertiary mb-1 font-medium">输出:</div>
              <pre className="text-xs font-mono text-macos-text-secondary whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-200 max-h-60 overflow-y-auto">
                {step.details.response}
              </pre>
            </div>
          </div>
        )}

        {/* 最终结果展示 */}
        {step.type === 'result' && (
          <div className="bg-white border-t border-gray-100">
            {step.content && (
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-xs text-macos-text-tertiary mb-1 font-medium">执行结果:</div>
                <pre className="text-xs font-mono text-macos-text whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-200">
                  {step.content}
                </pre>
              </div>
            )}
            {step.details?.request && (
              <div className="px-3 py-2">
                <div className="text-xs text-macos-text-tertiary mb-1 font-medium">统计信息:</div>
                <pre className="text-xs font-mono text-macos-text-secondary whitespace-pre-wrap break-all bg-gray-50 p-2 rounded border border-gray-200">
                  {step.details.request}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* 其他类型的通用展示 */}
        {step.type !== 'thinking' &&
          step.type !== 'tool_call' &&
          step.type !== 'tool_result' &&
          step.type !== 'result' &&
          step.content && (
            <div className="px-3 py-2 text-sm text-macos-text-secondary border-t border-gray-100 whitespace-pre-wrap">
              {step.content}
            </div>
          )}
      </div>
    </div>
  )
}

// 紧凑模式的步骤展示（用于侧边栏等场景）
interface CompactStepListProps {
  steps: AgentLoopStep[]
  isRunning: boolean
  maxHeight?: number
  className?: string
}

export const CompactStepList: FC<CompactStepListProps> = ({
  steps,
  isRunning,
  maxHeight = 300,
  className = ''
}) => {
  return (
    <div className={`space-y-2 ${className}`} style={{ maxHeight, overflowY: 'auto' }}>
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs ${
            step.status === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <span className="text-macos-text-tertiary w-5">{index + 1}</span>
          <span className="flex-1 truncate text-macos-text">{step.title}</span>
          {step.status === 'running' && <Loader2 size={12} className="animate-spin text-macos-accent" />}
          {step.status === 'success' && <Check size={12} className="text-macos-success" />}
          {step.status === 'error' && <AlertCircle size={12} className="text-macos-error" />}
        </div>
      ))}
      {isRunning && (
        <div className="flex items-center gap-2 px-2 py-1.5 text-macos-text-tertiary text-xs">
          <Loader2 size={12} className="animate-spin" />
          <span>执行中...</span>
        </div>
      )}
    </div>
  )
}

export default AgentLoopLogger
