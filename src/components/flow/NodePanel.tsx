import type { FC } from 'react'
import { useState, useMemo, useRef, useCallback } from 'react'
import {
  Hexagon,
  Play,
  Square,
  GitBranch,
  Workflow,
  Search,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  GripVertical,
} from 'lucide-react'
import { useNodeStore } from '../../stores/nodeStore'
import type { NodeDefinition } from '../../types'

// 节点类型定义
export interface NodeTemplate {
  type: string
  label: string
  category: 'basic' | 'business' | 'process' | 'decision' | 'start' | 'end' | 'local'
  icon: React.ReactNode
  color: string
  description?: string
  nodeDefId?: string  // 节点定义ID（业务节点才有）
}

interface NodePanelProps {
  onDragStart?: (template: NodeTemplate) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  width?: number
  onWidthChange?: (width: number) => void
}

// 节点类型颜色映射
const nodeTypeColors: Record<string, string> = {
  start: '#34C759',
  end: '#FF3B30',
  process: '#007AFF',
  decision: '#FF9500',
  business: '#5856D6',
  local: '#8E8E93',  // 局部节点使用灰色
}

// 系统默认节点
const defaultNodes: NodeTemplate[] = [
  {
    type: 'start',
    label: '开始',
    category: 'start',
    icon: <Play size={16} />,
    color: '#34C759',
    description: '流程开始点',
  },
  {
    type: 'end',
    label: '结束',
    category: 'end',
    icon: <Square size={16} />,
    color: '#FF3B30',
    description: '流程结束点',
  },
  {
    type: 'process',
    label: '处理节点',
    category: 'process',
    icon: <Hexagon size={16} />,
    color: '#007AFF',
    description: '执行处理任务',
  },
  {
    type: 'decision',
    label: '分支节点',
    category: 'decision',
    icon: <GitBranch size={16} />,
    color: '#FF9500',
    description: '条件分支判断',
  },
]

// 局部节点模板
const localNodeTemplate: NodeTemplate = {
  type: 'local',
  label: '局部节点',
  category: 'local',
  icon: <Hexagon size={16} />,
  color: '#8E8E93',
  description: '局部节点，保存为独立文件',
}

// 节点分类组件
interface NodeCategoryProps {
  title: string
  nodes: NodeTemplate[]
  searchTerm: string
  onDragStart: (e: React.DragEvent, template: NodeTemplate) => void
}

