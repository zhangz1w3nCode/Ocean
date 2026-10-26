import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, Loader2, Terminal, Quote, PanelRight } from 'lucide-react'
import { useHarnessStore, type HarnessNode, type HarnessSessionRuntime } from '../../../stores/harnessStore'
import { UserBubble, SteeringBubble, ReasoningRow, AssistantBlock, ToolCard, ApprovalCard, SystemRow } from './MessageNodes'

const RunningStatusBar: FC<{ runtime: HarnessSessionRuntime }> = ({ runtime }) => {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!runtime.isStreaming) return
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - runtime.startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [runtime.isStreaming, runtime.startedAt])
  if (!runtime.isStreaming) return null
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-xs text-macos-text-secondary">
      <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
      <span>{runtime.isCompacting ? '上下文压缩中…' : '运行中'}</span>
      <span className="text-macos-text-tertiary">{elapsed}s</span>
      {runtime.pendingSteering.length > 0 && (
        <span className="text-macos-text-tertiary">· {runtime.pendingSteering.length} 条排队消息</span>
      )}
    </div>
  )
}

const NodeView: FC<{ node: HarnessNode; runtime: HarnessSessionRuntime }> = ({ node, runtime }) => {
  switch (node.kind) {
    case 'user':
      return <UserBubble text={node.text} images={node.images} />
    case 'steering':
      return <SteeringBubble text={node.text} />
    case 'reasoning':
      return <ReasoningRow node={node} />
    case 'assistant':
      return <AssistantBlock node={node} />
    case 'tool':
      return <ToolCard node={node} />
    case 'approval':
      return <ApprovalCard node={node} runtime={runtime} />
    case 'system':
      return <SystemRow node={node} />
    default:
      return null
  }
}

export const ChatFlow: FC = () => {
  const activeSessionId = useHarnessStore((s) => s.activeSessionId)
  const runtime = useHarnessStore((s) => (s.activeSessionId ? s.runtimes[s.activeSessionId] : undefined))
  const fileViewerOpen = useHarnessStore((s) => s.fileViewerOpen)
  const toggleFileViewer = useHarnessStore((s) => s.toggleFileViewer)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  const nodes = runtime?.nodes ?? []
  const lastNode = nodes[nodes.length - 1]
  const lastLength = lastNode ? (lastNode as { text?: string }).text?.length ?? 0 : 0
  const lastCount = nodes.length
  const sid = runtime?.sessionId ?? null

  // 同一会话且节点数从 0 跳到 >5 视为历史水合批次：给予级联入场；流式新节点不延迟
  const hydrateRef = useRef<{ sid: string | null; count: number }>({ sid: null, count: 0 })
  const isHydrateMount = hydrateRef.current.sid === sid && hydrateRef.current.count === 0 && nodes.length > 5
  hydrateRef.current = { sid, count: nodes.length }

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !atBottom) return
    el.scrollTop = el.scrollHeight
  }, [lastCount, lastLength, atBottom, sid])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  // 消息选中文字 → 浮动「引用」气泡（对齐 DSH 选中引用交互，点击后以 markdown 引用插入输入框）
  const [quoteBubble, setQuoteBubble] = useState<{ x: number; y: number; text: string } | null>(null)
  const handlePointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest?.('[data-quote-bubble]')) return
    setTimeout(() => {
      const container = scrollRef.current
      if (!container) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setQuoteBubble(null)
        return
      }
      const selected = sel.toString().trim()
      if (!selected || selected.length > 1000) {
        setQuoteBubble(null)
        return
      }
      const node = sel.anchorNode
      const element = node ? (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement) : null
      if (!element || !container.contains(element)) {
        setQuoteBubble(null)
        return
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) {
        setQuoteBubble(null)
        return
      }
      setQuoteBubble({
        x: Math.min(Math.max(rect.right - containerRect.left + container.scrollLeft, 8), container.clientWidth - 96),
        y: Math.max(rect.top - containerRect.top + container.scrollTop - 32, 4),
        text: selected,
      })
    })
  }

  const empty = nodes.length === 0
  const connecting = runtime?.status === 'connecting'

  const handleFlowClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest?.('a[data-file]')
    if (!anchor || !runtime?.sessionId) return
    e.preventDefault()
    const file = anchor.getAttribute('data-file')
    if (file) void useHarnessStore.getState().openFileViewer(runtime.sessionId, file)
  }

  return (
    <div className="flex-1 min-h-0 min-w-0 relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={sid ?? 'none'}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="h-full"
        >
          <div
            ref={scrollRef}
            onScroll={() => {
              handleScroll()
              setQuoteBubble(null)
            }}
            onPointerUp={handlePointerUp}
            onClick={handleFlowClick}
            className="h-full overflow-y-auto overflow-x-hidden relative"
          >
            {empty ? (
              <div className="h-full flex items-center justify-center">
                {runtime && connecting ? (
                  <Loader2 size={28} strokeWidth={1.5} className="animate-spin text-macos-text-tertiary/60" />
                ) : (
                  <Terminal size={28} strokeWidth={1.25} className="text-macos-text-tertiary/40" />
                )}
              </div>
            ) : (
              <div className="px-[60px] py-4 space-y-3">
                {nodes.map((node, i) => (
                  <motion.div
                    key={node.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: 'easeOut', delay: isHydrateMount ? Math.min(i * 0.012, 0.4) : 0 }}
                  >
                    <NodeView node={node} runtime={runtime as HarnessSessionRuntime} />
                  </motion.div>
                ))}
                {runtime && <RunningStatusBar runtime={runtime} />}
              </div>
            )}

            {quoteBubble && (
              <button
                data-quote-bubble
                style={{ left: quoteBubble.x, top: quoteBubble.y }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  useHarnessStore.getState().setDraftQuote(quoteBubble.text.slice(0, 500))
                  setQuoteBubble(null)
                  window.getSelection()?.removeAllRanges()
                }}
                className="absolute z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border border-macos-border shadow-md text-[11px] text-macos-text-secondary hover:text-macos-text transition-colors"
              >
                <Quote size={11} strokeWidth={1.5} />
                引用
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* 右上角：文件预览展开按钮（面板打开时隐藏，关闭后重新出现） */}
      {!fileViewerOpen && (
        <button
          onClick={toggleFileViewer}
          className="absolute top-2.5 right-2.5 z-10 w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-macos-text-secondary hover:bg-macos-bg hover:text-macos-text"
          title="展开文件预览"
        >
          <PanelRight size={15} strokeWidth={1.5} />
        </button>
      )}

      {!atBottom && (
        <button
          onClick={() => {
            const el = scrollRef.current
            if (el) {
              el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
              setAtBottom(true)
            }
          }}
          className="absolute bottom-3 right-4 w-8 h-8 rounded-full bg-white border border-macos-border shadow-sm flex items-center justify-center text-macos-text-secondary hover:text-macos-text transition-colors z-10"
          title="回到底部"
        >
          <ArrowDown size={14} strokeWidth={1.5} />
        </button>
      )}

      {runtime?.error && !runtime?.isStreaming && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-macos-error/10 text-macos-error text-xs border border-macos-error/20 max-w-[80%] truncate" title={runtime.error}>
          {runtime.error}
        </div>
      )}
    </div>
  )
}
