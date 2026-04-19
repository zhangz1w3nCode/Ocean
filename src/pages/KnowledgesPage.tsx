import type { FC } from 'react'
import { Plus, Search, BookOpen, FileSearch, FolderOpen } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { KnowledgeCard, KnowledgeModal, KnowledgeDetailModal, KnowledgeGraphModal, KnowledgeGraphButton, GlobalIndexModal } from '../components/knowledge'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useToastStore } from '../stores/toastStore'
import { useState, useEffect, useMemo } from 'react'
import type { KnowledgeFile } from '../types'
import { generateIndexContent } from '../utils/storage'

export const KnowledgesPage: FC = () => {
  const { knowledgeFiles, addKnowledgeFile, updateKnowledgeFile, deleteKnowledgeFile, loadKnowledgeFiles } =
    useKnowledgeStore()
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingKnowledge, setViewingKnowledge] = useState<KnowledgeFile | null>(null)

  // 编辑弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeFile | undefined>()

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingKnowledgeId, setDeletingKnowledgeId] = useState<string | null>(null)

  // 知识图谱弹窗状态
  const [isGraphOpen, setIsGraphOpen] = useState(false)

  // 全局索引弹窗状态
  const [isGlobalIndexOpen, setIsGlobalIndexOpen] = useState(false)

  // 获取全局索引文件（INDEX.md）
  const globalIndexKnowledge = useMemo(() => {
    return knowledgeFiles.find(
      (k) => k.name.toLowerCase() === 'index'
    )
  }, [knowledgeFiles])

  // 动态生成索引内容（当 INDEX.md 不存在时使用）
  const generatedIndexContent = useMemo(() => {
    // 使用排除 INDEX 后的知识文件列表来生成树形目录
    const nonIndexFiles = knowledgeFiles.filter((k) => k.name.toLowerCase() !== 'index')
    if (nonIndexFiles.length === 0) return null
    return generateIndexContent(nonIndexFiles)
  }, [knowledgeFiles])

  // 过滤知识文件（排除 INDEX.md，支持标签搜索）
  const filteredKnowledges = useMemo(() => {
    return knowledgeFiles
      .filter((k) => k.name.toLowerCase() !== 'index') // 排除全局索引
      .filter((knowledge) => {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          knowledge.name.toLowerCase().includes(query) ||
          knowledge.description?.toLowerCase().includes(query) ||
          knowledge.content?.toLowerCase().includes(query) ||
          knowledge.category?.toLowerCase().includes(query) ||
          knowledge.tags?.some(tag => tag.toLowerCase().includes(query))
        return matchesSearch
      })
  }, [knowledgeFiles, searchQuery])

  // 按分类分组
  const groupedKnowledges = useMemo(() => {
    const groups = new Map<string, KnowledgeFile[]>()
    for (const knowledge of filteredKnowledges) {
      const category = knowledge.category || ''
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(knowledge)
    }
    // 排序：无分类在前，然后按分类名排序
    const sortedEntries = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === '' && b !== '') return -1
      if (a !== '' && b === '') return 1
      return a.localeCompare(b)
    })
    return sortedEntries
  }, [filteredKnowledges])

  // 首次加载时从本地读取知识库数据
  useEffect(() => {
    loadKnowledgeFiles()
  }, [loadKnowledgeFiles])

  // 打开创建弹窗
  const handleCreateClick = () => {
    setModalMode('create')
    setEditingKnowledge(undefined)
    setIsModalOpen(true)
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (knowledge: KnowledgeFile) => {
    setViewingKnowledge(knowledge)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingKnowledge(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingKnowledge) {
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingKnowledge(viewingKnowledge)
      setIsModalOpen(true)
    }
  }

  // 打开编辑弹窗
  const handleEditClick = (knowledge: KnowledgeFile) => {
    setModalMode('edit')
    setEditingKnowledge(knowledge)
    setIsModalOpen(true)
  }

  // 关闭编辑弹窗
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingKnowledge(undefined)
  }

  // 确认创建/编辑
  const handleModalConfirm = (knowledgeData: Omit<KnowledgeFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => {
    const now = new Date().toISOString()

    if (modalMode === 'create') {
      // 创建新知识
      const newKnowledge: KnowledgeFile = {
        ...knowledgeData,
        id: `knowledge-${Date.now()}`,
        type: 'knowledge',
        createdAt: now,
        updatedAt: now,
      }
      addKnowledgeFile(newKnowledge)
    } else if (modalMode === 'edit' && editingKnowledge) {
      // 更新知识
      updateKnowledgeFile(editingKnowledge.id, {
        ...knowledgeData,
        updatedAt: now,
      })
    }
  }

  // 点击删除
  const handleDeleteClick = (knowledgeId: string) => {
    setDeletingKnowledgeId(knowledgeId)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingKnowledgeId) {
      deleteKnowledgeFile(deletingKnowledgeId)
    }
    setDeleteConfirmOpen(false)
    setDeletingKnowledgeId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingKnowledgeId(null)
  }

  // 保存全局索引（将动态生成的内容直接保存为 INDEX.md）
  const handleSaveGlobalIndex = () => {
    if (globalIndexKnowledge) {
      // 已存在则覆盖更新
      updateKnowledgeFile(globalIndexKnowledge.id, {
        content: generatedIndexContent || '',
        updatedAt: new Date().toISOString(),
      })
    } else {
      // 不存在则新建
      const now = new Date().toISOString()
      const newKnowledge: KnowledgeFile = {
        id: `knowledge-${Date.now()}`,
        name: 'INDEX',
        type: 'knowledge',
        description: '知识库全局索引',
        content: generatedIndexContent || '',
        tags: ['index'],
        createdAt: now,
        updatedAt: now,
      }
      addKnowledgeFile(newKnowledge)
    }
    setIsGlobalIndexOpen(false)
    addToast('保存成功', 'success')
  }

  // 刷新全局索引（从磁盘重新加载后再生成目录结构）
  const handleRefreshGlobalIndex = async (): Promise<string | null> => {
    await loadKnowledgeFiles() // 从磁盘重新读取知识库文件
    const latestFiles = useKnowledgeStore.getState().knowledgeFiles
    const nonIndexFiles = latestFiles.filter((k) => k.name.toLowerCase() !== 'index')
    if (nonIndexFiles.length === 0) {
      addToast('刷新成功', 'success')
      return null
    }
    const freshContent = generateIndexContent(nonIndexFiles)
    addToast('刷新成功', 'success')
    return freshContent
  }

  return (
    <div className="h-full pl-2 pr-4 pt-4 pb-4">
      {/* 白色圆角卡片容器 */}
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {/* 页面头部 */}
        <div className="h-16 px-6 flex items-center justify-between">
          {/* 左侧：按钮组 */}
          <div className="flex items-center gap-2">
            <KnowledgeGraphButton
              onClick={() => setIsGraphOpen(true)}
            />
            {/* 全局索引按钮 */}
            <button
              onClick={() => setIsGlobalIndexOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <FileSearch size={16} />
              <span>全局索引</span>
            </button>
          </div>

          {/* 右侧：搜索和新建 */}
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
                新建知识
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredKnowledges.length > 0 ? (
            <div className="max-w-6xl mx-auto space-y-6">
              {groupedKnowledges.map(([category, knowledges]) => (
                <div key={category}>
                  {/* 分类标题 */}
                  {category && (
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <FolderOpen size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">{category}</span>
                      <span className="text-xs text-gray-400">({knowledges.length})</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {knowledges.map((knowledge) => (
                      <KnowledgeCard
                        key={knowledge.id}
                        knowledge={knowledge}
                        onClick={() => handleCardClick(knowledge)}
                        onEdit={() => handleEditClick(knowledge)}
                        onDelete={() => handleDeleteClick(knowledge.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <BookOpen size={32} className="text-macos-text-tertiary" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑知识库弹窗 */}
      <KnowledgeModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mode={modalMode}
        initialData={editingKnowledge}
        existingNames={knowledgeFiles.map((k) => k.name)}
        isNameLocked={false}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个知识吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 知识库详情弹窗 */}
      <KnowledgeDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        knowledge={viewingKnowledge}
      />

      {/* 知识图谱弹窗 */}
      <KnowledgeGraphModal
        isOpen={isGraphOpen}
        onClose={() => setIsGraphOpen(false)}
        onNodeClick={handleCardClick}
      />

      {/* 全局索引弹窗 */}
      <GlobalIndexModal
        isOpen={isGlobalIndexOpen}
        onClose={() => setIsGlobalIndexOpen(false)}
        content={globalIndexKnowledge?.content || null}
        exists={!!globalIndexKnowledge}
        generatedContent={generatedIndexContent}
        onSave={handleSaveGlobalIndex}
        onRefresh={handleRefreshGlobalIndex}
      />
    </div>
  )
}