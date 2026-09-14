import type { FC } from 'react'
import { useState, useEffect, useMemo } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { KnowledgeCard, KnowledgeReviewModal } from '../components/knowledge'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useToastStore } from '../stores/toastStore'
import type { KnowledgeFile } from '../types'

export const KnowledgeReviewPage: FC<{ nested?: boolean }> = ({ nested = false }) => {
  const { knowledgeFiles, loadKnowledgeFiles, updateKnowledgeFile } = useKnowledgeStore()
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')

  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [reviewingKnowledge, setReviewingKnowledge] = useState<KnowledgeFile | null>(null)

  useEffect(() => {
    loadKnowledgeFiles()
  }, [loadKnowledgeFiles])

  // 过滤待审核知识（排除 INDEX.md，支持关键字搜索）
  const pendingKnowledges = useMemo(() => {
    return knowledgeFiles
      .filter((k) => k.name.toLowerCase() !== 'index')
      .filter((k) => k.status === 'pending')
      .filter((knowledge) => {
        const query = searchQuery.toLowerCase()
        return (
          knowledge.name.toLowerCase().includes(query) ||
          knowledge.summary?.toLowerCase().includes(query) ||
          knowledge.content?.toLowerCase().includes(query) ||
          knowledge.category?.toLowerCase().includes(query) ||
          knowledge.tags?.some((tag) => tag.toLowerCase().includes(query))
        )
      })
  }, [knowledgeFiles, searchQuery])

  const handleCardClick = (knowledge: KnowledgeFile) => {
    setReviewingKnowledge(knowledge)
    setIsReviewOpen(true)
  }

  const handleReviewClose = () => {
    setIsReviewOpen(false)
    setReviewingKnowledge(null)
  }

  const handleApprove = async () => {
    if (!reviewingKnowledge) return
    const success = await updateKnowledgeFile(reviewingKnowledge.id, {
      status: 'validated',
      updatedAt: new Date().toISOString(),
    })
    if (success) {
      addToast('审核通过，知识已发布', 'success')
      handleReviewClose()
    } else {
      addToast('审核失败，请重试', 'error')
    }
  }

  const innerContent = (
    <>
      {/* 页面头部 */}
      <div className="h-16 px-6 flex items-center justify-end">

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
      </div>

      {/* 页面内容 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {pendingKnowledges.length > 0 ? (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingKnowledges.map((knowledge) => (
                <KnowledgeCard
                  key={knowledge.id}
                  knowledge={knowledge}
                  onClick={() => handleCardClick(knowledge)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <ShieldCheck size={32} className="text-macos-text-tertiary" />
            </div>
            <p className="mt-4 text-sm text-macos-text-tertiary">暂无待审核的知识</p>
          </div>
        )}
      </div>

      {/* 审核弹窗 */}
      <KnowledgeReviewModal
        key={reviewingKnowledge?.id || 'empty'}
        isOpen={isReviewOpen}
        onClose={handleReviewClose}
        knowledge={reviewingKnowledge}
        onApprove={handleApprove}
      />
    </>
  )

  if (nested) {
    return innerContent
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {innerContent}
      </div>
    </div>
  )
}