import type { FC } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Briefcase } from 'lucide-react'
import { useFlowEditorStore } from '../../../stores/flowEditorStore'

interface BusinessNodeProps {
  data: { label: string; description?: string; config?: Record<string, any> }
  selected?: boolean
  id?: string
}

export const BusinessNode: FC<BusinessNodeProps> = ({ data, selected, id }) => {
  const connectingNodeId = useFlowEditorStore((state) => state.connectingNodeId)
  const hoveredNodeId = useFlowEditorStore((state) => state.hoveredNodeId)
  const isConnecting = connectingNodeId === id
  const isHovered = hoveredNodeId === id

  return (
    <div
      className={`
        min-w-[160px] px-4 py-3 rounded-xl
        bg-gradient-to-br ${isConnecting ? 'from-blue-50 to-blue-50' : 'from-violet-50 to-purple-50'}
        border-2 shadow-lg transition-all duration-200 pointer-events-auto
        ${selected ? 'border-purple-400 ring-4 ring-purple-100' : ''}
        ${isConnecting ? 'border-blue-400 ring-4 ring-blue-100' : ''}
        ${isHovered && !selected && !isConnecting ? 'border-purple-300 shadow-xl scale-[1.02]' : ''}
        ${!selected && !isConnecting && !isHovered ? 'border-purple-200' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isConnecting ? 'bg-blue-500' : 'bg-purple-500'}`}>
          <Briefcase size={14} className="text-white" />
        </div>
        <span className="text-sm font-medium text-gray-800">{data.label}</span>
      </div>

      {data.description && (
        <p className="mt-2 text-xs text-gray-500">{data.description}</p>
      )}

      {/* 配置预览 */}
      {data.config && Object.keys(data.config).length > 0 && (
        <div className={`mt-2 pt-2 border-t flex flex-wrap gap-1 ${isConnecting ? 'border-blue-100' : 'border-purple-100'}`}>
          {Object.entries(data.config).slice(0, 2).map(([key, value]) => (
            <span
              key={key}
              className={`text-[10px] px-1.5 py-0.5 bg-white rounded border ${isConnecting ? 'text-blue-600 border-blue-100' : 'text-purple-600 border-purple-100'}`}
            >
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className={`!w-3 !h-3 !border-white !border-2 ${isConnecting ? '!bg-blue-500' : '!bg-purple-500'}`}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={`!w-3 !h-3 !border-white !border-2 ${isConnecting ? '!bg-blue-500' : '!bg-purple-500'}`}
      />
    </div>
  )
}