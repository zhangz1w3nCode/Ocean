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
import type { ReactFlowNode, ReactFlowEdge } from '../../types/flow'

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
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 15,
    height: 15,
    color: '#9CA3AF',
  },
  style: {
    strokeWidth: 2,
    stroke: '#9CA3AF',
  },
}

interface InstanceFlowGraphProps {
  mermaid: string
  flowData: { nodes: any[]; edges: any[] } | null
}

// ===== Mermaid 解析 =====

function parseMermaid(md: string) {
  const nodeDefs: { id: string; label: string; shape: 'stadium' | 'rect' | 'diamond' }[] = []
  const edgeDefs: { source: string; target: string; branch?: string }[] = []
  const doneIds: string[] = []

  for (const line of md.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('%%') || t.startsWith('classDef')) continue

    const cls = t.match(/^class\s+(.+?)\s+(done|current)$/)
    if (cls) {
      if (cls[2] === 'done') doneIds.push(...cls[1].split(',').map(s => s.trim()))
      continue
    }

    const edge = t.match(/^(.+?)\s*-->\s*(?:\|(.+?)\|\s*)?(.+)$/)
    if (edge) {
      edgeDefs.push({ source: edge[1].trim(), target: edge[3].trim(), branch: edge[2]?.trim() })
      extractNode(edge[1].trim(), nodeDefs)
      extractNode(edge[3].trim(), nodeDefs)
      continue
    }
    extractNode(t, nodeDefs)
  }
  return { nodeDefs, edgeDefs, doneIds }
}

function extractNode(text: string, nodes: { id: string; label: string; shape: 'stadium' | 'rect' | 'diamond' }[]) {
  let m = text.match(/^([\w\u4e00-\u9fff_]+)\(\[(.+?)\]\)$/)
  if (m) { pushNode(nodes, m[1], m[2], 'stadium'); return }
  m = text.match(/^([\w\u4e00-\u9fff_]+)\{(.+?)\}$/)
  if (m) { pushNode(nodes, m[1], m[2], 'diamond'); return }
  m = text.match(/^([\w\u4e00-\u9fff_]+)\[(.+?)\]$/)
  if (m) { pushNode(nodes, m[1], m[2], 'rect'); return }
  const bare = text.match(/^([\w\u4e00-\u9fff_]+)$/)
  if (bare) pushNode(nodes, bare[1], bare[1], 'rect')
}

function pushNode(nodes: any[], id: string, label: string, shape: string) {
  if (!nodes.find(n => n.id === id)) nodes.push({ id, label, shape })
}

function shapeToType(shape: string, flowNode?: any): string {
  if (shape === 'stadium') return flowNode?.type === 'end' ? 'end' : 'start'
  if (shape === 'diamond') return 'decision'
  return flowNode?.type || 'business'
}

// ===== 组件 =====

export const InstanceFlowGraph: FC<InstanceFlowGraphProps> = ({ mermaid, flowData }) => {
  const { nodeDefs, edgeDefs, doneIds } = useMemo(() => parseMermaid(mermaid), [mermaid])

  const flowMap = useMemo(() => {
    const m = new Map<string, any>()
    if (flowData?.nodes) {
      for (const n of flowData.nodes) m.set(n.data?.label || '', n)
    }
    return m
  }, [flowData])

  const initialNodes: Node[] = useMemo(() => {
    return nodeDefs.map((nd) => {
      const fn = flowMap.get(nd.label)
      const type = shapeToType(nd.shape, fn)
      return {
        id: nd.id,
        type,
        position: fn?.position || { x: Math.random() * 400, y: Math.random() * 200 },
        data: { label: nd.label, ...(fn?.data || {}) },
        selected: doneIds.includes(nd.id),
      } as Node
    })
  }, [nodeDefs, flowMap, doneIds])

  const initialEdges: Edge[] = useMemo(() => {
    return edgeDefs.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      type: 'default',
    } as Edge))
  }, [edgeDefs])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

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
      <Background
        color="#E5E5E5"
        gap={20}
        size={1}
        variant={BackgroundVariant.Dots}
      />
      <Controls className="!bg-white !border !border-gray-200 !shadow-md" />
      </ReactFlow>
  )
}
