import type { FC } from 'react'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Square, X, Clock, FileText, ArrowRight, ListChecks, StickyNote } from 'lucide-react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  useStore,
  useStoreApi,
  type Node,
  type NodeProps,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { formatRelativeTime } from '../../utils/format'
import type { TaskTraceEvent } from '../../types'

// 时间线事件类型标签与徽标配色（列表/可视化图/弹窗共用）
export const traceTypeLabels: Record<string, string> = {
  'task-created': '创建任务',
  'task-updated': '更新字段',
  'status-changed': '状态变更',
  'context-created': '新增上下文',
  'context-updated': '更新上下文',
}

export const traceTypeColors: Record<string, string> = {
  'task-created': 'bg-green-50 text-green-600',
  'task-updated': 'bg-blue-50 text-blue-600',
  'status-changed': 'bg-amber-50 text-amber-600',
  'context-created': 'bg-purple-50 text-purple-600',
  'context-updated': 'bg-gray-100 text-gray-500',
}

// 节点圆点与描边配色（实色，与徽标同色系）
const traceDotColors: Record<string, string> = {
  'task-created': 'bg-green-500',
  'task-updated': 'bg-blue-500',
  'status-changed': 'bg-amber-500',
  'context-created': 'bg-purple-500',
  'context-updated': 'bg-gray-400',
}

const traceBorderColors: Record<string, string> = {
  'task-created': '#22c55e',
  'task-updated': '#3b82f6',
  'status-changed': '#f59e0b',
  'context-created': '#a855f7',
  'context-updated': '#9ca3af',
}

// 面板「状态变更」行的事件状态徽标配色（与任务状态徽标一致）
const statusBadgeClass = (s: string) => ({
  '等待处理': 'bg-gray-100 text-gray-500',
  '处理中': 'bg-blue-50 text-blue-600',
  '已完成': 'bg-green-50 text-green-600',
  '已取消': 'bg-red-50 text-red-600',
}[s] || 'bg-gray-100 text-gray-500')

// 复制自实例图节点详情面板的宽度参数：默认 360，左缘可拖拽调宽
const PANEL_DEFAULT_W = 360
const PANEL_MIN_W = 300
const PANEL_MAX_W = 680
const PANEL_EDGE_GAP = 32

// 复制自 InstanceFlowGraph 的自适应视野参数
const FIT_PADDING = 0.2
const FIT_MIN_ZOOM = 0.05
const FIT_MAX_ZOOM = 1.5
const FIT_ANIMATE_MS = 250

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#9CA3AF' },
  style: { strokeWidth: 2, stroke: '#9CA3AF' },
}

// 事件节点：类型圆点 + 徽标 + 相对时间 + 说明（卡片式，描边按事件类型着色）
type TimelineEventNodeType = Node<{ evt: TaskTraceEvent }, 'timeline'>
const traceRingColors: Record<string, string> = {
  'task-created': 'ring-green-100',
  'task-updated': 'ring-blue-100',
  'status-changed': 'ring-amber-100',
  'context-created': 'ring-purple-100',
  'context-updated': 'ring-gray-100',
}
const TimelineEventNode: FC<NodeProps<TimelineEventNodeType>> = ({ data, selected }) => {
  const evt = data.evt
  return (
    <div
      className={`bg-white rounded-lg border px-3 py-2 shadow-sm w-[240px] ${selected ? `ring-4 ${traceRingColors[evt.type] || 'ring-gray-100'}` : ''}`}
      style={{ borderColor: traceBorderColors[evt.type] || '#9ca3af', borderWidth: selected ? 2 : 1 }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${traceDotColors[evt.type] || 'bg-gray-400'}`} />
        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${traceTypeColors[evt.type] || 'bg-gray-100 text-gray-500'}`}>
          {traceTypeLabels[evt.type] || evt.type}
        </span>
        <span className="text-[10px] text-macos-text-tertiary font-mono" title={evt.ts}>
          {evt.ts ? formatRelativeTime(evt.ts) : '-'}
        </span>
      </div>
      <p className="text-xs text-macos-text break-words mt-1 leading-relaxed" title={evt.message}>
        {evt.message || '-'}
      </p>
    </div>
  )
}

