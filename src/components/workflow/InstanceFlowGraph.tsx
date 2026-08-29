import type { FC } from 'react'
import { useState, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  StartNode,
  EndNode,
  ProcessNode,
  DecisionNode,
  BusinessNode,
  LocalNode,
} from '../flow/nodes'

const nodeTypes = {
  start: StartNode,
  end: EndNode,
  process: ProcessNode,
  decision: DecisionNode,
  business: BusinessNode,
  local: LocalNode,
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
}

// 解析 trace.jsonl，复刻 workflow-cli executor.rs render_mermaid 的 path 构建逻辑
function parseTraceLog(rawLog: string) {
  const entries = rawLog
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      try { return JSON.parse(l) } catch { return null }
    })
    .filter(Boolean) as Array<{
      ts: string
      command: string
      node?: string
      invoke?: string
      status?: string
      branch?: string
    }>

  // 构建 ordered path: [(node_label, branch?)]
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

export const InstanceFlowGraph: FC<InstanceFlowGraphProps> = ({ traceLog, flowData, completedNodes, currentName }) => {
  const path = useMemo(() => parseTraceLog(traceLog), [traceLog])

  // flow.json 按 label 索引
  const flowMap = useMemo(() => {
    const m = new Map<string, any>()
    if (flowData?.nodes) {
      for (const n of flowData.nodes) m.set(n.data?.label || '', n)
    }
    return m
  }, [flowData])

  // visited 集合：path 中的节点 + start + end(若 completed)
  const visited = useMemo(() => {
    const s = new Set<string>()
    for (const p of path) s.add(p.node)
    // start 节点
    if (flowData?.nodes) {
      const start = flowData.nodes.find(n => n.type === 'start')
      if (start) s.add(start.data?.label || '')
      const end = flowData.nodes.find(n => n.type === 'end')
      if (end && completedNodes.length > 0) s.add(end.data?.label || '')
    }
    return s
  }, [path, flowData, completedNodes])

  // 构建 ReactFlow nodes
  const initialNodes: Node[] = useMemo(() => {
    if (!flowData?.nodes) return []
    return flowData.nodes
      .filter(n => visited.has(n.data?.label || ''))
      .map(n => {
        const label = n.data?.label || ''
        const isDone = completedNodes.includes(label) || n.type === 'start'
        return {
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
          selected: isDone,
        } as Node
      })
  }, [flowData, visited, completedNodes])

  // 构建 traversed edges（复刻 executor.rs 逻辑）
  const initialEdges: Edge[] = useMemo(() => {
    if (!flowData?.nodes || !flowData?.edges) return []

    const nodeById = new Map(flowData.nodes.map(n => [n.id, n]))
    const traversed: Edge[] = []

    // 1. path 中每个节点的出边
    for (const p of path) {
      const node = flowMap.get(p.node)
      if (!node) continue

      for (const edge of flowData.edges) {
        if (edge.source !== node.id) continue

        if (node.type === 'decision') {
          // decision: 只选 branch 匹配的边
          if (!p.branch) continue
          const branch = node.data?.branches?.find((b: any) => b.name === p.branch)
          if (branch && edge.branchId === branch.id) {
            traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default' })
          }
        } else {
          // 非 decision: 所有出边
          traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default' })
        }
      }
    }

    // 2. start → path 第一个节点
    if (path.length > 0) {
      const startNode = flowData.nodes.find(n => n.type === 'start')
      if (startNode) {
        const firstTarget = flowMap.get(path[0].node)
        if (firstTarget) {
          for (const edge of flowData.edges) {
            if (edge.source === startNode.id && edge.target === firstTarget.id) {
              traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default' })
            }
          }
        }
      }
    }

    // 3. 最后一个节点 → end（若 completed）
    if (path.length > 0 && completedNodes.length > 0) {
      const lastNode = flowMap.get(path[path.length - 1].node)
      const endNode = flowData.nodes.find(n => n.type === 'end')
      if (lastNode && endNode) {
        for (const edge of flowData.edges) {
          if (edge.source === lastNode.id && edge.target === endNode.id) {
            traversed.push({ id: edge.id, source: edge.source, target: edge.target, type: 'default' })
          }
        }
      }
    }

    // 去重
    const seen = new Set(traversed.map(e => e.id))
    return traversed.filter(e => { if (seen.has(e.id)) { seen.delete(e.id); return true } return false })
  }, [path, flowData, flowMap, completedNodes])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])

  if (!flowData?.nodes?.length || path.length === 0) {
    return <p className="text-sm text-macos-text-tertiary text-center py-8">无执行进度数据</p>
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      nodesConnectable={false}
      fitView
      fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1 }}
      minZoom={0.2}
      maxZoom={2}
      defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      panOnScroll
      panOnScrollMode={undefined}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#E5E5E5" gap={20} size={1} variant={BackgroundVariant.Dots} />
      <Controls className="!bg-white !border !border-gray-200 !shadow-md" />
    </ReactFlow>
  )
}
