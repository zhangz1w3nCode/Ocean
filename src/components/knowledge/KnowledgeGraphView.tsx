import { useState, type FC } from 'react'
import { KnowledgeGraphModal } from './KnowledgeGraph'
import { KnowledgeDetailModal } from './KnowledgeDetailModal'
import { KnowledgeModal } from './KnowledgeModal'
import { useKnowledgeStore } from '../../stores/knowledgeStore'
import { useToastStore } from '../../stores/toastStore'
import type { KnowledgeFile } from '../../types'

/**
 * 知识图谱内嵌视图
 * 作为知识区域二级导航「知识图谱」的内容区，取代原先的按钮 + 全屏弹窗形态。
 * 原弹窗里「点击节点 → 查看详情 → 编辑」这条链路依赖 KnowledgesPage 挂载的详情/编辑弹窗，
 * 内嵌后图谱独立成页，故在此自带这两个弹窗以保持行为不变。
 */
export const KnowledgeGraphView: FC = () => {
  const { knowledgeFiles, updateKnowledgeFile } = useKnowledgeStore()
  const { addToast } = useToastStore()

  const [viewingKnowledge, setViewingKnowledge] = useState<KnowledgeFile | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeFile | undefined>()
  const [isEditOpen, setIsEditOpen] = useState(false)

  const openDetail = (knowledge: KnowledgeFile) => {
    setViewingKnowledge(knowledge)
    setIsDetailOpen(true)
  }

  const handleEditFromDetail = () => {
    if (!viewingKnowledge) return
    setIsDetailOpen(false)
    setEditingKnowledge(viewingKnowledge)
    setIsEditOpen(true)
  }

  const handleEditConfirm = async (
    knowledgeData: Omit<KnowledgeFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>,
  ) => {
    if (!editingKnowledge) return false
    const success = await updateKnowledgeFile(editingKnowledge.id, {
      ...knowledgeData,
      updatedAt: new Date().toISOString(),
    })
    addToast(success ? '知识更新成功' : '知识更新失败，请重试', success ? 'success' : 'error')
    return success
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <KnowledgeGraphModal
        isOpen={false}
        embedded
        onClose={() => {}}
        onNodeClick={openDetail}
      />

      <KnowledgeDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false)
          setViewingKnowledge(null)
        }}
        onEdit={handleEditFromDetail}
        knowledge={viewingKnowledge}
      />

      <KnowledgeModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false)
          setEditingKnowledge(undefined)
        }}
        onConfirm={handleEditConfirm}
        mode="edit"
        initialData={editingKnowledge}
        existingNames={knowledgeFiles.map((k) => k.name)}
        isNameLocked={false}
      />
    </div>
  )
}