// 开始节点（样式复制自实例图 StartNode：绿色 Play 图标胶囊卡）
type TimelineMarkerNodeType = Node<{ label: string }, 'timeline-start' | 'timeline-end'>
const TimelineStartNode: FC<NodeProps<Node<{ label: string }, 'timeline-start'>>> = ({ data }) => (
  <div className="min-w-[80px] px-4 py-2.5 rounded-xl bg-white border-2 border-gray-200 shadow-lg">
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-green-100">
        <Play size={12} className="text-green-600" />
      </div>
      <span className="text-sm font-medium text-gray-800">{data.label}</span>
    </div>
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>
)

// 结束节点（样式复制自实例图 EndNode：红色 Square 图标胶囊卡）
const TimelineEndNode: FC<NodeProps<Node<{ label: string }, 'timeline-end'>>> = ({ data }) => (
  <div className="min-w-[80px] px-4 py-2.5 rounded-xl bg-white border-2 border-gray-200 shadow-lg">
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-100">
        <Square size={12} className="text-red-600" />
      </div>
      <span className="text-sm font-medium text-gray-800">{data.label}</span>
    </div>
    <Handle type="target" position={Position.Left} isConnectable={false} />
  </div>
)

const nodeTypes = { timeline: TimelineEventNode, 'timeline-start': TimelineStartNode, 'timeline-end': TimelineEndNode }

// 复制自 InstanceFlowGraph 的 FlowFitController（去掉跟随模式）：
// 容器就绪/尺寸变化/节点集变化时全图等比缩放 + 居中（getViewportForBounds 单一 zoom 天然等比居中）；
// 用户手动拖动/缩放后停止自动 fit，避免打断正在探索的视角。
// onMove 而非 onMoveStart：d3-zoom 的 .start() 对程序性 setViewport 也触发，
// 而 onMove 的 sourceEvent 在程序性变换时为 null，真实用户交互才有 event。
const TimelineFitController: FC<{
  box: { w: number; h: number }
  fitKey: string
  userInteracted: React.MutableRefObject<boolean>
}> = ({ box, fitKey, userInteracted }) => {
  const rf = useReactFlow()
  const store = useStoreApi()
  const total = useStore(s => s.nodeLookup.size)
  const measured = useStore(s => {
    let n = 0
    s.nodeLookup.forEach(v => { if (v.measured.width && v.measured.height) n += 1 })
    return n
  })
  const fittedBox = useRef<{ w: number; h: number } | null>(null)
  const fittedKey = useRef<string | null>(null)

  useEffect(() => {
    if (box.w < 2 || box.h < 2) return
    if (total === 0 || measured < total) return
    if (userInteracted.current) return
    const boxChanged = !fittedBox.current || fittedBox.current.w !== box.w || fittedBox.current.h !== box.h
    const nodesChanged = fitKey !== fittedKey.current
    if (!boxChanged && !nodesChanged) return

    const { nodeLookup, nodeOrigin } = store.getState()
    const ids: string[] = []
    nodeLookup.forEach(nd => { if (!nd.hidden) ids.push(nd.id) })
    if (!ids.length) return
    const bounds = getNodesBounds(ids, { nodeLookup, nodeOrigin })
    if (!bounds || !bounds.width || !bounds.height) return
    rf.setViewport(
      getViewportForBounds(bounds, box.w, box.h, FIT_MIN_ZOOM, FIT_MAX_ZOOM, FIT_PADDING),
      { duration: FIT_ANIMATE_MS },
    )
    fittedBox.current = { w: box.w, h: box.h }
    fittedKey.current = fitKey
  }, [rf, store, box.w, box.h, fitKey, total, measured])

  return null
}

