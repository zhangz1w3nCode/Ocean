import type { FC } from 'react'
import { Plus, Search, Zap } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { AbilityCard, AbilityModal, AbilityDetailModal } from '../components/ability'
import { useAbilityStore } from '../stores/abilityStore'
import { useState, useEffect } from 'react'
import type { AbilityFile } from '../types'

export const AbilitiesPage: FC = () => {
  const { abilityFiles, addAbilityFile, updateAbilityFile, deleteAbilityFile, loadAbilityFiles } =
    useAbilityStore()
  const [searchQuery, setSearchQuery] = useState('')

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingAbility, setViewingAbility] = useState<AbilityFile | null>(null)

  // 编辑弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingAbility, setEditingAbility] = useState<AbilityFile | undefined>()

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingAbilityId, setDeletingAbilityId] = useState<string | null>(null)

  // 首次加载时从本地读取能力数据
  useEffect(() => {
    loadAbilityFiles()
  }, [loadAbilityFiles])

  // 打开创建弹窗
  const handleCreateClick = () => {
    setModalMode('create')
    setEditingAbility(undefined)
    setIsModalOpen(true)
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (ability: AbilityFile) => {
    setViewingAbility(ability)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingAbility(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingAbility) {
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingAbility(viewingAbility)
      setIsModalOpen(true)
    }
  }

  // 打开编辑弹窗
  const handleEditClick = (ability: AbilityFile) => {
    setModalMode('edit')
    setEditingAbility(ability)
    setIsModalOpen(true)
  }

  // 关闭编辑弹窗
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingAbility(undefined)
  }

  // 确认创建/编辑
  const handleModalConfirm = (abilityData: Omit<AbilityFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => {
    const now = new Date().toISOString()

    if (modalMode === 'create') {
      // 创建新能力
      const newAbility: AbilityFile = {
        ...abilityData,
        id: `ability-${Date.now()}`,
        type: 'ability',
        createdAt: now,
        updatedAt: now,
      }
      addAbilityFile(newAbility)
    } else if (modalMode === 'edit' && editingAbility) {
      // 更新能力
      updateAbilityFile(editingAbility.id, {
        ...abilityData,
        updatedAt: now,
      })
    }
  }

  // 点击删除
  const handleDeleteClick = (abilityId: string) => {
    setDeletingAbilityId(abilityId)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingAbilityId) {
      deleteAbilityFile(deletingAbilityId)
    }
    setDeleteConfirmOpen(false)
    setDeletingAbilityId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingAbilityId(null)
  }

  // 过滤能力文件
  const filteredAbilities = abilityFiles.filter((ability) => {
    const matchesSearch =
      ability.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ability.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ability.content?.toLowerCase().includes(searchQuery.toLowerCase())
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
                新建能力
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredAbilities.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredAbilities.map((ability) => (
                  <AbilityCard
                    key={ability.id}
                    ability={ability}
                    onClick={() => handleCardClick(ability)}
                    onEdit={() => handleEditClick(ability)}
                    onDelete={() => handleDeleteClick(ability.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <Zap size={32} className="text-macos-text-tertiary" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑能力弹窗 */}
      <AbilityModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mode={modalMode}
        initialData={editingAbility}
        existingNames={abilityFiles.map((a) => a.name)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个能力吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 能力详情弹窗 */}
      <AbilityDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        ability={viewingAbility}
      />
    </div>
  )
}