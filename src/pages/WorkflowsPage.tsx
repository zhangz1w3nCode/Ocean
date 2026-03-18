import type { FC } from 'react'
import { Plus, Search, FolderOpen } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { WorkflowCard, CreateWorkflowModal, WorkflowDetailModal } from '../components/workflow'
import { useWorkflowStore } from '../stores/workflowStore'
import { useAppStore } from '../stores/appStore'
import { useToastStore } from '../stores/toastStore'
import { useState, useEffect } from 'react'
import type { Workflow } from '../types'

export const WorkflowsPage: FC = () => {
  const { workflows, addWorkflow, deleteWorkflow, isLoaded, loadWorkflows } = useWorkflowStore()
  const { startEditing } = useAppStore()
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingWorkflow, setViewingWorkflow] = useState<Workflow | null>(null)

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null)
  const [deletingWorkflowName, setDeletingWorkflowName] = useState<string>('')

  // 组件挂载时加载本地数据
  useEffect(() => {
    if (!isLoaded) {
      loadWorkflows()
    }
  }, [isLoaded, loadWorkflows])

  // 过滤工作流
  const filteredWorkflows = workflows.filter(
    (wf) =>
      wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wf.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 创建新工作流
  const handleCreateWorkflow = async (name: string, description: string) => {
    const newWorkflow = {
      id: `wf-${Date.now()}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      hasMetadata: true, // 标记为使用新的文件夹结构
    }

    addWorkflow(newWorkflow)
    setIsCreateModalOpen(false)

    // 立即创建工作流文件夹并保存初始数据
    const { saveWorkflowData } = useWorkflowStore.getState()
    await saveWorkflowData(newWorkflow.id, [], [])

    // 创建后自动进入编辑
    setTimeout(() => {
      startEditing(newWorkflow.id)
    }, 100)
  }

  // 点击删除
  const handleDeleteClick = (workflowId: string, workflowName: string) => {
    setDeletingWorkflowId(workflowId)
    setDeletingWorkflowName(workflowName)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingWorkflowId) {
      deleteWorkflow(deletingWorkflowId)
      addToast('工作流删除成功', 'success')
    }
    setDeleteConfirmOpen(false)
    setDeletingWorkflowId(null)
    setDeletingWorkflowName('')
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingWorkflowId(null)
    setDeletingWorkflowName('')
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (workflow: Workflow) => {
    setViewingWorkflow(workflow)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingWorkflow(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingWorkflow) {
      setIsDetailOpen(false)
      startEditing(viewingWorkflow.id)
    }
  }

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
                className="pl-9 pr-4 py-2 w-56 text-sm bg-white border border-gray-200 rounded-lg
                           placeholder:text-macos-text-tertiary focus:outline-none
                           hover:border-gray-300 focus:border-gray-400
                           focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                           transition-[border-color,box-shadow] duration-200"
              />
            </div>

            <Button
              variant="outline"
              onClick={() => setIsCreateModalOpen(true)}
              className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
            >
              <Plus size={16} className="flex-shrink-0" />
              <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
                新建工作流
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredWorkflows.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    onClick={() => handleCardClick(workflow)}
                    onEdit={() => startEditing(workflow.id)}
                    onDelete={() => handleDeleteClick(workflow.id, workflow.name)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <FolderOpen size={32} className="text-macos-text-tertiary" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建弹窗 */}
      <CreateWorkflowModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onConfirm={handleCreateWorkflow}
        existingNames={workflows.map((wf) => wf.name)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message={`确定要删除工作流"${deletingWorkflowName}"吗？此操作不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 工作流详情弹窗 */}
      <WorkflowDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        workflow={viewingWorkflow}
      />
    </div>
  )
}