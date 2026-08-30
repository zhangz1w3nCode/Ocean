import type { FC } from 'react'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText } from 'lucide-react'
import {
  ReactFlow,
  Background,
  Controls,
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
      if (end && completedNodes.length > 0) s.add(end.data?.label || '')
    }
    return s
  }, [path, flowData, completedNodes, currentName])

  const initialNodes: Node[] = useMemo(() => {
    if (!flowData?.nodes) return []
    return flowData.nodes.filter(n => visited.has(n.data?.label || '')).map(n => {
      const label = n.data?.label || ''
      const isCurrent = currentName === label
      return { id: n.id, type: n.type, position: n.position, data: n.data, selected: isCurrent } as Node
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

    if (path.length > 0 && completedNodes.length > 0) {
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

  if (!flowData?.nodes?.length || path.length === 0) {
    return <p className="text-sm text-macos-text-tertiary text-center py-8">无执行进度数据</p>
  }

  return (
    <div className="relative w-full rounded-lg overflow-hidden" style={{ height: fullHeight ? '100%' : '300px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        panOnScroll
        panOnScrollMode={undefined}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E5E5E5" gap={20} size={1} variant={BackgroundVariant.Dots} />
      </ReactFlow>

      {/* 节点产物面板 */}
      <AnimatePresence>
        {selectedNodeLabel && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className="absolute right-4 top-4 bottom-4 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-10 flex flex-col overflow-hidden"
          >
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
