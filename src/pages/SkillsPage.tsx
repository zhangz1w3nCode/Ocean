import type { FC } from 'react'
import { Plus, Search, Wand2 } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { SkillCard, SkillModal, SkillDetailModal } from '../components/skill'
import { useSkillStore } from '../stores/skillStore'
import { useState, useEffect } from 'react'
import type { SkillFile } from '../types'

export const SkillsPage: FC = () => {
  const { skillFiles, addSkillFile, updateSkillFile, deleteSkillFile, loadSkillFiles } = useSkillStore()
  const [searchQuery, setSearchQuery] = useState('')

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingSkill, setViewingSkill] = useState<SkillFile | null>(null)

  // 编辑弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingSkill, setEditingSkill] = useState<SkillFile | undefined>()

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingSkillId, setDeletingSkillId] = useState<string | null>(null)

  // 首次加载时从本地读取技能数据
  useEffect(() => {
    loadSkillFiles()
  }, [loadSkillFiles])

  // 打开创建弹窗
  const handleCreateClick = () => {
    setModalMode('create')
    setEditingSkill(undefined)
    setIsModalOpen(true)
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (skill: SkillFile) => {
    setViewingSkill(skill)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingSkill(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingSkill) {
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingSkill(viewingSkill)
      setIsModalOpen(true)
    }
  }

  // 打开编辑弹窗
  const handleEditClick = (skill: SkillFile) => {
    setModalMode('edit')
    setEditingSkill(skill)
    setIsModalOpen(true)
  }

  // 关闭编辑弹窗
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingSkill(undefined)
  }

  // 确认创建/编辑
  const handleModalConfirm = async (skillData: Omit<SkillFile, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'scripts' | 'references' | 'examples'>) => {
    const now = new Date().toISOString()

    if (modalMode === 'create') {
      // 创建新技能
      const newSkill: SkillFile = {
        ...skillData,
        id: `skill-${Date.now()}`,
        type: 'skill',
        scripts: [],
        references: [],
        examples: [],
        createdAt: now,
        updatedAt: now,
      }
      addSkillFile(newSkill)
    } else if (modalMode === 'edit' && editingSkill) {
      // 更新技能
      updateSkillFile(editingSkill.id, {
        ...skillData,
        updatedAt: now,
      })
    }
  }

  // 点击删除
  const handleDeleteClick = (skillId: string) => {
    setDeletingSkillId(skillId)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingSkillId) {
      deleteSkillFile(deletingSkillId)
    }
    setDeleteConfirmOpen(false)
    setDeletingSkillId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingSkillId(null)
  }

  // 过滤技能文件
  const filteredSkills = skillFiles.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.content?.toLowerCase().includes(searchQuery.toLowerCase())
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
                新建技能
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredSkills.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onClick={() => handleCardClick(skill)}
                    onEdit={() => handleEditClick(skill)}
                    onDelete={() => handleDeleteClick(skill.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                <Wand2 size={32} className="text-violet-500" />
              </div>
              <p className="mt-4 text-sm text-macos-text-secondary">还没有技能</p>
              <p className="mt-1 text-xs text-macos-text-tertiary">点击上方「新建技能」创建第一个技能</p>
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑技能弹窗 */}
      <SkillModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mode={modalMode}
        initialData={editingSkill}
        existingNames={skillFiles.map((s) => s.name)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个技能吗？此操作将删除技能目录及其所有资源文件，且不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 技能详情弹窗 */}
      <SkillDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        skill={viewingSkill}
      />
    </div>
  )
}