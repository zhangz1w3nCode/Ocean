import { create } from 'zustand'
import type { ReactFlowNode, ReactFlowEdge } from '../types/flow'
import { generateNodeId, generateEdgeId } from '../types/flow'

// 历史记录项
interface HistoryItem {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
}

// 剪贴板数据结构
interface ClipboardData {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
}

interface FlowEditorState {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  selectedNodeIds: string[]      // 多选节点
  selectedEdgeIds: string[]      // 多选边
  workflowName: string
  workflowId: string | null

  // 连线状态
  connectingNodeId: string | null  // 正在拖拽连线的源节点ID

  // 悬停状态
  hoveredNodeId: string | null    // 当前悬停的节点ID

  // 剪贴板
  clipboard: ClipboardData | null

  // 历史记录
  history: HistoryItem[]
  historyIndex: number
  maxHistorySize: number

  // Actions
  setNodes: (nodes: ReactFlowNode[] | ((nodes: ReactFlowNode[]) => ReactFlowNode[])) => void
  setEdges: (edges: ReactFlowEdge[] | ((edges: ReactFlowEdge[]) => ReactFlowEdge[])) => void
  addNode: (node: ReactFlowNode) => void
  updateNode: (id: string, updates: Partial<ReactFlowNode['data']>) => void
  deleteNode: (id: string) => void
  deleteEdge: (id: string) => void
  selectNode: (id: string | null, multi?: boolean) => void
  selectEdge: (id: string | null, multi?: boolean) => void
  selectNodes: (ids: string[]) => void
  selectEdges: (ids: string[]) => void
  clearSelection: () => void
  deleteSelectedNodes: () => void
  setWorkflowInfo: (name: string, id: string | null) => void
  reset: () => void
  initNewWorkflow: (name: string, id: string | null) => void
  loadWorkflow: (nodes: ReactFlowNode[], edges: ReactFlowEdge[], name: string, id: string | null) => void

  // 剪贴板操作
  copyNodes: (ids: string[]) => void
  pasteNodes: (offset?: { x: number; y: number }) => void
  hasClipboard: () => boolean

  // 自动布局
  autoLayout: () => void

  // 历史操作
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => void
  redo: () => void
  pushHistory: () => void
  clearHistory: () => void

  // 连线操作
  setConnectingNode: (id: string | null) => void

  // 悬停操作
  setHoveredNode: (id: string | null) => void
}

const initialState = {
  nodes: [] as ReactFlowNode[],
  edges: [] as ReactFlowEdge[],
  selectedNodeId: null,
  selectedEdgeId: null,
  selectedNodeIds: [] as string[],
  selectedEdgeIds: [] as string[],
  workflowName: '未命名工作流',
  workflowId: null,
  connectingNodeId: null as string | null,
  hoveredNodeId: null as string | null,
  clipboard: null as ClipboardData | null,
  history: [] as HistoryItem[],
  historyIndex: -1,
  maxHistorySize: 50,
}

