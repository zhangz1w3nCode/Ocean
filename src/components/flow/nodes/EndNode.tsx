import type { FC } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Square } from 'lucide-react'
import { useFlowEditorStore } from '../../../stores/flowEditorStore'

interface EndNodeProps {
  data: { label: string }
  selected?: boolean
  id?: string
}

export const EndNode: FC<EndNodeProps> = ({ data, selected, id }) => {
  const connectingNodeId = useFlowEditorStore((state) => state.connectingNodeId)
  const hoveredNodeId = useFlowEditorStore((state) => state.hoveredNodeId)
  const isConnecting = connectingNodeId === id
  const isHovered = hoveredNodeId === id

  return (
    <div
      className={`
        min-w-[100px] px-4 py-2.5 rounded-xl
        bg-white border-2 shadow-lg transition-all duration-200 pointer-events-auto
        ${selected ? 'border-red-400 ring-4 ring-red-100' : ''}
        ${isConnecting ? 'border-blue-400 ring-4 ring-blue-100' : ''}
        ${isHovered && !selected && !isConnecting ? 'border-red-300 shadow-xl scale-[1.02]' : ''}
        ${!selected && !isConnecting && !isHovered ? 'border-gray-200' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isConnecting ? 'bg-blue-100' : 'bg-red-100'}`}>
          <Square size={12} className={isConnecting ? 'text-blue-600' : 'text-red-600'} />
        </div>
        <span className="text-sm font-medium text-gray-800">{data.label}</span>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className={`!w-3 !h-3 !border-white !border-2 ${isConnecting ? '!bg-blue-500' : '!bg-gray-400'}`}
      />
    </div>
  )
}