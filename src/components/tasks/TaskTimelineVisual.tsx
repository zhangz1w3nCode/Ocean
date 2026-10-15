import type { FC } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
const TimelineEventNode: FC<NodeProps<TimelineEventNodeType>> = ({ data }) => {
  const evt = data.evt
  return (
    <div
      className="bg-white rounded-lg border px-3 py-2 shadow-sm w-[240px]"
      style={{ borderColor: traceBorderColors[evt.type] || '#9ca3af' }}
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

const nodeTypes = { timeline: TimelineEventNode }

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
  /** 撑满父容器高度（放大弹窗用）；默认 300px（内嵌卡片，同实例执行进度） */
  fullHeight?: boolean
}

// 可视化时间线（ReactFlow，复制自 InstanceFlowGraph 的画布骨架改造）：
// 事件按时间正序从左到右排成横向节点链（带箭头连线），画布平移/缩放/自适应视野，
// 详情页内嵌卡片与放大弹窗共用。
export const TaskTimelineVisual: FC<TaskTimelineVisualProps> = ({ trace, fullHeight = false }) => {
  const nodes: TimelineEventNodeType[] = useMemo(() => {
    const sorted = [...trace].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    // 从左到右：节点宽 240 + 间距 60，时间正序横向推进
    return sorted.map((evt, i) => ({
      id: `evt-${i}`,
      type: 'timeline',
      position: { x: i * 300, y: 0 },
      data: { evt },
      draggable: false,
      selectable: false,
      focusable: false,
    }))
  }, [trace])

  const edges: Edge[] = useMemo(() => {
    const sorted = [...trace].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    return sorted.slice(1).map((_, i) => ({
      id: `edge-${i}`,
      source: `evt-${i}`,
      target: `evt-${i + 1}`,
      ...defaultEdgeOptions,
    }))
  }, [trace])

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

  if (nodes.length === 0) {
    return <p className="text-sm text-macos-text-tertiary text-center py-8">暂无事件记录</p>
  }

  return (
    <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden" style={{ height: fullHeight ? '100%' : '300px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
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
    </div>
  )
}
