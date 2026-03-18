import type { FC } from 'react'
import { useEffect, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import {
  Plus,
  Copy,
  Trash2,
  Pencil,
  Undo2,
  Redo2,
} from 'lucide-react'

export type ContextMenuType = 'canvas' | 'node' | 'edge'

interface ContextMenuItem {
  icon?: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  type: ContextMenuType
  position: { x: number; y: number }
  node?: Node
  edge?: Edge
  onClose: () => void
  onAddNode?: (type: string, position: { x: number; y: number }) => void
  onEditNode?: (nodeId: string) => void
  onDeleteNode?: (nodeId: string) => void
  onCopyNode?: (nodeId: string) => void
  onDeleteEdge?: (edgeId: string) => void
  onUndo?: () => void
  onRedo?: () => void
}

export const ContextMenu: FC<ContextMenuProps> = ({
  type,
  position,
  node,
  edge,
  onClose,
  onAddNode,
  onEditNode,
  onDeleteNode,
  onCopyNode,
  onDeleteEdge,
  onUndo,
  onRedo,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // 键盘 ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 画布菜单项
  const canvasItems: ContextMenuItem[] = [
    {
      icon: <Plus size={14} />,
      label: '添加开始节点',
      onClick: () => {
        onAddNode?.('start', position)
        onClose()
      },
    },
    {
      icon: <Plus size={14} />,
      label: '添加处理节点',
      onClick: () => {
        onAddNode?.('process', position)
        onClose()
      },
    },
    {
      icon: <Plus size={14} />,
      label: '添加分支节点',
      onClick: () => {
        onAddNode?.('decision', position)
        onClose()
      },
    },
    { divider: true, label: '', onClick: () => {} },
    {
      icon: <Undo2 size={14} />,
      label: '撤销',
      onClick: () => {
        onUndo?.()
        onClose()
      },
    },
    {
      icon: <Redo2 size={14} />,
      label: '重做',
      onClick: () => {
        onRedo?.()
        onClose()
      },
    },
  ]

  // 节点菜单项
  const nodeItems: ContextMenuItem[] = [
    {
      icon: <Pencil size={14} />,
      label: '编辑节点',
      onClick: () => {
        if (node) onEditNode?.(node.id)
        onClose()
      },
    },
    {
      icon: <Copy size={14} />,
      label: '复制节点',
      onClick: () => {
        if (node) onCopyNode?.(node.id)
        onClose()
      },
    },
    { divider: true, label: '', onClick: () => {} },
    {
      icon: <Trash2 size={14} />,
      label: '删除节点',
      onClick: () => {
        if (node) onDeleteNode?.(node.id)
        onClose()
      },
    },
  ]

  // 连线菜单项
  const edgeItems: ContextMenuItem[] = [
    {
      icon: <Trash2 size={14} />,
      label: '删除连线',
      onClick: () => {
        if (edge) onDeleteEdge?.(edge.id)
        onClose()
      },
    },
  ]

  const items = type === 'canvas' ? canvasItems : type === 'node' ? nodeItems : edgeItems

  // 计算菜单位置，防止超出屏幕
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 200),
    top: Math.min(position.y, window.innerHeight - 200),
    zIndex: 1000,
  }

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="py-1 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[160px]"
    >
      {items.map((item, index) =>
        item.divider ? (
          <div key={index} className="my-1 border-t border-gray-100" />
        ) : (
          <button
            key={index}
            onClick={item.onClick}
            disabled={item.disabled}
            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-50 text-left
                       text-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {item.icon && <span className="text-gray-500">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}