export const useFlowEditorStore = create<FlowEditorState>((set, get) => ({
  ...initialState,

  setNodes: (nodes) =>
    set((state) => ({
      nodes: typeof nodes === 'function' ? nodes(state.nodes) : nodes,
    })),

  setEdges: (edges) =>
    set((state) => ({
      edges: typeof edges === 'function' ? edges(state.edges) : edges,
    })),

  addNode: (node) => {
    get().pushHistory()
    set((state) => ({
      nodes: [...state.nodes, node],
    }))
  },

  updateNode: (id, updates) => {
    get().pushHistory()
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
      ),
    }))
  },

  deleteNode: (id) => {
    get().pushHistory()
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }))
  },

  deleteEdge: (id) => {
    get().pushHistory()
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== id),
      selectedEdgeId: state.selectedEdgeId === id ? null : state.selectedEdgeId,
    }))
  },

  deleteSelectedNodes: () => {
    const { selectedNodeIds, selectedEdgeIds, nodes, edges } = get()
    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return

    get().pushHistory()

    // 获取所有与选中节点关联的边
    const relatedEdges = edges.filter(e =>
      selectedNodeIds.includes(e.source) || selectedNodeIds.includes(e.target)
    )
    const relatedEdgeIds = relatedEdges.map(e => e.id)

    // 删除节点和关联边
    const newNodes = nodes.filter(n => !selectedNodeIds.includes(n.id))
    const newEdges = edges.filter(e =>
      !relatedEdgeIds.includes(e.id) && !selectedEdgeIds.includes(e.id)
    )

    set({
      nodes: newNodes,
      edges: newEdges,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedNodeId: null,
      selectedEdgeId: null,
    })
  },

  selectNode: (id, multi = false) => {
    const state = get()
    if (multi && id) {
      // 多选模式：添加或移除选中项
      const isSelected = state.selectedNodeIds.includes(id)
      set({
        selectedNodeIds: isSelected
          ? state.selectedNodeIds.filter(nid => nid !== id)
          : [...state.selectedNodeIds, id],
        selectedNodeId: id,
        selectedEdgeId: null,
        selectedEdgeIds: [],
      })
    } else {
      // 单选模式
      set({
        selectedNodeId: id,
        selectedEdgeId: null,
        selectedNodeIds: id ? [id] : [],
        selectedEdgeIds: [],
      })
    }
  },

  selectEdge: (id, multi = false) => {
    const state = get()
    if (multi && id) {
      // 多选模式
      const isSelected = state.selectedEdgeIds.includes(id)
      set({
        selectedEdgeIds: isSelected
          ? state.selectedEdgeIds.filter(eid => eid !== id)
          : [...state.selectedEdgeIds, id],
        selectedEdgeId: id,
        selectedNodeId: null,
        selectedNodeIds: [],
      })
    } else {
      // 单选模式
      set({
        selectedEdgeId: id,
        selectedNodeId: null,
        selectedEdgeIds: id ? [id] : [],
        selectedNodeIds: [],
      })
    }
  },

  selectNodes: (ids) =>
    set({
      selectedNodeIds: ids,
      selectedNodeId: ids.length > 0 ? ids[ids.length - 1] : null,
      selectedEdgeId: null,
      selectedEdgeIds: [],
    }),

  selectEdges: (ids) =>
    set({
      selectedEdgeIds: ids,
      selectedEdgeId: ids.length > 0 ? ids[ids.length - 1] : null,
      selectedNodeId: null,
      selectedNodeIds: [],
    }),

  clearSelection: () =>
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    }),

  setWorkflowInfo: (name, id) =>
    set({ workflowName: name, workflowId: id }),

  reset: () => set({ ...initialState, history: [], historyIndex: -1 }),

  initNewWorkflow: (name, id) => {
    const initialNodes: ReactFlowNode[] = [
      {
        id: generateNodeId('start'),
        type: 'start',
        position: { x: 200, y: 250 },
        data: { label: '开始' },
      },
      {
        id: generateNodeId('end'),
        type: 'end',
        position: { x: 500, y: 250 },
        data: { label: '结束' },
      },
    ]
    set({
      nodes: initialNodes,
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      workflowName: name,
      workflowId: id,
      clipboard: null,
      history: [{ nodes: initialNodes, edges: [] }],
      historyIndex: 0,
    })
  },

  loadWorkflow: (nodes, edges, name, id) =>
    set({
      nodes,
      edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      workflowName: name,
      workflowId: id,
      clipboard: null,
      history: [{ nodes: [...nodes], edges: [...edges] }],
      historyIndex: 0,
    }),

  // 历史操作
  canUndo: () => {
    const state = get()
    return state.historyIndex >= 0
  },

  canRedo: () => {
    const state = get()
    return state.historyIndex < state.history.length - 1
  },

  undo: () => {
    const state = get()
    if (state.historyIndex > 0) {
      const targetIndex = state.historyIndex - 1
      const historyItem = state.history[targetIndex]
      set({
        nodes: [...historyItem.nodes],
        edges: [...historyItem.edges],
        historyIndex: targetIndex,
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
      })
    }
  },

  redo: () => {
    const state = get()
    if (state.historyIndex < state.history.length - 1) {
      const targetIndex = state.historyIndex + 1
      const historyItem = state.history[targetIndex]
      set({
        nodes: [...historyItem.nodes],
        edges: [...historyItem.edges],
        historyIndex: targetIndex,
        selectedNodeId: null,
        selectedEdgeId: null,
      })
    }
  },

  pushHistory: () => {
    const state = get()
    const newHistoryItem: HistoryItem = {
      nodes: [...state.nodes],
      edges: [...state.edges],
    }

    // 截取当前历史位置之后的记录
    const newHistory = state.history.slice(0, state.historyIndex + 1)

    // 添加新的历史记录
    newHistory.push(newHistoryItem)

    // 限制历史记录数量
    if (newHistory.length > state.maxHistorySize) {
      newHistory.shift()
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    })
  },

  clearHistory: () =>
    set({
      history: [],
      historyIndex: -1,
    }),

  // 剪贴板操作
  copyNodes: (ids) => {
    const { nodes, edges } = get()
    const nodesToCopy = nodes.filter(n => ids.includes(n.id))

    // 复制节点间的连线
    const nodeIdSet = new Set(ids)
    const edgesToCopy = edges.filter(e =>
      nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
    )

    set({
      clipboard: {
        nodes: nodesToCopy,
        edges: edgesToCopy,
      }
    })
  },

  pasteNodes: (offset = { x: 20, y: 20 }) => {
    const { clipboard, nodes } = get()
    if (!clipboard || clipboard.nodes.length === 0) return

    get().pushHistory()

    // 生成ID映射
    const idMap: Record<string, string> = {}
    const newNodes = clipboard.nodes.map(node => {
      const newId = generateNodeId(node.type)
      idMap[node.id] = newId
      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
        selected: false,
      }
    })

    // 更新边的source和target
    const newEdges = clipboard.edges.map(edge => ({
      ...edge,
      id: generateEdgeId(),
      source: idMap[edge.source],
      target: idMap[edge.target],
    }))

    set({
      nodes: [...nodes, ...newNodes],
      edges: [...get().edges, ...newEdges],
      selectedNodeIds: newNodes.map(n => n.id),
      selectedNodeId: newNodes[newNodes.length - 1].id,
      selectedEdgeId: null,
      selectedEdgeIds: [],
    })
  },

  hasClipboard: () => {
    const { clipboard } = get()
    return clipboard !== null && clipboard.nodes.length > 0
  },

  // 自动布局算法 - 改进版
  autoLayout: () => {
    const { nodes, edges } = get()
    if (nodes.length === 0) return

    get().pushHistory()

    // 构建图结构
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const outgoingEdges: Record<string, string[]> = {}
    const incomingEdges: Record<string, string[]> = {}

    nodes.forEach(n => {
      outgoingEdges[n.id] = []
      incomingEdges[n.id] = []
    })

    edges.forEach(e => {
      outgoingEdges[e.source].push(e.target)
      incomingEdges[e.target].push(e.source)
    })

    // 1. 确定主路径（从start到end的最长路径）
    const startNode = nodes.find(n => n.type === 'start')
    const endNode = nodes.find(n => n.type === 'end')

    // 计算每个节点的层级（基于主流程）
    const levels: Record<string, number> = {}
    const visited = new Set<string>()

    const assignLevel = (nodeId: string, level: number) => {
      if (visited.has(nodeId)) {
        // 已访问过，取最大层级
        levels[nodeId] = Math.max(levels[nodeId] || 0, level)
        return
      }
      visited.add(nodeId)
      levels[nodeId] = level

      // 获取下游节点并按类型排序（process > decision > others）
      const downstream = outgoingEdges[nodeId] || []
      const sortedDownstream = downstream.sort((a, b) => {
        const nodeA = nodeMap.get(a)
        const nodeB = nodeMap.get(b)
        const priorityA = nodeA?.type === 'process' ? 2 : nodeA?.type === 'decision' ? 1 : 0
        const priorityB = nodeB?.type === 'process' ? 2 : nodeB?.type === 'decision' ? 1 : 0
        return priorityB - priorityA
      })

      // 主流程（第一个下游节点）继续当前层级+1
      // 分支流程（其他节点）如果是decision的子节点，需要特殊处理
      sortedDownstream.forEach((targetId, index) => {
        const sourceNode = nodeMap.get(nodeId)
        const targetNode = nodeMap.get(targetId)

        if (index === 0) {
          // 主流程路径
          assignLevel(targetId, level + 1)
        } else {
          // 分支路径
          if (sourceNode?.type === 'decision') {
            // decision的分支节点与decision同层级（水平排列）
            assignLevel(targetId, level + 1)
          } else {
            assignLevel(targetId, level + 1)
          }
        }
      })
    }

    // 从start节点开始分配层级
    if (startNode) {
      assignLevel(startNode.id, 0)
    } else {
      // 没有start节点，从入度为0的节点开始
      nodes.forEach(n => {
        if ((incomingEdges[n.id] || []).length === 0) {
          assignLevel(n.id, 0)
        }
      })
    }

    // 2. 按层级分组
    const levelNodes: Record<number, string[]> = {}
    nodes.forEach(n => {
      const level = levels[n.id] ?? 0
      if (!levelNodes[level]) levelNodes[level] = []
      levelNodes[level].push(n.id)
    })

    // 3. 计算每个层级的垂直位置
    // 统计每个节点的子树大小，用于分配垂直空间
    const subtreeSize: Record<string, number> = {}
    const calcSubtreeSize = (nodeId: string): number => {
      if (subtreeSize[nodeId] !== undefined) return subtreeSize[nodeId]

      const children = outgoingEdges[nodeId] || []
      if (children.length === 0) {
        subtreeSize[nodeId] = 1
        return 1
      }

      const size = children.reduce((sum, childId) => sum + calcSubtreeSize(childId), 0)
      subtreeSize[nodeId] = size
      return size
    }

    nodes.forEach(n => calcSubtreeSize(n.id))

    // 4. 计算位置
    const HORIZONTAL_GAP = 280  // 增大水平间距
    const VERTICAL_GAP = 120    // 垂直间距
    const START_X = 100
    const START_Y = 100

    // 为每个节点计算Y坐标
    const nodeY: Record<string, number> = {}

    const assignY = (nodeId: string, startY: number): number => {
      if (nodeY[nodeId] !== undefined) return nodeY[nodeId]

      const children = outgoingEdges[nodeId] || []
      const node = nodeMap.get(nodeId)

      if (children.length === 0) {
        nodeY[nodeId] = startY
        return startY + VERTICAL_GAP
      }

      // 对于decision节点，子节点应该在同一水平线上排列
      if (node?.type === 'decision') {
        let currentY = startY
        const centerY = startY + (children.length - 1) * VERTICAL_GAP / 2
        nodeY[nodeId] = centerY

        children.forEach((childId, index) => {
          nodeY[childId] = startY + index * VERTICAL_GAP
        })

        return startY + children.length * VERTICAL_GAP
      } else {
        // 其他节点，子节点垂直堆叠
        let currentY = startY
        nodeY[nodeId] = startY

        children.forEach(childId => {
          currentY = assignY(childId, currentY)
        })

        return currentY
      }
    }

    // 从start节点开始分配Y坐标
    if (startNode) {
      assignY(startNode.id, START_Y)
    } else {
      // 从每个层级的第一个节点开始
      Object.keys(levelNodes).forEach(levelKey => {
        const level = parseInt(levelKey)
        const nodeIds = levelNodes[level]
        if (nodeIds) {
          let currentY = START_Y
          nodeIds.forEach(nodeId => {
            if (nodeY[nodeId] === undefined) {
              currentY = assignY(nodeId, currentY)
            }
          })
        }
      })
    }

    // 5. 收集所有节点位置
    const layoutedNodes = nodes.map(node => {
      const level = levels[node.id] ?? 0

      // 找到该层级所有节点，按Y坐标排序，计算索引
      const nodesInSameLevel = levelNodes[level] || []
      const sortedNodesInLevel = nodesInSameLevel.sort((a, b) => (nodeY[a] || 0) - (nodeY[b] || 0))
      const indexInLevel = sortedNodesInLevel.indexOf(node.id)

      // 如果没有预计算的Y坐标，使用简单的网格布局
      const y = nodeY[node.id] ?? START_Y + indexInLevel * VERTICAL_GAP

      return {
        ...node,
        position: {
          x: START_X + level * HORIZONTAL_GAP,
          y: y
        }
      }
    })

    set({ nodes: layoutedNodes })
  },

  // 连线操作
  setConnectingNode: (id) => set({ connectingNodeId: id }),

  // 悬停操作
  setHoveredNode: (id) => set({ hoveredNodeId: id }),
}))