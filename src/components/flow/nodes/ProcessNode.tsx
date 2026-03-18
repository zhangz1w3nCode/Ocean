import type { FC } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Cog } from 'lucide-react'
import { useFlowEditorStore } from '../../../stores/flowEditorStore'

interface ProcessNodeProps {
  data: {
    label: string
    description?: string
  }
  selected?: boolean
  id?: string
}

export const ProcessNode: FC<ProcessNodeProps> = ({ data, selected, id }) => {
  const connectingNodeId = useFlowEditorStore((state) => state.connectingNodeId)
  const hoveredNodeId = useFlowEditorStore((state) => state.hoveredNodeId)
  const isConnecting = connectingNodeId === id
  const isHovered = hoveredNodeId === id

  return (
    <div
      className={`
        min-w-[120px] px-4 py-3 rounded-lg
        bg-white border-2 shadow-lg transition-all duration-200 pointer-events-auto
        ${selected ? 'border-blue-400 ring-4 ring-blue-100' : ''}
        ${isConnecting ? 'border-blue-400 ring-4 ring-blue-100' : ''}
        ${isHovered && !selected && !isConnecting ? 'border-blue-300 shadow-xl scale-[1.02]' : ''}
        ${!selected && !isConnecting && !isHovered ? 'border-gray-200' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded flex items-center justify-center ${isConnecting ? 'bg-blue-100' : 'bg-blue-100'}`}>
          <Cog size={14} className={isConnecting ? 'text-blue-600' : 'text-blue-600'} />
        </div>
        <span className="text-sm font-medium text-gray-800">{data.label}</span>
      </div>

      {/* 输入 Handle - 左侧 */}
      <Handle
        type="target"
        position={Position.Left}
        className={`!w-3 !h-3 !border-white !border-2 ${isConnecting ? '!bg-blue-500' : '!bg-gray-400'}`}
      />

      {/* 输出 Handle - 右侧 */}
      <Handle
        type="source"
        position={Position.Right}
        className={`!w-3 !h-3 !border-white !border-2 ${isConnecting ? '!bg-blue-500' : '!bg-gray-400'}`}
      />
    </div>
  )
}