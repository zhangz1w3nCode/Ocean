import type { FC } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Hexagon } from 'lucide-react'
import { useFlowEditorStore } from '../../../stores/flowEditorStore'

interface LocalNodeProps {
  data: {
    label: string
    description?: string
    isLocal?: boolean
    localNodeName?: string
  }
  selected?: boolean
  id?: string
}

export const LocalNode: FC<LocalNodeProps> = ({ data, selected, id }) => {
  const connectingNodeId = useFlowEditorStore((state) => state.connectingNodeId)
  const hoveredNodeId = useFlowEditorStore((state) => state.hoveredNodeId)
  const isConnecting = connectingNodeId === id
  const isHovered = hoveredNodeId === id

  return (
    <div
      className={`
        min-w-[140px] px-4 py-3 rounded-xl
        bg-white border-2 shadow-lg transition-all duration-200 pointer-events-auto
        ${selected ? 'border-gray-500 ring-4 ring-gray-100' : ''}
        ${isConnecting ? 'border-blue-400 ring-4 ring-blue-100' : ''}
        ${isHovered && !selected && !isConnecting ? 'border-gray-400 shadow-xl scale-[1.02]' : ''}
        ${!selected && !isConnecting && !isHovered ? 'border-gray-300' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
          ${isConnecting ? 'bg-gray-200' : 'bg-gray-100'}`}
        >
          <Hexagon size={16} className={isConnecting ? 'text-gray-600' : 'text-gray-500'} />
        </div>
        <span className="text-sm font-medium text-gray-800">{data.label}</span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className={`!w-3 !h-3 !border-white !border-2 ${isConnecting ? '!bg-blue-500' : '!bg-gray-400'}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={`!w-3 !h-3 !border-white !border-2 ${isConnecting ? '!bg-blue-500' : '!bg-gray-400'}`}
      />
    </div>
  )
}