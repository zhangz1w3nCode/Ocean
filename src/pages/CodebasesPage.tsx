import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Code } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { CodebaseCard, CodebaseModal, CodebaseDetailModal } from '../components/codebases'
import { useCodebaseStore } from '../stores/codebaseStore'
import { useToastStore } from '../stores/toastStore'
import type { CodebaseInfo, CodebaseSource } from '../types'

export const CodebasesPage: FC<{ nested?: boolean }> = ({ nested = false }) => {
  const { codebases, loadCodebases, createCodebase, updateCodebaseReadme, deleteCodebase, readCodebase, isBusy } = useCodebaseStore()
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  // 搜索框收起/展开：默认仅图标，点击后向右滑动展开；失焦且无内容时收回
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingCodebase, setViewingCodebase] = useState<CodebaseInfo | null>(null)

  // 编辑弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingName, setEditingName] = useState<string | undefined>()
  const [editingContent, setEditingContent] = useState('')

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingName, setDeletingName] = useState<string | null>(null)

  useEffect(() => {
    loadCodebases()
  }, [loadCodebases])

  const handleCreateClick = () => {
    setModalMode('create')
    setEditingName(undefined)
    setEditingContent('')
    setIsModalOpen(true)
  }

  const handleCardClick = (codebase: CodebaseInfo) => {
    setViewingCodebase(codebase)
    setIsDetailOpen(true)
  }

  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingCodebase(null)
  }

  // 从详情进入编辑：先读取 README 内容
  const handleEditFromDetail = async () => {
    if (viewingCodebase) {
      const result = await readCodebase(viewingCodebase.name)
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingName(viewingCodebase.name)
      setEditingContent(result?.content || '')
      setIsModalOpen(true)
    }
  }

  const handleEditClick = async (codebase: CodebaseInfo) => {
    const result = await readCodebase(codebase.name)
    setModalMode('edit')
    setEditingName(codebase.name)
    setEditingContent(result?.content || '')
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingName(undefined)
    setEditingContent('')
  }

  // 创建代码库（三种来源）
  const handleCreateConfirm = async (name: string, source: CodebaseSource, payload: { url?: string; content?: string; description?: string; sourcePath?: string }) => {
    const r = await createCodebase(name, { type: source, ...payload })
    if (r.success) {
      addToast(
        source === 'url' ? '代码库克隆成功' : source === 'local' ? '代码库复制成功' : '代码库创建成功',
        'success'
      )
      setIsModalOpen(false)
    } else {
      addToast(r.error || '代码库添加失败，请检查名称/地址/路径后重试', 'error')
    }
    return r.success
  }

  // 更新 README 内容（唯一可编辑字段）
  const handleUpdateConfirm = async (name: string, content: string) => {
    const r = await updateCodebaseReadme(name, content)
    if (r.success) {
      addToast('README 更新成功', 'success')
      setIsModalOpen(false)
    } else {
      addToast(r.error || 'README 更新失败，请重试', 'error')
    }
    return r.success
  }

  const handleDeleteClick = (name: string) => {
    setDeletingName(name)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (deletingName) {
      const r = await deleteCodebase(deletingName)
      if (r.success) {
        addToast('代码库删除成功', 'success')
      } else {
        addToast(r.error || '代码库删除失败，请重试', 'error')
      }
    }
    setDeleteConfirmOpen(false)
    setDeletingName(null)
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingName(null)
  }

  const filteredCodebases = codebases.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.preview?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const innerContent = (
    <>
      {/* 页面头部 */}
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-3">
          {/* 搜索：带边框放大镜框，悬浮时输入区向左展开（放大镜固定最左）；无内容离开时收回 */}
          <div
            onMouseEnter={() => setIsSearchExpanded(true)}
            onMouseLeave={() => { if (!searchQuery.trim() && document.activeElement !== searchInputRef.current) setIsSearchExpanded(false) }}
            className={`flex items-center bg-white border rounded-lg overflow-hidden
              transition-[width] duration-500 ease-in-out flex-shrink-0 h-[38px]
              ${isSearchExpanded
                ? 'w-48 border-gray-300 hover:border-gray-400 focus-within:border-gray-400 focus-within:shadow-[0_4px_12px_rgba(0,0,0,0.08)]'
                : 'w-[50px] border-gray-300 hover:border-gray-400 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]'}`}
          >
            <button
              onClick={() => {
                setIsSearchExpanded(true)
                requestAnimationFrame(() => searchInputRef.current?.focus())
              }}
              className="flex-shrink-0 flex items-center justify-center w-[50px] h-full text-gray-700 hover:text-gray-900 transition-colors"
              title="搜索代码库"
            >
              <Search size={16} />
            </button>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchExpanded(true)}
              onBlur={() => { if (!searchQuery.trim()) setIsSearchExpanded(false) }}
              className={`text-sm bg-transparent placeholder:text-macos-text-tertiary focus:outline-none
                transition-[width,opacity,padding] duration-500 ease-in-out
                ${isSearchExpanded ? 'flex-1 min-w-0 opacity-100 pl-1 pr-3' : 'w-0 opacity-0 p-0 border-0'}`}
            />
          </div>

          <Button
            variant="outline"
            onClick={handleCreateClick}
            className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
          >
            <Plus size={16} className="flex-shrink-0" />
            <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
              添加仓库
            </span>
          </Button>
        </div>
      </div>

      {/* 页面内容 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {filteredCodebases.length > 0 ? (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCodebases.map((c) => (
                <CodebaseCard
                  key={c.name}
                  codebase={c}
                  onClick={() => handleCardClick(c)}
                  onEdit={() => handleEditClick(c)}
                  onDelete={() => handleDeleteClick(c.name)}
                />
              ))}
            </div>
          </div>
        ) : (
          /* 空状态：仅图标 */
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <Code size={32} className="text-macos-text-tertiary" />
            </div>
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      <CodebaseModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        mode={modalMode}
        onConfirm={handleCreateConfirm}
        onUpdate={handleUpdateConfirm}
        editingName={editingName}
        initialContent={editingContent}
        existingNames={codebases.map((c) => c.name)}
        isBusy={isBusy}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个代码库吗？此操作将删除代码库目录及其全部文件，且不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 详情弹窗 */}
      <CodebaseDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        codebase={viewingCodebase}
      />
    </>
  )

  if (nested) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {innerContent}
      </div>
    )
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {innerContent}
      </div>
    </div>
  )
}