const NodeCategory: FC<NodeCategoryProps> = ({ title, nodes, searchTerm, onDragStart }) => {
  const [expanded, setExpanded] = useState(true)

  const filteredNodes = nodes.filter((n) =>
    n.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (filteredNodes.length === 0) return null

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50"
      >
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {title}
        </span>
        {expanded ? (
          <ChevronDown size={14} className="text-gray-400" />
        ) : (
          <ChevronRight size={14} className="text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-2 space-y-1">
          {filteredNodes.map((node, index) => (
            <div
              key={`${node.type}-${index}`}
              draggable
              onDragStart={(e) => onDragStart(e, node)}
              className="px-3 py-2 flex items-center gap-3 rounded-lg cursor-move
                       hover:bg-gray-50 border border-transparent hover:border-gray-200
                       transition-all group"
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${node.color}15`, color: node.color }}
              >
                {node.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 whitespace-normal break-words">{node.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 从 NodeDefinition 转换为 NodeTemplate
const convertToTemplate = (node: NodeDefinition): NodeTemplate => ({
  type: node.type,
  label: node.name,
  category: node.type,
  icon: <Hexagon size={16} />,
  color: nodeTypeColors[node.type] || '#007AFF',
  description: node.description || '',
  nodeDefId: node.id,  // 传递节点定义ID
})

export const NodePanel: FC<NodePanelProps> = ({
  onDragStart,
  collapsed = false,
  onToggleCollapse,
  width = 208,
  onWidthChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<HTMLDivElement>(null)

  // 处理调整大小
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)

    const startX = e.clientX
    const startWidth = width

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      const newWidth = Math.min(384, Math.max(128, startWidth + delta))
      onWidthChange?.(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width, onWidthChange])

  // 从 store 获取用户定义的节点
  const { nodeDefinitions } = useNodeStore()

  // 合并系统默认节点和用户定义的节点
  const allNodes = useMemo(() => {
    // 用户定义的业务节点
    const userNodes = nodeDefinitions.map(convertToTemplate)

    // 过滤掉用户定义的系统节点类型（开始、结束、处理、判断），只保留业务节点
    const businessNodes = userNodes.filter(n => n.category === 'business')

    // 合并系统默认节点和用户业务节点
    return [...defaultNodes, ...businessNodes]
  }, [nodeDefinitions])

  // 按类型分组
  const { commonNodes, businessNodesList, localNodesList } = useMemo(() => {
    const common: NodeTemplate[] = []
    const business: NodeTemplate[] = []
    const local: NodeTemplate[] = []

    allNodes.forEach((node) => {
      if (node.category === 'business') {
        business.push(node)
      } else if (node.category === 'process') {
        // 处理节点归入局部节点分类
        local.push(node)
      } else {
        // 开始、结束、判断归入通用节点
        common.push(node)
      }
    })

    // 添加局部节点模板
    local.push(localNodeTemplate)

    return {
      commonNodes: common,
      businessNodesList: business,
      localNodesList: local,
    }
  }, [allNodes])

  const handleDragStart = (e: React.DragEvent, template: NodeTemplate) => {
    // 只传递可序列化的字段，避免 React 元素导致的循环引用
    const dragData = {
      type: template.type,
      label: template.label,
      nodeDefId: template.nodeDefId || template.type,  // 系统节点用 type 作为 id
      isUserNode: !!template.nodeDefId,
    }
    e.dataTransfer.setData('application/reactflow', JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.(template)
  }

  // 折叠状态
  if (collapsed) {
    return (
      <div className="absolute left-4 top-4 z-10">
        <button
          onClick={onToggleCollapse}
          className="w-10 h-10 bg-white rounded-lg border border-gray-200 shadow-md
                     flex items-center justify-center
                     hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
          title="展开节点库"
        >
          <PanelLeft size={16} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="absolute left-4 top-4 bottom-4 z-10"
      style={{ width: `${width}px` }}
    >
      <div className="h-full bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col overflow-hidden relative">
        {/* 调整宽度手柄 */}
        <div
          ref={resizeRef}
          onMouseDown={handleMouseDown}
          className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize group z-10
            ${isResizing ? 'bg-gray-400' : 'hover:bg-gray-300 bg-transparent'}`}
          title="拖拽调整宽度"
        >
          {/* 手柄指示器 - 始终显示 */}
          <div className={`absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 transition-opacity
            ${isResizing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <div className="flex flex-col gap-0.5">
              <GripVertical size={10} className="text-gray-400" />
              <GripVertical size={10} className="text-gray-400" />
            </div>
          </div>
        </div>
        {/* 头部 */}
        <div className="px-3 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow size={16} className="text-gray-500" />
            <h3 className="font-medium text-sm text-gray-700">节点库</h3>
          </div>
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="收起"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* 搜索 */}
        <div className="px-3 pb-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg
                         focus:outline-none focus:border-gray-400
                         placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* 节点列表 */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* 通用节点 */}
          {commonNodes.length > 0 && (
            <NodeCategory
              title="通用节点"
              nodes={commonNodes}
              searchTerm={searchTerm}
              onDragStart={handleDragStart}
            />
          )}

          {/* 全局节点 */}
          {businessNodesList.length > 0 && (
            <NodeCategory
              title="全局节点"
              nodes={businessNodesList}
              searchTerm={searchTerm}
              onDragStart={handleDragStart}
            />
          )}

          {/* 局部节点 */}
          {localNodesList.length > 0 && (
            <NodeCategory
              title="局部节点"
              nodes={localNodesList}
              searchTerm={searchTerm}
              onDragStart={handleDragStart}
            />
          )}
        </div>
      </div>
    </div>
  )
}