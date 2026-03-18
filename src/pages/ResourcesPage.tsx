import type { FC } from 'react'
import { Plus, Search, FileText } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { ResourceCard, ResourceModal, ResourceDetailModal } from '../components/resource'
import { useResourceStore } from '../stores/resourceStore'
import { useState, useEffect } from 'react'
import type { ResourceFile } from '../types'

export const ResourcesPage: FC = () => {
  const { resourceFiles, addResourceFile, updateResourceFile, deleteResourceFile, loadResourceFiles } =
    useResourceStore()
  const [searchQuery, setSearchQuery] = useState('')

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingResource, setViewingResource] = useState<ResourceFile | null>(null)

  // 编辑弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingResource, setEditingResource] = useState<ResourceFile | undefined>()

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null)

  // 首次加载时从本地读取资源数据
  useEffect(() => {
    loadResourceFiles()
  }, [loadResourceFiles])

  // 打开创建弹窗
  const handleCreateClick = () => {
    setModalMode('create')
    setEditingResource(undefined)
    setIsModalOpen(true)
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (resource: ResourceFile) => {
    setViewingResource(resource)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingResource(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingResource) {
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingResource(viewingResource)
      setIsModalOpen(true)
    }
  }

  // 打开编辑弹窗
  const handleEditClick = (resource: ResourceFile) => {
    setModalMode('edit')
    setEditingResource(resource)
    setIsModalOpen(true)
  }

  // 关闭编辑弹窗
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingResource(undefined)
  }

  // 确认创建/编辑
  const handleModalConfirm = (resourceData: Omit<ResourceFile, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString()

    if (modalMode === 'create') {
      // 创建新资源
      const newResource: ResourceFile = {
        ...resourceData,
        id: `resource-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      }
      addResourceFile(newResource)
    } else if (modalMode === 'edit' && editingResource) {
      // 更新资源
      updateResourceFile(editingResource.id, {
        ...resourceData,
        updatedAt: now,
      })
    }
  }

  // 点击删除
  const handleDeleteClick = (resourceId: string) => {
    setDeletingResourceId(resourceId)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingResourceId) {
      deleteResourceFile(deletingResourceId)
    }
    setDeleteConfirmOpen(false)
    setDeletingResourceId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingResourceId(null)
  }

  // 过滤资源文件
  const filteredResources = resourceFiles.filter((resource) => {
    const matchesSearch =
      resource.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.content?.toLowerCase().includes(searchQuery.toLowerCase())
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
                新建资源
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredResources.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredResources.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    onClick={() => handleCardClick(resource)}
                    onEdit={() => handleEditClick(resource)}
                    onDelete={() => handleDeleteClick(resource.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <FileText size={32} className="text-macos-text-tertiary" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑资源弹窗 */}
      <ResourceModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mode={modalMode}
        initialData={editingResource}
        existingNames={resourceFiles.map((r) => r.name)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个资源文件吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 资源详情弹窗 */}
      <ResourceDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        resource={viewingResource}
      />
    </div>
  )
}
