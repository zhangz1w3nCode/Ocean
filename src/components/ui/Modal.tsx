import type { FC, ReactNode } from 'react'
import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  headerLeft?: ReactNode
  layoutKey?: string
  persistLayout?: boolean
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_WIDTH = 360
const MIN_HEIGHT = 280

const sizeWidths: Record<NonNullable<ModalProps['size']>, number> = {
  sm: 384,
  md: 448,
  lg: 512,
  xl: 672,
}

const sizeHeights: Record<NonNullable<ModalProps['size']>, number> = {
  sm: 280,
  md: 400,
  lg: 500,
  xl: 600,
}

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

// 持久化弹窗布局（按 key 隔离，预览↔编辑切换时保持用户的调整，不同弹窗互不影响）
const persistedLayoutMap = new Map<string, { pos: { x: number; y: number }; dim: { width: number; height: number } }>()

// 导出 get/set 供其他组件（如 WorkflowEditorModal）共享同一 Map
export const getLayout = (key: string) => persistedLayoutMap.get(key) ?? null
export const setLayout = (key: string, layout: { pos: { x: number; y: number }; dim: { width: number; height: number } }) => {
  // 限制 Map 大小防止无限增长（超过 30 条时清除最旧条目）
  if (persistedLayoutMap.size >= 30) {
    const firstKey = persistedLayoutMap.keys().next().value
    if (firstKey) persistedLayoutMap.delete(firstKey)
  }
  persistedLayoutMap.set(key, layout)
}

export const Modal: FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  headerLeft,
  layoutKey,
  persistLayout = true,
}) => {
  const _layoutKey = layoutKey || title
  const shouldPersist = persistLayout !== false
  const [position, setPosition] = useState(() => {
    const pl = shouldPersist ? persistedLayoutMap.get(_layoutKey) : undefined
    if (pl) return pl.pos
    const w = shouldPersist
      ? Math.min(sizeWidths[size], window.innerWidth - 32)
      : Math.max(360, Math.min(500, Math.round(window.innerWidth * 0.35)))
    const h = shouldPersist
      ? Math.min(sizeHeights[size], Math.round(window.innerHeight * 0.7))
      : Math.max(250, Math.min(400, Math.round(window.innerHeight * 0.32)))
    return {
      x: Math.max(16, Math.round((window.innerWidth - w) / 2)),
      y: Math.max(16, Math.round((window.innerHeight - h) / 2)),
    }
  })
  const [dimensions, setDimensions] = useState(() => {
    const pl = shouldPersist ? persistedLayoutMap.get(_layoutKey) : undefined
    if (pl) return pl.dim
    return {
      width: shouldPersist
        ? Math.min(sizeWidths[size], window.innerWidth - 32)
        : Math.max(360, Math.min(500, Math.round(window.innerWidth * 0.35))),
      height: shouldPersist
        ? Math.min(sizeHeights[size], Math.round(window.innerHeight * 0.7))
        : Math.max(250, Math.min(400, Math.round(window.innerHeight * 0.32))),
    }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
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

  // 监听 ESC 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      }
    }

    if (isOpen) {
      // 使用 capture 阶段，确保先于其他监听器执行
      document.addEventListener('keydown', handleKeyDown, true)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isOpen, onClose])

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

  // 打开弹窗：继承上次持久化的布局（预览↔编辑切换时保持位置与缩放），否则居中
  useLayoutEffect(() => {
    if (isOpen) {
      const pl = shouldPersist ? persistedLayoutMap.get(_layoutKey) : undefined
      if (pl) {
        setDimensions(pl.dim)
        setPosition(pl.pos)
      } else {
        const w = shouldPersist
          ? Math.min(sizeWidths[size], window.innerWidth - 32)
          : Math.max(360, Math.min(500, Math.round(window.innerWidth * 0.35)))
        const h = shouldPersist
          ? Math.min(sizeHeights[size], Math.round(window.innerHeight * 0.7))
          : Math.max(250, Math.min(400, Math.round(window.innerHeight * 0.32)))
        setDimensions({ width: w, height: h })
        setPosition({
          x: Math.max(16, Math.round((window.innerWidth - w) / 2)),
          y: Math.max(16, Math.round((window.innerHeight - h) / 2)),
        })
      }
    }
  }, [isOpen, shouldPersist, _layoutKey, size])

  // 持久化当前布局（含全屏状态），供预览↔编辑切换时继承
  useEffect(() => {
    if (isOpen && shouldPersist) {
      persistedLayoutMap.set(_layoutKey, { pos: { ...position }, dim: { ...dimensions } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, dimensions, isOpen, isMaximized])

  // 拖拽移动：mousedown 头部 → 全局 mousemove 更新位置 → mouseup 结束
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
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
      setIsResizing(true)
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
        setIsResizing(false)
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* 弹窗内容 */}
          <div className={`fixed inset-0 z-50 pointer-events-none ${shouldPersist ? '' : 'flex items-center justify-center'}`}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={{
                ...(shouldPersist
                  ? { position: 'absolute', left: position.x, top: position.y, width: dimensions.width, height: dimensions.height }
                  : { maxWidth: '600px', maxHeight: '350px' }
                ),
              }}
              className="bg-white rounded-2xl shadow-xl pointer-events-auto overflow-hidden flex flex-col select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 — 拖拽移动区域 */}
              <div
                onMouseDown={handleDragStart}
                onDoubleClick={handleDoubleClick}
                className={`px-6 py-4 flex items-center justify-between flex-shrink-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                <div className="flex items-center gap-3 pointer-events-none">
                  {headerLeft}
                  <h3 className="text-lg font-semibold text-macos-text">{title}</h3>
                </div>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-macos-text-secondary transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 内容 */}
              <div className="px-6 py-5 flex-1 min-h-0 flex flex-col overflow-hidden select-text">
                {children}
              </div>

              {/* 底部 */}
              {footer && (
                <div className="px-6 py-4 bg-gray-50/50 flex-shrink-0">
                  {footer}
                </div>
              )}

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