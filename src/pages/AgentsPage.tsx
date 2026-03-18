import type { FC } from 'react'
import { Plus, Search, Bot } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { AgentCard, AgentModal, AgentDetailModal } from '../components/agent'
import { useAgentStore } from '../stores/agentStore'
import { useState, useEffect } from 'react'
import type { AgentFile } from '../types'

export const AgentsPage: FC = () => {
  const { agentFiles, addAgentFile, updateAgentFile, deleteAgentFile, loadAgentFiles } =
    useAgentStore()
  const [searchQuery, setSearchQuery] = useState('')

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingAgent, setViewingAgent] = useState<AgentFile | null>(null)

  // 编辑弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingAgent, setEditingAgent] = useState<AgentFile | undefined>()

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)

  // 首次加载时从本地读取智能体数据
  useEffect(() => {
    loadAgentFiles()
  }, [loadAgentFiles])

  // 打开创建弹窗
  const handleCreateClick = () => {
    setModalMode('create')
    setEditingAgent(undefined)
    setIsModalOpen(true)
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (agent: AgentFile) => {
    setViewingAgent(agent)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingAgent(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingAgent) {
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingAgent(viewingAgent)
      setIsModalOpen(true)
    }
  }

  // 打开编辑弹窗
  const handleEditClick = (agent: AgentFile) => {
    setModalMode('edit')
    setEditingAgent(agent)
    setIsModalOpen(true)
  }

  // 关闭编辑弹窗
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingAgent(undefined)
  }

  // 确认创建/编辑
  const handleModalConfirm = (agentData: Omit<AgentFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => {
    const now = new Date().toISOString()

    if (modalMode === 'create') {
      // 创建新智能体
      const newAgent: AgentFile = {
        ...agentData,
        id: `agent-${Date.now()}`,
        type: 'sub-agent',
        createdAt: now,
        updatedAt: now,
      }
      addAgentFile(newAgent)
    } else if (modalMode === 'edit' && editingAgent) {
      // 更新智能体
      updateAgentFile(editingAgent.id, {
        ...agentData,
        updatedAt: now,
      })
    }
  }

  // 点击删除
  const handleDeleteClick = (agentId: string) => {
    setDeletingAgentId(agentId)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingAgentId) {
      deleteAgentFile(deletingAgentId)
    }
    setDeleteConfirmOpen(false)
    setDeletingAgentId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingAgentId(null)
  }

  // 过滤智能体文件
  const filteredAgents = agentFiles.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.content?.toLowerCase().includes(searchQuery.toLowerCase())
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
                新建智能体
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredAgents.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onClick={() => handleCardClick(agent)}
                    onEdit={() => handleEditClick(agent)}
                    onDelete={() => handleDeleteClick(agent.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <Bot size={32} className="text-macos-text-tertiary" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑智能体弹窗 */}
      <AgentModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mode={modalMode}
        initialData={editingAgent}
        existingNames={agentFiles.map((a) => a.name)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个智能体吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 智能体详情弹窗 */}
      <AgentDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        agent={viewingAgent}
      />
    </div>
  )
}