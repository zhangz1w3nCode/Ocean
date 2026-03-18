import type { FC } from 'react'
import { useState, useRef, useCallback } from 'react'
import { X, FileText, GitBranch, Plus, Trash2, Tag, AlignLeft, HelpCircle, GripVertical } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFlowEditorStore } from '../../stores/flowEditorStore'
import { useNodeStore } from '../../stores/nodeStore'
import { MarkdownRenderer } from '../ui'
import type { Branch } from '../../types'

export const PropertiesPanel: FC = () => {
  const [panelWidth, setPanelWidth] = useState(288) // 默认宽度 288px (w-72)
  const [isResizing, setIsResizing] = useState(false)
  const resizeRef = useRef<HTMLDivElement>(null)

  const {
    nodes,
    selectedNodeId,
    updateNode,
    clearSelection,
    pushHistory,
  } = useFlowEditorStore()

  const { nodeDefinitions } = useNodeStore()

  // 处理调整大小
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)

    const startX = e.clientX
    const startWidth = panelWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX // 注意：向左拖动增加宽度
      const newWidth = Math.min(480, Math.max(288, startWidth + delta))
      setPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [panelWidth])

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  // 未选中节点时不显示
  if (!selectedNode) {
    return null
  }

  // 是否为处理节点
  const isProcessNode = selectedNode.type === 'process'
  // 是否为业务节点
  const isBusinessNode = selectedNode.type === 'business'
  // 是否为判断节点
  const isDecisionNode = selectedNode.type === 'decision'
  // 是否为局部节点
  const isLocalNode = selectedNode.type === 'local'

  const handleUpdate = (key: string, value: any) => {
    // 如果是局部节点且更新的是label,同步更新localNodeName
    if (isLocalNode && key === 'label') {
      updateNode(selectedNode.id, { [key]: value, localNodeName: value })
    } else {
      updateNode(selectedNode.id, { [key]: value })
    }
  }

  // 添加分支
  const handleAddBranch = () => {
    pushHistory()
    const currentBranches = selectedNode.data.branches || []
    const now = Date.now().toString()

    // 如果是第一个分支，自动添加"其他"作为兜底分支
    if (currentBranches.length === 0) {
      const otherBranch: Branch = {
        id: now + '-other',
        name: '其他',
        description: '均不符合上述分类的进入本分支',
      }
      const newBranch: Branch = {
        id: now,
        name: '分支1',
      }
      updateNode(selectedNode.id, {
        branches: [newBranch, otherBranch]
      })
    } else {
      // 计算普通分支的数量（排除"其他"分支）
      const normalBranches = currentBranches.filter(b => b.name !== '其他')
      const newBranch: Branch = {
        id: now,
        name: `分支${normalBranches.length + 1}`,
      }
      // 将新分支插入到"其他"分支之前（如果有"其他"分支）
      const otherIndex = currentBranches.findIndex(b => b.name === '其他')
      if (otherIndex !== -1) {
        // 有"其他"分支，插入到它前面
        const newBranches = [
          ...currentBranches.slice(0, otherIndex),
          newBranch,
          ...currentBranches.slice(otherIndex)
        ]
        updateNode(selectedNode.id, { branches: newBranches })
      } else {
        // 没有"其他"分支，直接追加
        updateNode(selectedNode.id, {
          branches: [...currentBranches, newBranch]
        })
      }
    }
  }

  // 更新分支名称
  const handleUpdateBranchName = (branchId: string, value: string) => {
    const currentBranches = selectedNode.data.branches || []
    const updatedBranches = currentBranches.map(branch =>
      branch.id === branchId ? { ...branch, name: value } : branch
    )
    updateNode(selectedNode.id, { branches: updatedBranches })
  }

  // 删除分支
  const handleDeleteBranch = (branchId: string) => {
    pushHistory()
    const currentBranches = selectedNode.data.branches || []
    const updatedBranches = currentBranches.filter(branch => branch.id !== branchId)
    updateNode(selectedNode.id, { branches: updatedBranches })
  }

  // 从节点定义中获取详细信息（仅用于显示参考）
  // 优先通过 nodeDefId 精确匹配，如果不存在则回退到名称匹配
  let nodeDefinition = selectedNode.data.nodeDefId
    ? nodeDefinitions.find(def => def.id === selectedNode.data.nodeDefId)
    : nodeDefinitions.find(def => def.name === selectedNode.data.label)

  // 节点定义不存在时使用节点自身存储的信息（简化版）
  const storedNodeInfo = {
    content: selectedNode.data.content || '',
    description: selectedNode.data.description || '',
  }

  const nodeInfo = nodeDefinition || storedNodeInfo

  // 节点类型颜色
  const nodeTypeColor: Record<string, string> = {
    start: '#34C759',
    end: '#FF3B30',
    process: '#007AFF',
    decision: '#FF9500',
    business: '#5856D6',
    local: '#6B7280',
  }
  const currentColor = nodeTypeColor[selectedNode.type] || '#5856D6'

  // 输入框样式
  const inputClass = "w-full px-2.5 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors resize-none"
  const inputSmallClass = "w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors"

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.15 }}
        className="absolute right-4 top-4 bottom-4 z-10"
        style={{ width: `${panelWidth}px` }}
      >
        <div className="h-full bg-white rounded-xl border border-gray-200 shadow-lg flex flex-col overflow-hidden relative">
          {/* 调整宽度手柄 */}
          <div
            ref={resizeRef}
            onMouseDown={handleMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize group z-10
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
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded"
                style={{ backgroundColor: currentColor }}
              />
              <h3 className="font-medium text-sm text-gray-800 truncate max-w-[160px]">
                {selectedNode.data.label}
              </h3>
            </div>
            <button
              onClick={clearSelection}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* 内容 */}
          <div className="flex-1 p-3 overflow-y-auto">
            <div className="space-y-3">
              {/* 节点名称 - 业务节点只读 */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Tag size={11} className="text-blue-500" />
                  </div>
                  名称
                </label>
                {isBusinessNode ? (
                  <div className="w-full px-2.5 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                    {selectedNode.data.label}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={selectedNode.data.label}
                    onChange={(e) => handleUpdate('label', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 transition-colors"
                  />
                )}
              </div>

              {/* 描述 - 业务节点只读 */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <AlignLeft size={11} className="text-purple-500" />
                  </div>
                  描述
                </label>
                {isBusinessNode ? (
                  <div className="w-full px-2.5 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-700 min-h-[60px]">
                    {selectedNode.data.description || '暂无描述'}
                  </div>
                ) : (
                  <textarea
                    value={selectedNode.data.description || ''}
                    onChange={(e) => handleUpdate('description', e.target.value)}
                    placeholder="添加描述..."
                    rows={2}
                    className={inputClass}
                  />
                )}
              </div>

              {/* 处理节点：可直接编辑内容 */}
              {isProcessNode && (
                <div className="pt-2 border-t border-gray-100">
                  <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    <FileText size={12} />
                    节点内容
                  </label>
                  <textarea
                    value={selectedNode.data.content || ''}
                    onChange={(e) => handleUpdate('content', e.target.value)}
                    placeholder="描述这个处理节点需要做的事情..."
                    rows={4}
                    className={inputClass}
                  />
                </div>
              )}

              {/* 局部节点：可编辑内容 */}
              {isLocalNode && (
                <div className="pt-2 border-t border-gray-100">
                  <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    <FileText size={12} />
                    节点内容
                  </label>
                  <textarea
                    value={selectedNode.data.content || ''}
                    onChange={(e) => handleUpdate('content', e.target.value)}
                    placeholder="描述这个局部节点需要做的事情..."
                    rows={4}
                    className={inputClass}
                  />
                </div>
              )}

              {/* 判断节点配置 */}
              {isDecisionNode && (
                <div className="space-y-3">
                  {/* 判断内容 */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                        <HelpCircle size={11} className="text-orange-500" />
                      </div>
                      判断内容
                    </label>
                    <textarea
                      value={selectedNode.data.condition || ''}
                      onChange={(e) => handleUpdate('condition', e.target.value)}
                      placeholder="描述判断的主体和条件，如：检查用户是否已登录"
                      rows={2}
                      className={inputClass}
                    />
                  </div>

                  {/* 分支配置 */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <GitBranch size={11} className="text-blue-500" />
                      </div>
                      分支配置
                    </label>
                    {/* 分支列表 */}
                    {(selectedNode.data.branches || []).map((branch, index) => {
                      // "其他"分支固定显示为"其他"，不可删除，名称也不可编辑
                      const isOtherBranch = branch.name === '其他'
                      return (
                        <div key={branch.id} className="bg-gray-50 rounded-xl p-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            {/* 序号 - 灰色圆形背景 */}
                            <span className="text-xs text-gray-400 bg-gray-200 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                              {index + 1}
                            </span>
                            {/* 分支名称标题 */}
                            <span className="text-xs font-medium text-gray-700">
                              {isOtherBranch ? '其他' : branch.name || `分支${index + 1}`}
                            </span>
                            <div className="flex-1" />
                            {!isOtherBranch && (
                              <button
                                onClick={() => handleDeleteBranch(branch.id)}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                          {/* "其他"分支的输入框显示固定文案，不可编辑 */}
                          <input
                            type="text"
                            value={isOtherBranch ? '均不符合"上述分类"的进入本分支' : branch.name}
                            onChange={(e) => handleUpdateBranchName(branch.id, e.target.value)}
                            placeholder="分支名称"
                            disabled={isOtherBranch}
                            className={`${inputSmallClass} ${isOtherBranch ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
                            readOnly={isOtherBranch}
                          />
                        </div>
                      )
                    })}

                    {/* 空状态提示 */}
                    {(selectedNode.data.branches || []).length === 0 && (
                      <div className="text-xs text-gray-400 text-center py-2 bg-gray-50 rounded-lg">
                        点击下方按钮添加分支
                      </div>
                    )}

                    {/* 添加分支按钮 - 虚线边框样式 */}
                    <button
                      onClick={handleAddBranch}
                      className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 text-sm font-medium hover:border-orange-400 hover:text-orange-500 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Plus size={14} />
                      添加分支
                    </button>
                  </div>
                </div>
              )}

              {/* 业务节点内容：只读展示，使用MarkdownRenderer */}
              {isBusinessNode && nodeInfo.content && (
                <div className="pt-2 border-t border-gray-100">
                  <label className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <FileText size={12} />
                    内容
                  </label>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-80 overflow-y-auto">
                    <MarkdownRenderer content={nodeInfo.content} />
                  </div>
                </div>
              )}

              {/* 非编辑节点（除业务节点外）：显示节点定义的参考信息（只读） */}
              {!isBusinessNode && !isProcessNode && !isDecisionNode && !isLocalNode && (nodeInfo.content || nodeInfo.description) && (
                <>
                  {nodeInfo.description && (
                    <div className="pt-2 border-t border-gray-100">
                      <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                        <FileText size={12} />
                        描述
                      </label>
                      <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2">
                        {nodeInfo.description}
                      </div>
                    </div>
                  )}

                  {nodeInfo.content && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1">
                        内容
                      </label>
                      <div className="text-xs text-gray-600 bg-blue-50 rounded-lg p-2 max-h-32 overflow-y-auto">
                        {nodeInfo.content}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}