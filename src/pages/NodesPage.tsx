import type { FC } from 'react'
import { Plus, Search, Layers } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { NodeCard, NodeModal, NodeDetailModal } from '../components/node'
import { useNodeStore } from '../stores/nodeStore'
import { useState, useEffect } from 'react'
import type { NodeDefinition } from '../types'

export const NodesPage: FC = () => {
  const { nodeDefinitions, addNodeDefinition, updateNodeDefinition, deleteNodeDefinition, loadNodeDefinitions } = useNodeStore()
  const [searchQuery, setSearchQuery] = useState('')

  // 弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingNode, setEditingNode] = useState<NodeDefinition | undefined>()

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingNode, setViewingNode] = useState<NodeDefinition | null>(null)

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null)

  // 首次加载时从本地读取节点数据
  useEffect(() => {
    loadNodeDefinitions()
  }, [loadNodeDefinitions])

  // 打开创建弹窗
  const handleCreateClick = () => {
    setModalMode('create')
    setEditingNode(undefined)
    setIsModalOpen(true)
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (node: NodeDefinition) => {
    setViewingNode(node)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingNode(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingNode) {
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingNode(viewingNode)
      setIsModalOpen(true)
    }
  }

  // 打开编辑弹窗
  const handleEditClick = (node: NodeDefinition) => {
    setModalMode('edit')
    setEditingNode(node)
    setIsModalOpen(true)
  }

  // 关闭弹窗
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingNode(undefined)
  }

  // 确认创建/编辑
  const handleModalConfirm = (nodeData: Omit<NodeDefinition, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (modalMode === 'create') {
      // 创建新节点
      const newNode: NodeDefinition = {
        ...nodeData,
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      addNodeDefinition(newNode)
    } else if (modalMode === 'edit' && editingNode) {
      // 更新节点
      updateNodeDefinition(editingNode.id, {
        ...nodeData,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  // 点击删除
  const handleDeleteClick = (nodeId: string) => {
    setDeletingNodeId(nodeId)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingNodeId) {
      deleteNodeDefinition(deletingNodeId)
    }
    setDeleteConfirmOpen(false)
    setDeletingNodeId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingNodeId(null)
  }

  // 过滤节点
  const filteredNodes = nodeDefinitions.filter((node) => {
    const matchesSearch =
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.content?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  return (
    <div className="h-full pl-2 pr-4 pt-4 pb-4">
      {/* 白色圆角卡片容器 */}
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {/* 页面头部 */}
        <div className="h-16 px-6 flex items-center justify-end">
          <div className="flex items-center gap-3">
            {/* 搜索框 */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary"
              />
              <input
                type="text"
                placeholder=""
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg
                           placeholder:text-macos-text-tertiary focus:outline-none
                           hover:border-gray-300 focus:border-gray-400
                           focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                           transition-[border-color,box-shadow] duration-200"
              />
            </div>

            <Button
              variant="outline"
              onClick={handleCreateClick}
              className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
            >
              <Plus size={16} className="flex-shrink-0" />
              <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
                新建节点
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredNodes.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredNodes.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    onClick={() => handleCardClick(node)}
                    onEdit={() => handleEditClick(node)}
                    onDelete={() => handleDeleteClick(node.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <Layers size={32} className="text-macos-text-tertiary" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑节点弹窗 */}
      <NodeModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mode={modalMode}
        initialData={editingNode}
        existingNames={nodeDefinitions.map(n => n.name)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个节点吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 节点详情弹窗 */}
      <NodeDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        node={viewingNode}
      />
    </div>
  )
}