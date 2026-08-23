import type { FC } from 'react'
import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ReactFlowProvider } from '@xyflow/react'
import { FlowCanvas } from '../flow/FlowCanvas'
import { FlowToolbar } from '../flow/FlowToolbar'
import { PropertiesPanel } from '../flow/PropertiesPanel'
import { NodePanel } from '../flow/NodePanel'
import { useFlowEditorStore } from '../../stores/flowEditorStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useToastStore } from '../../stores/toastStore'

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_WIDTH = 800
const MIN_HEIGHT = 400

const resizeCursors: Record<ResizeDirection, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

// 持久化弹窗布局（位置+尺寸），在关闭↔重新打开时保持用户的调整
let persistedLayout: { pos: { x: number; y: number }; dim: { width: number; height: number } } | null = null

interface WorkflowEditorModalProps {
  isOpen: boolean
  workflowId: string | null
  onClose: () => void
}

export const WorkflowEditorModal: FC<WorkflowEditorModalProps> = ({
  isOpen,
  workflowId,
  onClose,
}) => {
  const [position, setPosition] = useState(() => {
    if (persistedLayout) return persistedLayout.pos
    const w = Math.min(1200, window.innerWidth - 32)
    const h = Math.min(700, window.innerHeight - 32)
    return {
      x: Math.max(16, Math.round((window.innerWidth - w) / 2)),
      y: Math.max(16, Math.round((window.innerHeight - h) / 2)),
    }
  })
  const [dimensions, setDimensions] = useState(() => {
    if (persistedLayout) return persistedLayout.dim
    return {
      width: Math.min(1200, window.innerWidth - 32),
      height: Math.min(700, window.innerHeight - 32),
    }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const dragData = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null)
  const resizeData = useRef<{
    direction: ResizeDirection
    startX: number
    startY: number
    startW: number
    startH: number
    posX: number
    posY: number
  } | null>(null)
  const prevLayout = useRef<{ pos: { x: number; y: number }; dim: { width: number; height: number } } | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const [nodePanelCollapsed, setNodePanelCollapsed] = useState(false)
  const [nodePanelWidth, setNodePanelWidth] = useState(208)

  const {
    initNewWorkflow,
    reset,
    loadWorkflow,
    workflowId: currentId,
    canUndo,
    canRedo,
    undo,
    redo,
    nodes,
    edges,
  } = useFlowEditorStore()
  const { getWorkflowById, saveWorkflowData } = useWorkflowStore()
  const { addToast } = useToastStore()

  const workflow = workflowId ? getWorkflowById(workflowId) : null
  const workflowName = workflow?.name || '未命名工作流'

  // 初始化工作流
  const initializeWorkflow = useCallback(() => {
    if (!workflowId) return

    if (workflowId !== currentId) {
      const wf = getWorkflowById(workflowId)
      // 判断是否为新工作流：检查是否有已保存的节点数据，而不是依赖 ID 格式
      if (wf && wf.nodes && wf.nodes.length > 0) {
        // 有已保存的节点数据，加载它们
        loadWorkflow(wf.nodes, wf.edges, wf.name, workflowId)
      } else {
        // 没有节点数据，初始化新工作流
        reset()
        initNewWorkflow(workflowName, workflowId)
      }
    }
  }, [workflowId, currentId, workflowName, initNewWorkflow, reset, loadWorkflow, getWorkflowById])

  useEffect(() => {
    if (isOpen && workflowId) {
      initializeWorkflow()
    }
  }, [isOpen, workflowId, initializeWorkflow])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo()) undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (canRedo()) redo()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, canUndo, canRedo, undo, redo, onClose])

  // 打开弹窗：继承上次持久化的布局，否则居中初始化
  useLayoutEffect(() => {
    if (isOpen) {
      if (persistedLayout) {
        setDimensions(persistedLayout.dim)
        setPosition(persistedLayout.pos)
      } else {
        const w = Math.min(1200, window.innerWidth - 32)
        const h = Math.min(700, window.innerHeight - 32)
        setDimensions({ width: w, height: h })
        setPosition({
          x: Math.max(16, Math.round((window.innerWidth - w) / 2)),
          y: Math.max(16, Math.round((window.innerHeight - h) / 2)),
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // 持久化当前布局（含全屏状态），供关闭↔重新打开时继承
  useEffect(() => {
    if (isOpen) {
      persistedLayout = { pos: { ...position }, dim: { ...dimensions } }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, dimensions, isOpen])

  // 打开弹窗时锁定 body 滚动（使用 scrollbar-gutter 防止抖动）
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  // 弹窗关闭时清理残留的拖拽/缩放监听器（防止 ESC 关闭时泄漏）
  useEffect(() => {
    if (!isOpen && cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
  }, [isOpen])

  // 拖拽移动：mousedown 头部 → 全局 mousemove 更新位置 → mouseup 结束
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('button, input, textarea, select, [role="button"]')) return
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
      dragData.current = {
        startX: e.clientX,
        startY: e.clientY,
        posX: position.x,
        posY: position.y,
      }
      const prevCursor = document.body.style.cursor
      const prevUserSelect = document.body.style.userSelect
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'

      const handleMove = (ev: MouseEvent) => {
        if (!dragData.current) return
        const newX = dragData.current.posX + (ev.clientX - dragData.current.startX)
        const newY = dragData.current.posY + (ev.clientY - dragData.current.startY)
        setPosition({
          x: Math.max(-dimensions.width + 120, Math.min(window.innerWidth - 80, newX)),
          y: Math.max(40, Math.min(window.innerHeight - 60, newY)),
        })
      }

      const handleUp = () => {
        setIsDragging(false)
        dragData.current = null
        document.body.style.cursor = prevCursor
        document.body.style.userSelect = prevUserSelect
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        cleanupRef.current = null
      }

      cleanupRef.current = handleUp
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [position.x, position.y, dimensions.width],
  )

  // 边缘缩放：mousedown 手柄 → 全局 mousemove 更新尺寸/位置 → mouseup 结束
  const handleResizeStart = useCallback(
    (direction: ResizeDirection) => (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizeData.current = {
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startW: dimensions.width,
        startH: dimensions.height,
        posX: position.x,
        posY: position.y,
      }
      const prevCursor = document.body.style.cursor
      const prevUserSelect = document.body.style.userSelect
      document.body.style.cursor = resizeCursors[direction]
      document.body.style.userSelect = 'none'

      const handleMove = (ev: MouseEvent) => {
        if (!resizeData.current) return
        const d = resizeData.current
        const deltaX = ev.clientX - d.startX
        const deltaY = ev.clientY - d.startY
        const maxW = window.innerWidth - 32
        const maxH = window.innerHeight - 32
        let newW = d.startW
        let newH = d.startH
        let newX = d.posX
        let newY = d.posY

        if (d.direction.includes('e')) {
          newW = Math.min(maxW, Math.max(MIN_WIDTH, d.startW + deltaX))
        }
        if (d.direction.includes('w')) {
          newW = Math.min(maxW, Math.max(MIN_WIDTH, d.startW - deltaX))
          newX = d.posX + (d.startW - newW)
        }
        if (d.direction.includes('s')) {
          newH = Math.min(window.innerHeight - d.posY - 16, Math.max(MIN_HEIGHT, d.startH + deltaY))
        }
        if (d.direction.includes('n')) {
          newH = Math.min(maxH, Math.max(MIN_HEIGHT, d.startH - deltaY))
          newY = d.posY + (d.startH - newH)
          if (newY < 40) {
            newH = d.posY + d.startH - 40
            newY = 40
          }
        }

        setDimensions({ width: newW, height: newH })
        setPosition({ x: newX, y: newY })
      }

      const handleUp = () => {
        resizeData.current = null
        document.body.style.cursor = prevCursor
        document.body.style.userSelect = prevUserSelect
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
        cleanupRef.current = null
      }

      cleanupRef.current = handleUp
      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
    },
    [dimensions.width, dimensions.height, position.x, position.y],
  )

  // 双击头部全屏/恢复
  const handleDoubleClick = useCallback(() => {
    if (isMaximized) {
      if (prevLayout.current) {
        setPosition(prevLayout.current.pos)
        setDimensions(prevLayout.current.dim)
      }
      setIsMaximized(false)
    } else {
      prevLayout.current = { pos: { ...position }, dim: { ...dimensions } }
      const margin = 32
      setPosition({ x: Math.round(margin / 2), y: 40 })
      setDimensions({
        width: window.innerWidth - margin,
        height: window.innerHeight - 56,
      })
      setIsMaximized(true)
    }
  }, [isMaximized, position, dimensions])

  const handleSave = async () => {
    if (!workflowId) {
      addToast('没有工作流ID，无法保存', 'error')
      return
    }

    const loadingToastId = addToast('正在保存...', 'info', 0)
    const success = await saveWorkflowData(workflowId, nodes, edges)
    useToastStore.getState().removeToast(loadingToastId)

    if (success) {
      addToast('保存成功', 'success')
    } else {
      addToast('保存失败，请重试', 'error')
    }
  }

  const toggleNodePanel = () => {
    setNodePanelCollapsed(!nodePanelCollapsed)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[50]"
            onClick={onClose}
          />

          {/* 弹窗容器 */}
          <div className="fixed inset-0 z-[50] pointer-events-none">
            {/* 弹窗内容 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                width: dimensions.width,
                height: dimensions.height,
              }}
              className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 工具栏 — 拖拽移动区域 */}
              <div
                onMouseDown={handleDragStart}
                onDoubleClick={handleDoubleClick}
                className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
              >
                <FlowToolbar
                  onBack={onClose}
                  onSave={handleSave}
                  onClose={onClose}
                  workflowId={workflowId}
                />
              </div>

              {/* 主内容 */}
              <div className="flex-1 flex overflow-hidden">
                {/* 画布区域 */}
                <div className="flex-1 relative bg-gray-50 overflow-hidden">
                  {/* 左侧节点面板 - 浮动 */}
                  <NodePanel
                    collapsed={nodePanelCollapsed}
                    onToggleCollapse={toggleNodePanel}
                    width={nodePanelWidth}
                    onWidthChange={setNodePanelWidth}
                  />

                  <ReactFlowProvider>
                    <FlowCanvas />
                  </ReactFlowProvider>

                  {/* 浮动属性面板 */}
                  <PropertiesPanel />
                </div>
              </div>

              {/* 缩放手柄 — 四边 */}
              <div
                onMouseDown={handleResizeStart('n')}
                className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-20"
              />
              <div
                onMouseDown={handleResizeStart('s')}
                className="absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize z-20"
              />
              <div
                onMouseDown={handleResizeStart('w')}
                className="absolute left-0 top-3 bottom-3 w-1.5 cursor-ew-resize z-20"
              />
              <div
                onMouseDown={handleResizeStart('e')}
                className="absolute right-0 top-3 bottom-3 w-1.5 cursor-ew-resize z-20"
              />

              {/* 缩放手柄 — 四角 */}
              <div
                onMouseDown={handleResizeStart('nw')}
                className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-30"
              />
              <div
                onMouseDown={handleResizeStart('ne')}
                className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-30"
              />
              <div
                onMouseDown={handleResizeStart('sw')}
                className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-30"
              />
              <div
                onMouseDown={handleResizeStart('se')}
                className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-30"
              />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}