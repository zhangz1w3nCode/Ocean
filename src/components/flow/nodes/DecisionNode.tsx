import type { FC } from 'react'
import { Handle, Position } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import { useFlowEditorStore } from '../../../stores/flowEditorStore'
import type { Branch } from '../../../types'

interface DecisionNodeProps {
  data: {
    label: string
    description?: string
    condition?: string
    branches?: Branch[]
  }
  selected?: boolean
  id?: string
}

export const DecisionNode: FC<DecisionNodeProps> = ({ data, selected, id }) => {
  const connectingNodeId = useFlowEditorStore((state) => state.connectingNodeId)
  const hoveredNodeId = useFlowEditorStore((state) => state.hoveredNodeId)
  const isConnecting = connectingNodeId === id
  const isHovered = hoveredNodeId === id

  const branches = data.branches || []

  return (
    <div
      className={`
        px-4 py-3 rounded-xl
        bg-white border-2 shadow-lg transition-all duration-200 pointer-events-auto
        ${selected ? 'border-orange-400 ring-4 ring-orange-100' : ''}
        ${isConnecting ? 'border-blue-400 ring-4 ring-blue-100' : ''}
        ${isHovered && !selected && !isConnecting ? 'border-orange-300 shadow-xl scale-[1.02]' : ''}
        ${!selected && !isConnecting && !isHovered ? 'border-gray-200' : ''}
      `}
    >
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isConnecting ? 'bg-blue-100' : 'bg-orange-100'}`}>
          <GitBranch size={12} className={isConnecting ? 'text-blue-600' : 'text-orange-600'} />
        </div>
        <span className="text-sm font-medium text-gray-800">{data.label}</span>
      </div>

      {/* 判断条件 */}
      {data.condition && (
        <p className="mt-1.5 text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">
          {data.condition}
        </p>
      )}

      {data.description && (
        <p className="mt-1 text-xs text-gray-500">{data.description}</p>
      )}

      {/* 没有分支时的提示 */}
      {branches.length === 0 && (
        <div className="mt-2 text-xs text-gray-400 italic">
          请在右侧面板添加分支
        </div>
      )}

      {/* 分支列表 - 每个分支一行 */}
      {branches.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
          {branches.map((branch, index) => {
            const isOtherBranch = branch.name === '其他'
            return (
              <div
                key={branch.id}
                className="bg-gray-50 rounded-xl px-2.5 py-2 relative"
              >
                {/* Handle 连接点 - 放在每个分支块的右侧中间 */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={branch.id}
                  style={{
                    width: 10,
                    height: 10,
                    background: isConnecting ? '#3B82F6' : '#9CA3AF',
                    border: '2px solid white',
                    borderRadius: '50%',
                    right: 4,
                    top: '50%',
                    transform: 'translate(50%, -50%)',
                  }}
                />
                <div className="flex items-center gap-2">
                  {/* 序号 - 灰色圆形背景 */}
                  <span className="text-xs text-gray-400 bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </span>
                  {/* 分支名称 */}
                  <span className="text-xs font-medium text-gray-700">
                    {isOtherBranch ? '其他' : (branch.name || `分支${index + 1}`)}
                  </span>
                </div>
                {/* 分支文案 */}
                {!isOtherBranch && branch.description && (
                  <p className="text-xs text-gray-500 ml-7 mt-0.5">{branch.description}</p>
                )}
                {/* "其他"分支固定文案 */}
                {isOtherBranch && (
                  <p className="text-xs text-gray-500 ml-7 mt-0.5">
                    均不符合"上述分类"的进入本分支
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 输入 Handle - 左侧 */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 12,
          height: 12,
          background: isConnecting ? '#3B82F6' : '#9CA3AF',
          border: '2px solid white',
        }}
      />
    </div>
  )
}