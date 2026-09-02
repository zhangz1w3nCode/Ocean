import type { FC } from 'react'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { X, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ReactFlow,
  Background,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  useStore,
  useStoreApi,
  useEdgesState,
  applyNodeChanges,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { MarkdownRenderer } from '../ui'
import {
  StartNode,
  EndNode,
  ProcessNode,
  DecisionNode,
  BusinessNode,
  LocalNode,
} from '../flow/nodes'
import type { InstanceArtifact } from '../../types'

const nodeTypes = {
  start: StartNode, end: EndNode, process: ProcessNode,
  decision: DecisionNode, business: BusinessNode, local: LocalNode,
}

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#9CA3AF' },
  style: { strokeWidth: 2, stroke: '#9CA3AF' },
}

const FIT_PADDING = 0.2
// fit 的下限必须足够低：节点多的横向 DAG 在窄容器里需要的 zoom 会低于 ReactFlow 默认 0.2 地板，
// 一旦被 minZoom 截断，图就溢出容器无法完整居中展示，表现为「放大容器但图不变大/看不到全图」。
// 这里单独给 fit 一个更低的地板，同时把画板 minZoom 一起下调，避免 setViewport 被 scaleExtent 反向钉住。
const FIT_MIN_ZOOM = 0.05
const FIT_MAX_ZOOM = 2.5
const FIT_ANIMATE_MS = 250

// 产物面板宽度：默认比原来的 w-72(288px) 宽，左边缘可拖拽调宽
const PANEL_DEFAULT_W = 420
const PANEL_MIN_W = 300
const PANEL_MAX_W = 880
const PANEL_EDGE_GAP = 32

// ReactFlow 的 fitView prop 是一次性的：store 的 fitViewQueued 在首次节点测量完成后被消费并置回 false，
// 之后容器 resize 只会更新 store 的 width/height（useResizeHandler），不重算 viewport transform。
// 这里用容器实测尺寸 + 节点 bounds 自行算 viewport 再写入：getViewportForBounds 输出单一 zoom（天然等比）
// 并把 bounds 中心对齐到视口中心（天然居中）。不用 rf.fitView() 是因为它内部会 setNodes，
// 而我们的 user nodes 不带 measured，重新 adopt 会把已测得的尺寸清空导致 nodesInitialized 反复翻转。
//
// fit 只在两个时机触发：① 首次挂载并测量完成（进入详情页 / 打开放大浮窗）② 容器尺寸变化（拖边框 / 全屏）。
// 实时刷新新增节点也触发动态等比 fit，但一旦用户手动拖动/缩放画布就停止自动调整。
// 用 onMoveStart 捕获用户交互 → userInteracted.current=true → 后续节点增长不再复位，
// 避免打断用户正在探索的视角。首次挂载和容器 resize 仍始终 fit。
const FlowFitController: FC<{ box: { w: number; h: number }; fitKey: string; userInteracted: React.MutableRefObject<boolean> }> = ({ box, fitKey, userInteracted }) => {
  const rf = useReactFlow()
  const store = useStoreApi()
  const total = useStore(s => s.nodeLookup.size)
  const measured = useStore(s => {
    let n = 0
    s.nodeLookup.forEach(v => { if (v.measured.width && v.measured.height) n += 1 })
    return n
  })
  // 记录上次 fit 时的容器尺寸；null 表示还没 fit 过
  const fittedBox = useRef<{ w: number; h: number } | null>(null)

  useEffect(() => {
    if (box.w < 2 || box.h < 2) return
    const isFirst = fittedBox.current === null
    const isResize = !!fittedBox.current && (fittedBox.current.w !== box.w || fittedBox.current.h !== box.h)
    // 节点集合变化（新增节点）时动态 fit，但用户手动操作过就不再自动调整
    const isNodeGrowth = !!fittedBox.current && !isResize && !userInteracted.current
    if (!isFirst && !isResize && !isNodeGrowth) return
    if (total === 0 || measured !== total) return
    const { nodeLookup, nodeOrigin } = store.getState()
    const ids: string[] = []
    nodeLookup.forEach(nd => { if (!nd.hidden) ids.push(nd.id) })
    if (!ids.length) return
    const bounds = getNodesBounds(ids, { nodeLookup, nodeOrigin })
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return
    if (bounds.width <= 0 || bounds.height <= 0) return
    rf.setViewport(
      getViewportForBounds(bounds, box.w, box.h, FIT_MIN_ZOOM, FIT_MAX_ZOOM, FIT_PADDING),
      { duration: isFirst ? 0 : FIT_ANIMATE_MS },
    )
    fittedBox.current = { w: box.w, h: box.h }
  }, [rf, store, box.w, box.h, fitKey, total, measured])

  return null
}

