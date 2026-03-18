import type { FC } from 'react'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useEdgesState,
  addEdge,
  ConnectionMode,
  type Connection,
  BackgroundVariant,
  useReactFlow,
  type Node,
  type Edge,
  MarkerType,
  type OnConnectStartParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useFlowEditorStore } from '../../stores/flowEditorStore'
import { useNodeStore } from '../../stores/nodeStore'
import type { ReactFlowNode } from '../../types/flow'
import {
  StartNode,
  EndNode,
  ProcessNode,
  DecisionNode,
  BusinessNode,
  LocalNode,
} from './nodes'
import { ContextMenu, type ContextMenuType } from './ContextMenu'

// 节点类型映射
const nodeTypes = {
  start: StartNode,
  end: EndNode,
  process: ProcessNode,
  decision: DecisionNode,
  business: BusinessNode,
  local: LocalNode,
}

// 默认边配置 - 带箭头
const defaultEdgeOptions = {
  type: 'default', // 平滑贝塞尔曲线
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

// 节点默认标签
const nodeTypeLabels: Record<string, string> = {
  start: '开始',
  process: '处理数据',
  decision: '判断条件',
  business: '业务处理',
  end: '结束',
}

export const FlowCanvas: FC = () => {
  const {
    nodes: initialNodes,
    edges: initialEdges,
    setNodes: setStoreNodes,
    setEdges: setStoreEdges,
    addNode,
    deleteNode,
    deleteEdge,
    selectNode,
    selectEdge,
    selectEdges,
    selectedNodeIds,
    selectedEdgeIds,
    deleteSelectedNodes,
    copyNodes,
    pasteNodes,
    hasClipboard,
    pushHistory,
    setConnectingNode,
    setHoveredNode,
  } = useFlowEditorStore()

  const { nodeDefinitions } = useNodeStore()

  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const { screenToFlowPosition } = useReactFlow()

  // 使用store中的nodes，并监听变化
  const nodes = initialNodes

  // 同步 store 中的 edges 到本地状态
  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  // 根据选中状态动态计算边的样式
  const edgesWithStyle = useMemo(() => {
    return edges.map((edge) => {
      const isSelected = selectedEdgeIds.includes(edge.id)
      return {
        ...edge,
        style: isSelected
          ? { strokeWidth: 2, stroke: '#3B82F6', strokeDasharray: '5 5' }
          : { strokeWidth: 2, stroke: '#9CA3AF' },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: isSelected ? '#3B82F6' : '#9CA3AF',
        },
      }
    })
  }, [edges, selectedEdgeIds])

  // 键盘快捷键处理
  useEffect(() => {
    // 检测是否在输入框中
    const isInputFocused = () => {
      const target = document.activeElement as HTMLElement
      return target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + C: 复制（仅在非输入框时复制节点）
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedNodeIds.length > 0) {
        if (!isInputFocused()) {
          e.preventDefault()
          copyNodes(selectedNodeIds)
        }
        // 如果在输入框中，使用浏览器默认复制行为
      }
      // Ctrl/Cmd + V: 粘贴（仅在非输入框时粘贴节点）
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && hasClipboard()) {
        if (!isInputFocused()) {
          e.preventDefault()
          pasteNodes()
        }
        // 如果在输入框中，使用浏览器默认粘贴行为
      }
      // Delete/Backspace: 删除选中的节点或边
      // 如果焦点在输入框/文本框中，则跳过删除逻辑（避免误删）
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInputFocused()) {
          if (selectedNodeIds.length > 0) {
            e.preventDefault()
            deleteSelectedNodes()
          } else if (selectedEdgeIds.length > 0) {
            e.preventDefault()
            selectedEdgeIds.forEach(id => deleteEdge(id))
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeIds, selectedEdgeIds, copyNodes, pasteNodes, hasClipboard, deleteSelectedNodes, deleteEdge])

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean
    type: ContextMenuType
    position: { x: number; y: number }
    node?: Node
    edge?: Edge
  }>({
    visible: false,
    type: 'canvas',
    position: { x: 0, y: 0 },
  })

  // 连接节点
  const onConnect = (connection: Connection) => {
    // 检测源节点类型
    const sourceNode = nodes.find(n => n.id === connection.source)

    let newEdge: any = {
      ...connection,
      id: `e-${Date.now()}`,
      type: 'default',
    }

    // 如果源节点是 decision，保存分支 ID 和描述（但不显示在连线上）
    if (sourceNode?.type === 'decision') {
      const branches = sourceNode.data.branches || []
      const handleId = connection.sourceHandle

      // 根据 handleId 查找对应的分支
      if (handleId) {
        const branch = branches.find(b => b.id === handleId)
        if (branch) {
          newEdge.branchId = branch.id
          newEdge.branchDescription = branch.description
        }
      }
    }

    pushHistory()
    const newEdges = addEdge(newEdge, edges)
    setEdges(newEdges)
    setStoreEdges(newEdges)
    // 连接完成后清除连线状态
    setConnectingNode(null)
  }

  // 连线开始
  const onConnectStart = useCallback(
    (_: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      setConnectingNode(params.nodeId)
    },
    [setConnectingNode]
  )

  // 连线结束（无论是否成功连接）
  const onConnectEnd = useCallback(() => {
    setConnectingNode(null)
  }, [setConnectingNode])

  // 连接线样式 - 动态虚线
  const connectionLineStyle = {
    strokeWidth: 2,
    stroke: '#3B82F6',
    strokeDasharray: '5 5',
    animation: 'dash 0.5s linear infinite',
  }

  // 节点变化同步到store
  const handleNodesChange = (changes: any) => {
    // 处理位置变化
    const positionChanges = changes.filter((c: any) => c.type === 'position')
    if (positionChanges.length > 0) {
      // 检测拖拽结束
      const lastChange = positionChanges[positionChanges.length - 1]
      if (lastChange.dragging === false) {
        pushHistory()
      }

      // 更新位置
      setStoreNodes((currentNodes) =>
        currentNodes.map((node) => {
          const change = positionChanges.find((c: any) => c.id === node.id)
          if (change && change.position) {
            return { ...node, position: change.position }
          }
          return node
        })
      )
    }
  }

  // 边变化同步到store
  const handleEdgesChange = (changes: any) => {
    // 处理选择变化
    const selectionChanges = changes.filter((c: any) => c.type === 'select')
    if (selectionChanges.length > 0) {
      const selectedIds = selectionChanges
        .filter((c: any) => c.selected)
        .map((c: any) => c.id)
      selectEdges(selectedIds)
    }

    onEdgesChange(changes)
    setStoreEdges(edges)
  }

  // 点击空白处取消选择并关闭菜单
  const onPaneClick = () => {
    selectNode(null)
    selectEdge(null)
    setContextMenu((prev) => ({ ...prev, visible: false }))

    // 清除所有节点的 selected 属性
    setStoreNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, selected: false }))
    )
  }

  // 拖动状态跟踪
  const dragHappenedRef = useRef(false)

  // 节点开始拖动
  const onNodeDragStart = useCallback(() => {
    dragHappenedRef.current = true
  }, [])

  // 节点鼠标进入 - 精确到节点任何位置
  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNode(node.id)
  }, [setHoveredNode])

  // 节点鼠标离开
  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null)
  }, [setHoveredNode])

  // 节点拖动结束
  const onNodeDragStop = useCallback(() => {
    // 重置标记，但稍后执行，让 onNodeClick 先完成检查
    setTimeout(() => {
      dragHappenedRef.current = false
    }, 100)
  }, [])

  // 点击节点
  const onNodeClick = (event: React.MouseEvent, node: any) => {
    // 如果刚刚发生了拖动，不选中节点
    if (dragHappenedRef.current) {
      return
    }

    // 支持 Ctrl/Cmd + 点击多选
    const isMultiSelect = event.ctrlKey || event.metaKey
    selectNode(node.id, isMultiSelect)

    // 手动更新节点的 selected 属性
    setStoreNodes((currentNodes) =>
      currentNodes.map((n) => ({
        ...n,
        selected: isMultiSelect
          ? (n.selected || n.id === node.id)
          : n.id === node.id,
      }))
    )

    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  // 点击边
  const onEdgeClick = (event: React.MouseEvent, edge: any) => {
    // 支持 Ctrl/Cmd + 点击多选
    const isMultiSelect = event.ctrlKey || event.metaKey
    selectEdge(edge.id, isMultiSelect)
    setContextMenu((prev) => ({ ...prev, visible: false }))
  }

  // 双击边编辑标签
  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const newLabel = window.prompt('输入连线标签:', (edge.label as string) || '')
      if (newLabel !== null) {
        pushHistory()
        setEdges((edges) =>
          edges.map((e) =>
            e.id === edge.id ? { ...e, label: newLabel } : e
          )
        )
        setStoreEdges(
          edges.map((e) =>
            e.id === edge.id ? { ...e, label: newLabel } : e
          )
        )
      }
    },
    [edges, setEdges, setStoreEdges, pushHistory]
  )

  // 画布右键
  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault()
      setContextMenu({
        visible: true,
        type: 'canvas',
        position: { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY },
      })
    },
    []
  )

  // 节点右键
  const onNodeContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, node: Node) => {
      event.preventDefault()
      event.stopPropagation()
      selectNode(node.id)
      setContextMenu({
        visible: true,
        type: 'node',
        position: { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY },
        node,
      })
    },
    [selectNode]
  )

  // 边右键
  const onEdgeContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      event.stopPropagation()
      selectEdge(edge.id)
      setContextMenu({
        visible: true,
        type: 'edge',
        position: { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY },
        edge,
      })
    },
    [selectEdge]
  )

  // 添加节点
  const handleAddNode = useCallback(
    (type: string, screenPosition: { x: number; y: number }) => {
      // 将屏幕坐标转换为画布坐标
      const flowPosition = screenToFlowPosition({
        x: screenPosition.x,
        y: screenPosition.y,
      })

      const newNode: ReactFlowNode = {
        id: `${type}-${Date.now()}`,
        type: type as ReactFlowNode['type'],
        position: flowPosition,
        data: { label: nodeTypeLabels[type] || '新节点' },
      }

      addNode(newNode)
      selectNode(newNode.id)
    },
    [addNode, selectNode, screenToFlowPosition]
  )

  // 编辑节点
  const handleEditNode = useCallback(
    (nodeId: string) => {
      // TODO: 打开编辑弹窗
      console.log('编辑节点:', nodeId)
    },
    []
  )

  // 复制节点
  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const nodeToCopy = nodes.find((n) => n.id === nodeId)
      if (nodeToCopy) {
        const newNode: ReactFlowNode = {
          ...nodeToCopy,
          id: `${nodeToCopy.type}-${Date.now()}`,
          position: {
            x: nodeToCopy.position.x + 20,
            y: nodeToCopy.position.y + 20,
          },
          selected: false,
        }
        addNode(newNode)
        selectNode(newNode.id)
      }
    },
    [nodes, addNode, selectNode]
  )

  // 删除节点
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId)
    },
    [deleteNode]
  )

  // 删除边
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      deleteEdge(edgeId)
    },
    [deleteEdge]
  )

  // 撤销
  const handleUndo = useCallback(() => {
    const { canUndo, undo } = useFlowEditorStore.getState()
    if (canUndo()) {
      undo()
    }
  }, [])

  // 重做
  const handleRedo = useCallback(() => {
    const { canRedo, redo } = useFlowEditorStore.getState()
    if (canRedo()) {
      redo()
    }
  }, [])

  // 拖拽经过
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  // 拖放置入
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const data = event.dataTransfer.getData('application/reactflow')
      if (!data) return

      try {
        const template = JSON.parse(data)
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })

        // 查找节点定义
        const nodeDefinition = nodeDefinitions.find(def => def.id === template.nodeDefId)

        const newNode: ReactFlowNode = {
          id: `${template.type}-${Date.now()}`,
          type: template.type,
          position,
          data: {
            label: template.label,
            nodeDefId: template.nodeDefId,
            nodeDefName: nodeDefinition?.name,
            // 复制定义信息（简化版：只保留 content）
            content: nodeDefinition?.content,
            description: nodeDefinition?.description,
            // 局部节点标记
            isLocal: template.type === 'local',
            localNodeName: template.type === 'local' ? template.label : undefined,
          },
        }

        addNode(newNode)
        selectNode(newNode.id)
      } catch {
        // 忽略解析错误
      }
    },
    [addNode, selectNode, screenToFlowPosition, nodeDefinitions]
  )

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edgesWithStyle}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        connectionLineStyle={connectionLineStyle}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Strict}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        panOnScroll
        panOnScrollMode={undefined}
        selectionOnDrag
        multiSelectionKeyCode="Control"
        selectionKeyCode="Shift"
        snapToGrid
        snapGrid={[20, 20]}
        proOptions={{ hideAttribution: true }}
      >
        {/* 背景网格 */}
        <Background
          color="#E5E5E5"
          gap={20}
          size={1}
          variant={BackgroundVariant.Dots}
        />

        {/* 控制面板 */}
        <Controls className="!bg-white !border !border-gray-200 !shadow-md" />
      </ReactFlow>

      {/* 右键菜单 */}
      {contextMenu.visible && (
        <ContextMenu
          type={contextMenu.type}
          position={contextMenu.position}
          node={contextMenu.node}
          edge={contextMenu.edge}
          onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
          onAddNode={handleAddNode}
          onEditNode={handleEditNode}
          onCopyNode={handleCopyNode}
          onDeleteNode={handleDeleteNode}
          onDeleteEdge={handleDeleteEdge}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      )}
    </div>
  )
}