interface TaskTimelineVisualProps {
  trace: TaskTraceEvent[]
  /** 任务当前状态：终态（已完成/已取消）才显示结束节点（同实例图 completed 才出 end） */
  status?: string
  /** 撑满父容器高度（放大弹窗用）；默认 300px（内嵌卡片，同实例执行进度） */
  fullHeight?: boolean
}

// 可视化时间线（ReactFlow，复制自 InstanceFlowGraph 的画布骨架改造）：
// 事件按时间正序从左到右排成横向节点链（带箭头连线），画布平移/缩放/自适应视野，
// 详情页内嵌卡片与放大弹窗共用。
export const TaskTimelineVisual: FC<TaskTimelineVisualProps> = ({ trace, status, fullHeight = false }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_W)
  const isTerminal = status === '已完成' || status === '已取消'
  const nodes: Array<TimelineEventNodeType | TimelineMarkerNodeType> = useMemo(() => {
    const sorted = [...trace].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    // 从左到右：开始 → 事件链（节点宽 240 + 间距 60）→ 结束
    const eventNodes: TimelineEventNodeType[] = sorted.map((evt, i) => ({
      id: `evt-${i}`,
      type: 'timeline',
      position: { x: (i + 1) * 300, y: 0 },
      data: { evt },
      selected: `evt-${i}` === selectedNodeId,
      draggable: false,
      selectable: false,
      focusable: false,
    }))
    // 开始/结束节点较矮，垂直方向居中对齐事件卡片
    const marker = (id: string, type: 'timeline-start' | 'timeline-end', label: string, x: number): TimelineMarkerNodeType => ({
      id, type, position: { x, y: 10 }, data: { label }, draggable: false, selectable: false, focusable: false,
    })
    return [
      marker('tl-start', 'timeline-start', '开始', 0),
      ...eventNodes,
      // 结束节点仅在任务终态出现（已完成/已取消）
      ...(isTerminal ? [marker('tl-end', 'timeline-end', '结束', (sorted.length + 1) * 300)] : []),
    ]
  }, [trace, isTerminal, selectedNodeId])

  const edges: Edge[] = useMemo(() => {
    const sorted = [...trace].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    if (sorted.length === 0) return []
    const chain: Edge[] = [{
      id: 'edge-start',
      source: 'tl-start',
      target: 'evt-0',
      ...defaultEdgeOptions,
    }]
    sorted.slice(1).forEach((_, i) => {
      chain.push({
        id: `edge-${i}`,
        source: `evt-${i}`,
        target: `evt-${i + 1}`,
        ...defaultEdgeOptions,
      })
    })
    if (isTerminal) {
      chain.push({
        id: 'edge-end',
        source: `evt-${sorted.length - 1}`,
        target: 'tl-end',
        ...defaultEdgeOptions,
      })
    }
    return chain
  }, [trace, isTerminal])

  const fitKey = useMemo(() => nodes.map(n => n.id).join('|'), [nodes])
  const userInteracted = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (nodes.length === 0) return
    const el = containerRef.current
    if (!el) return
    // clientWidth/Height 是布局盒，不受浮窗外层 framer-motion scale 动画影响
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setBox(prev => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [nodes.length])

  // 点击事件节点 — 展示该事件的完整变更详情面板（复制实例图节点点击→右侧面板交互）
  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type !== 'timeline') return
    setSelectedNodeId(prev => (prev === node.id ? null : node.id))
  }, [])
  const selectedEvent = useMemo(
    () => (selectedNodeId ? ((nodes.find(n => n.id === selectedNodeId)?.data as { evt: TaskTraceEvent } | undefined)?.evt ?? null) : null),
    [selectedNodeId, nodes]
  )

  // 面板左缘拖拽调宽（复制实例图产物面板）
  const handlePanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelWidth
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX // 向左拖动增加宽度
      const avail = (containerRef.current?.clientWidth || startWidth + PANEL_EDGE_GAP) - PANEL_EDGE_GAP
      const maxW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, avail))
      setPanelWidth(Math.round(Math.min(maxW, Math.max(PANEL_MIN_W, startWidth + delta))))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelWidth])
  // 窄容器（卡片内联视图）下不能超出画布宽度
  const panelW = Math.max(PANEL_MIN_W, Math.min(panelWidth, (box.w || panelWidth + PANEL_EDGE_GAP) - PANEL_EDGE_GAP))

  if (trace.length === 0) {
    return <p className="text-sm text-macos-text-tertiary text-center py-8">暂无事件记录</p>
  }

  return (
    <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden" style={{ height: fullHeight ? '100%' : '300px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedNodeId(null)}
        nodesConnectable={false}
        nodesDraggable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        minZoom={FIT_MIN_ZOOM}
        maxZoom={FIT_MAX_ZOOM}
        panOnScroll
        onMove={(event) => { if (event) userInteracted.current = true }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E5E5E5" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <TimelineFitController box={box} fitKey={fitKey} userInteracted={userInteracted} />
      </ReactFlow>

      {/* 事件详情面板 — 复制实例图产物面板的形态：右侧滑入、左缘拖拽调宽 */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="absolute right-4 top-4 bottom-4 bg-white rounded-xl border border-gray-200 shadow-lg z-10 flex flex-col overflow-hidden"
            style={{ width: panelW }}
          >
            {/* 左边缘拖拽调宽手柄：纯透明热区（与 Modal.tsx / 实例图面板一致） */}
            <div
              onMouseDown={handlePanelResizeStart}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20"
            />
            <div className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${traceDotColors[selectedEvent.type] || 'bg-gray-400'}`} />
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium flex-shrink-0 ${traceTypeColors[selectedEvent.type] || 'bg-gray-100 text-gray-500'}`}>
                  {traceTypeLabels[selectedEvent.type] || selectedEvent.type}
                </span>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1 rounded-md text-macos-text-tertiary hover:text-macos-text hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <Clock size={14} className="text-macos-text-tertiary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="text-xs text-macos-text-tertiary mb-0.5">发生时间</p>
                    <p className="text-sm text-macos-text font-mono break-all">{selectedEvent.ts}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <FileText size={14} className="text-macos-text-tertiary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="text-xs text-macos-text-tertiary mb-0.5">说明</p>
                    <p className="text-sm text-macos-text break-words">{selectedEvent.message || '-'}</p>
                  </div>
                </div>
                {selectedEvent.from != null && selectedEvent.to != null && (
                  <div className="flex items-start gap-2">
                    <ArrowRight size={14} className="text-macos-text-tertiary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-xs text-macos-text-tertiary mb-0.5">状态变更</p>
                      <p className="text-sm text-macos-text flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusBadgeClass(selectedEvent.from)}`}>{selectedEvent.from}</span>
                        <ArrowRight size={12} className="text-macos-text-tertiary" />
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusBadgeClass(selectedEvent.to)}`}>{selectedEvent.to}</span>
                      </p>
                    </div>
                  </div>
                )}
                {Array.isArray(selectedEvent.fields) && selectedEvent.fields.length > 0 && (
                  <div className="flex items-start gap-2">
                    <ListChecks size={14} className="text-macos-text-tertiary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-xs text-macos-text-tertiary mb-0.5">变更字段</p>
                      <p className="text-sm text-macos-text flex gap-1 flex-wrap">
                        {selectedEvent.fields.map(f => (
                          <span key={f} className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">{f}</span>
                        ))}
                      </p>
                    </div>
                  </div>
                )}
                {selectedEvent.name != null && (
                  <div className="flex items-start gap-2">
                    <StickyNote size={14} className="text-macos-text-tertiary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-xs text-macos-text-tertiary mb-0.5">上下文</p>
                      <p className="text-sm text-macos-text break-words">{selectedEvent.name}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