interface InstanceFlowGraphProps {
  traceLog: string
  flowData: { nodes: any[]; edges: any[] } | null
  completedNodes: string[]
  currentName: string
  wfStatus: string
  artifacts: InstanceArtifact[]
  fullHeight?: boolean
}
function parseTraceLog(rawLog: string) {
  const entries = rawLog.split('\n').filter(l => l.trim())
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean) as Array<{ ts: string; command: string; node?: string; invoke?: string; status?: string; branch?: string }>

  const path: Array<{ node: string; branch?: string }> = []
  for (const entry of entries) {
    if (!entry.node || !entry.status) continue
    if (entry.status === 'active') {
      path.push({ node: entry.node, branch: entry.branch })
    } else if (entry.status === 'completed' && entry.branch) {
      const last = path[path.length - 1]
      if (last) last.branch = entry.branch
    }
  }
  return path
}

export const InstanceFlowGraph: FC<InstanceFlowGraphProps> = ({ traceLog, flowData, completedNodes, currentName, wfStatus, artifacts, fullHeight }) => {
  const [selectedNodeLabel, setSelectedNodeLabel] = useState<string | null>(null)

  const path = useMemo(() => parseTraceLog(traceLog), [traceLog])
  const isRunning = wfStatus !== 'completed' && wfStatus !== 'aborted' && path.length > 0

  const flowMap = useMemo(() => {
    const m = new Map<string, any>()
    if (flowData?.nodes) for (const n of flowData.nodes) m.set(n.data?.label || '', n)
    return m
  }, [flowData])

  const visited = useMemo(() => {
    const s = new Set<string>()
    for (const p of path) s.add(p.node)
    if (currentName) s.add(currentName)
    if (flowData?.nodes) {
      const start = flowData.nodes.find(n => n.type === 'start')
      if (start) s.add(start.data?.label || '')
      const end = flowData.nodes.find(n => n.type === 'end')
      if (end && wfStatus === 'completed') s.add(end.data?.label || '')
    }
    return s
  }, [path, flowData, currentName, wfStatus])

  const initialNodes: Node[] = useMemo(() => {
    if (!flowData?.nodes) return []
    return flowData.nodes.filter(n => visited.has(n.data?.label || '')).map(n => {
      const label = n.data?.label || ''
      const isCurrent = currentName === label
      // 呼吸发光颜色按节点类型走，与 selected 边框色一致
      const breathingColors: Record<string, string> = {
        business: 'rgba(168, 85, 247, 0.25)', process: 'rgba(59, 130, 246, 0.25)',
        decision: 'rgba(249, 115, 22, 0.25)', start: 'rgba(34, 197, 94, 0.25)',
        end: 'rgba(239, 68, 68, 0.25)', local: 'rgba(107, 114, 128, 0.25)',
      }
      return {
        id: n.id, type: n.type, position: n.position, data: n.data, selected: isCurrent,
        className: isCurrent ? 'node-breathing' : undefined,
        style: isCurrent ? { '--breathing-color': breathingColors[n.type] || breathingColors.business } as React.CSSProperties : undefined,
      } as Node
    })
  }, [flowData, visited, currentName])

  const initialEdges: Edge[] = useMemo(() => {
    if (!flowData?.nodes || !flowData?.edges) return []
    const traversed: Edge[] = []

    for (const p of path) {
      const node = flowMap.get(p.node)
      if (!node) continue
      for (const edge of flowData.edges) {
        if (edge.source !== node.id) continue
        if (node.type === 'decision') {
          if (!p.branch) continue
          const branch = node.data?.branches?.find((b: any) => b.name === p.branch)
          if (branch && edge.branchId === branch.id) {
            const tgtNode = flowData.nodes.find(n => n.id === edge.target)
            const isCurrentEdge = isRunning && tgtNode && tgtNode.data?.label === currentName
            traversed.push({
              id: edge.id, source: edge.source, target: edge.target, type: 'default',
              animated: isRunning,
              style: { strokeWidth: 2, stroke: isCurrentEdge ? '#3B82F6' : '#9CA3AF' },
              markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: isCurrentEdge ? '#3B82F6' : '#9CA3AF' },
            })
          }
        } else {
          const tgtNode = flowData.nodes.find(n => n.id === edge.target)
          const isCurrentEdge = isRunning && tgtNode && tgtNode.data?.label === currentName
          traversed.push({
            id: edge.id, source: edge.source, target: edge.target, type: 'default',
            animated: isRunning,
            style: { strokeWidth: 2, stroke: isCurrentEdge ? '#3B82F6' : '#9CA3AF' },
            markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: isCurrentEdge ? '#3B82F6' : '#9CA3AF' },
          })
        }
      }
    }

    if (path.length > 0) {
      const startNode = flowData.nodes.find(n => n.type === 'start')
      if (startNode) {
        const firstTarget = flowMap.get(path[0].node)
        if (firstTarget) for (const edge of flowData.edges) {
          if (edge.source === startNode.id && edge.target === firstTarget.id) {
            traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default', animated: isRunning, style: { strokeWidth: 2, stroke: '#9CA3AF' }, markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#9CA3AF' } })
          }
        }
      }
    }

    if (path.length > 0 && wfStatus === 'completed') {
      const lastNode = flowMap.get(path[path.length - 1].node)
      const endNode = flowData.nodes.find(n => n.type === 'end')
      if (lastNode && endNode) for (const edge of flowData.edges) {
        if (edge.source === lastNode.id && edge.target === endNode.id) {
          traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default', style: { strokeWidth: 2, stroke: '#9CA3AF' }, markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#9CA3AF' } })
        }
      }
    }

    const seen = new Set(traversed.map(e => e.id))
    return traversed.filter(e => { if (seen.has(e.id)) { seen.delete(e.id); return true } return false })
  }, [path, flowData, flowMap, completedNodes, currentName, isRunning])

  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  // 实时刷新时同步新数据到 state
  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])

  const hasGraph = !!flowData?.nodes?.length && path.length > 0
  // 可见节点 id 集合变化时触发动态 fit（但用户手动操作后停止）
  const fitKey = useMemo(() => initialNodes.map(n => n.id).join('|'), [initialNodes])
  const userInteracted = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!hasGraph) return
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
  }, [hasGraph])

  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_W)
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

  // 过滤 selection 变更，防止 ReactFlow 清除程序设置的 selected 高亮
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes.filter(c => c.type !== 'select'), nds))
  }, [])

  // 点击节点 — 任何已渲染节点都可点击查看产物
  const onNodeClick = (_e: React.MouseEvent, node: Node) => {
    const label = String(node.data?.label || '')
    setSelectedNodeLabel(prev => prev === label ? null : label)
  }

  // 找选中节点的产物
  const selectedArtifacts = useMemo(() => {
    if (!selectedNodeLabel) return []
    return artifacts.filter(a => a.nodeName === selectedNodeLabel)
  }, [selectedNodeLabel, artifacts])

  if (!hasGraph) {
    return <p className="text-sm text-macos-text-tertiary text-center py-8">无执行进度数据</p>
  }

  return (
    <div ref={containerRef} className="relative w-full rounded-lg overflow-hidden" style={{ height: fullHeight ? '100%' : '300px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesConnectable={false}
        minZoom={FIT_MIN_ZOOM}
        maxZoom={FIT_MAX_ZOOM}
        panOnScroll
        panOnScrollMode={undefined}
        // onMove 而非 onMoveStart：d3-zoom 的 .start() 对程序性 setViewport 也触发，
        // 而 onMove 的 sourceEvent 在程序性变换时为 null，真实用户交互才有 event
        onMove={(event) => { if (event) userInteracted.current = true }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E5E5E5" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <FlowFitController box={box} fitKey={fitKey} userInteracted={userInteracted} />
      </ReactFlow>

      {/* 节点产物面板 */}
      <AnimatePresence>
        {selectedNodeLabel && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="absolute right-4 top-4 bottom-4 bg-white rounded-xl border border-gray-200 shadow-lg z-10 flex flex-col overflow-hidden"
            style={{ width: panelW }}
          >
            {/* 左边缘拖拽调宽手柄：纯透明热区，只靠鼠标指针反馈（与 Modal.tsx / 技能卡片一致） */}
            <div
              onMouseDown={handlePanelResizeStart}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20"
            />
            <div className="flex items-center justify-between px-4 h-12 flex-shrink-0 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-macos-text-secondary flex-shrink-0" strokeWidth={1.5} />
                <span className="text-sm font-medium text-macos-text truncate">{selectedNodeLabel}</span>
              </div>
              <button
                onClick={() => setSelectedNodeLabel(null)}
                className="p-1 rounded-md text-macos-text-tertiary hover:text-macos-text hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedArtifacts.length > 0 ? (
                selectedArtifacts.length === 1 ? (
                  <MarkdownRenderer content={selectedArtifacts[0].content} className="text-sm" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {selectedArtifacts.map((art, i) => (
                      <div key={i}>
                        <div className="text-xs font-mono text-macos-text-tertiary mb-1.5">{art.invokeId}</div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <MarkdownRenderer content={art.content} className="text-sm" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-sm text-macos-text-tertiary text-center py-8">暂无产物</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
