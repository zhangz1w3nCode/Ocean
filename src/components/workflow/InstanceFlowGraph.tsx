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
import { computeGhostSuccessors } from '../../utils/instanceFlowGhost'
import { followKeyOf, isUsableRect, resolveViewportIntent } from '../../utils/instanceFlowViewport'

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

// 候选后继的虚化预览：只看不可交互，一旦该节点实体化（进了 visited）就由计算函数自动剔除
const GHOST_NODE_OPACITY = 0.3
const GHOST_EDGE_OPACITY = 0.4
const GHOST_EDGE_DASH = '6 4'
const GHOST_EDGE_COLOR = '#9CA3AF'

const FIT_PADDING = 0.2
// fit 的下限必须足够低：节点多的横向 DAG 在窄容器里需要的 zoom 会低于 ReactFlow 默认 0.2 地板，
// 一旦被 minZoom 截断，图就溢出容器无法完整居中展示，表现为「放大容器但图不变大/看不到全图」。
// 这里单独给 fit 一个更低的地板，同时把画板 minZoom 一起下调，避免 setViewport 被 scaleExtent 反向钉住。
const FIT_MIN_ZOOM = 0.05
const FIT_MAX_ZOOM = 2.5
const FIT_ANIMATE_MS = 250
// 跟随模式的档位：单节点 bounds 算出的原始 zoom 会远大于 1（节点只有 160~260px 宽），
// 因此最终放大倍数实际就是 FOLLOW_MAX_ZOOM 说了算；getViewportForBounds 的 clamp
// 不破坏居中（x/y 用的就是 clamp 后的 zoom）。
const FOLLOW_MIN_ZOOM = 0.2
const FOLLOW_MAX_ZOOM = 1.6
const FOLLOW_PADDING = 0.3
const FOLLOW_ANIMATE_MS = 400

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
// 画布视口有两种互斥行为，写的是同一个 viewport，所以由这一个控制器统一决定该做哪个
// （判定逻辑抽在 utils/instanceFlowViewport 里可单测）：
// - fit（默认）：把全部可见节点等比缩放 + 居中。只在三个时机触发：
//   ① 首次挂载并测量完成（进入详情页 / 打开放大浮窗）② 容器尺寸变化（拖边框 / 全屏）
//   ③ 实时刷新新增节点——但用户手动拖动/缩放过后就停止，避免打断用户正在探索的视角。
//   用户交互用 onMove 捕获，不能用 onMoveStart：d3-zoom 的 .start() 对程序性 setViewport
//   也会触发，会把第一次自动落位误判成用户操作（c508be9 修的就是这个）。
// - follow（跟随模式开关打开时）：聚焦 + 放大到当前正在执行的节点。当前节点每推进一步
//   就重新落位一次；开关是唯一控制权，用户手动拖过也会在下一次节点推进时被拉回。
//   跟随写入同样不污染 userInteracted，因此关掉开关后 fit 的原有语义照常成立。
const FlowFitController: FC<{
  box: { w: number; h: number }; fitKey: string; userInteracted: React.MutableRefObject<boolean>
  followMode: boolean; focusNodeId: string | null
}> = ({ box, fitKey, userInteracted, followMode, focusNodeId }) => {
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
  // 上次成功跟随的签名；关掉开关就清空，否则「关了再开且节点没变」会因签名相同而不再聚焦
  const followedKey = useRef<string | null>(null)

  useEffect(() => {
    if (!followMode) followedKey.current = null
  }, [followMode])

  useEffect(() => {
    const { nodeLookup, nodeOrigin } = store.getState()
    const focusNode = focusNodeId ? nodeLookup.get(focusNodeId) : undefined
    const intent = resolveViewportIntent({
      boxReady: box.w >= 2 && box.h >= 2,
      nodesMeasured: total > 0 && measured === total,
      followMode,
      focusNodeId,
      focusNodeMeasured: !!focusNode?.measured.width && !!focusNode?.measured.height,
      lastFollowKey: followedKey.current,
      lastFitBox: fittedBox.current,
      currentBox: box,
      userInteracted: userInteracted.current,
    })
    if (intent.kind === 'none') return

    if (intent.kind === 'follow' && focusNodeId) {
      const bounds = getNodesBounds([focusNodeId], { nodeLookup, nodeOrigin })
      if (!isUsableRect(bounds)) return
      rf.setViewport(
        getViewportForBounds(bounds, box.w, box.h, FOLLOW_MIN_ZOOM, FOLLOW_MAX_ZOOM, FOLLOW_PADDING),
        { duration: intent.animate ? FOLLOW_ANIMATE_MS : 0 },
      )
      followedKey.current = followKeyOf(focusNodeId, box)
      return
    }

    if (intent.kind !== 'fit') return
    const ids: string[] = []
    nodeLookup.forEach(nd => { if (!nd.hidden) ids.push(nd.id) })
    if (!ids.length) return
    const bounds = getNodesBounds(ids, { nodeLookup, nodeOrigin })
    if (!isUsableRect(bounds)) return
    rf.setViewport(
      getViewportForBounds(bounds, box.w, box.h, FIT_MIN_ZOOM, FIT_MAX_ZOOM, FIT_PADDING),
      { duration: intent.animate ? FIT_ANIMATE_MS : 0 },
    )
    fittedBox.current = { w: box.w, h: box.h }
  }, [rf, store, box.w, box.h, fitKey, total, measured, followMode, focusNodeId])

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
  /** 跟随模式：开启后每次自动聚焦 + 放大到当前正在执行的节点 */
  followMode?: boolean
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

export const InstanceFlowGraph: FC<InstanceFlowGraphProps> = ({ traceLog, flowData, completedNodes, currentName, wfStatus, artifacts, fullHeight, followMode = false }) => {
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
              id: edge.id, source: edge.source, target: edge.target, type: 'default', sourceHandle: edge.sourceHandle,
              animated: isRunning,
              style: { strokeWidth: 2, stroke: isCurrentEdge ? '#3B82F6' : '#9CA3AF' },
              markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: isCurrentEdge ? '#3B82F6' : '#9CA3AF' },
            })
          }
        } else {
          const tgtNode = flowData.nodes.find(n => n.id === edge.target)
          const isCurrentEdge = isRunning && tgtNode && tgtNode.data?.label === currentName
          traversed.push({
            id: edge.id, source: edge.source, target: edge.target, type: 'default', sourceHandle: edge.sourceHandle,
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
            traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default', sourceHandle: edge.sourceHandle, animated: isRunning, style: { strokeWidth: 2, stroke: '#9CA3AF' }, markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#9CA3AF' } })
          }
        }
      }
    }

    if (path.length > 0 && wfStatus === 'completed') {
      const lastNode = flowMap.get(path[path.length - 1].node)
      const endNode = flowData.nodes.find(n => n.type === 'end')
      if (lastNode && endNode) for (const edge of flowData.edges) {
        if (edge.source === lastNode.id && edge.target === endNode.id) {
          traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default', sourceHandle: edge.sourceHandle, style: { strokeWidth: 2, stroke: '#9CA3AF' }, markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#9CA3AF' } })
        }
      }
    }

    const seen = new Set(traversed.map(e => e.id))
    return traversed.filter(e => { if (seen.has(e.id)) { seen.delete(e.id); return true } return false })
  }, [path, flowData, flowMap, completedNodes, currentName, isRunning])

  // frontier = currentName 的候选后继中尚未实体化的那批。不按 wfStatus 做窗口门控：
  // 引擎在 complete() 里就把 current 推到了下一节点，未知窗口横跨 idle/executing/awaitingchoice/choose
  const ghost = useMemo(
    () => computeGhostSuccessors({ flowData, visited, currentName, path, enabled: isRunning }),
    [flowData, visited, currentName, path, isRunning],
  )

  const ghostNodes: Node[] = useMemo(() => {
    if (!flowData?.nodes) return []
    return ghost.nodeIds.map(id => {
      const n = flowData.nodes.find(x => x.id === id)
      if (!n) return null
      return {
        id: n.id, type: n.type, position: n.position, data: n.data,
        // 六类节点组件都靠 selected 画边框 + ring，虚化态必须为 false
        selected: false, selectable: false, draggable: false, focusable: false,
        className: 'node-ghost',
        style: { opacity: GHOST_NODE_OPACITY, pointerEvents: 'none' } as React.CSSProperties,
      } as Node
    }).filter(Boolean) as Node[]
  }, [flowData, ghost])

  const ghostEdges: Edge[] = useMemo(() => ghost.edges.map(e => ({
    id: e.id, source: e.source, target: e.target, type: 'default', sourceHandle: e.sourceHandle,
    animated: false, selectable: false,
    style: { strokeWidth: 2, stroke: GHOST_EDGE_COLOR, strokeDasharray: GHOST_EDGE_DASH, opacity: GHOST_EDGE_OPACITY },
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: GHOST_EDGE_COLOR },
  })) as Edge[], [ghost])

  const displayNodes = useMemo(() => [...initialNodes, ...ghostNodes], [initialNodes, ghostNodes])
  const displayEdges = useMemo(() => [...initialEdges, ...ghostEdges], [initialEdges, ghostEdges])

  const [nodes, setNodes] = useState(displayNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(displayEdges)
  // 实时刷新时同步新数据到 state
  useEffect(() => { setNodes(displayNodes) }, [displayNodes, setNodes])
  useEffect(() => { setEdges(displayEdges) }, [displayEdges, setEdges])

  const hasGraph = !!flowData?.nodes?.length && path.length > 0
  // 可见节点 id 集合变化时触发动态 fit（但用户手动操作后停止）
  const fitKey = useMemo(() => displayNodes.map(n => n.id).join('|'), [displayNodes])
  // 跟随目标：currentName 是 label，要经 flowMap 换成节点 id。visited 恒含 currentName，
  // 所以正常情况下该节点必定已在画布里；取不到时按无目标处理，回落到整图 fit
  const focusNodeId = useMemo(
    () => (currentName ? flowMap.get(currentName)?.id ?? null : null),
    [flowMap, currentName],
  )
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
        onPaneClick={() => setSelectedNodeLabel(null)}
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
        <FlowFitController box={box} fitKey={fitKey} userInteracted={userInteracted} followMode={followMode} focusNodeId={focusNodeId} />
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
                  <div>
                    <div className="text-xs font-mono text-macos-text-tertiary mb-1.5">{selectedArtifacts[0].invokeId} {selectedArtifacts[0].version}</div>
                    <MarkdownRenderer content={selectedArtifacts[0].content} className="text-sm" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {selectedArtifacts.map((art, i) => (
                      <div key={i}>
                        <div className="text-xs font-mono text-macos-text-tertiary mb-1.5">{art.invokeId} {art.version}</div>
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
