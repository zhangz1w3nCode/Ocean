import type { FC } from 'react'
import { useState, useEffect, useMemo } from 'react'
import { Search, ShieldCheck } from 'lucide-react'
import { KnowledgeCard, KnowledgeReviewModal } from '../components/knowledge'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useToastStore } from '../stores/toastStore'
import { ConfirmModal } from '../components/ui'
import type { KnowledgeFile } from '../types'
import {
  loadKnowledgeBaseline,
  loadKnowledgeRawFile,
  commitKnowledgeGit,
  rollbackKnowledgeGit,
  loadKnowledgeGitConfig,
  loadKnowledgeGitStatus,
} from '../utils/storage'
import { generateKnowledgeCommitMessage } from '../utils/knowledgeGit'
import { resolveKnowledgeGitProvider } from '../utils/storage'

export const KnowledgeReviewPage: FC<{ nested?: boolean }> = ({ nested = false }) => {
  const { knowledgeFiles, loadKnowledgeFiles, updateKnowledgeFile } = useKnowledgeStore()
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')

  const [isReviewOpen, setIsReviewOpen] = useState(false)
  const [reviewingKnowledge, setReviewingKnowledge] = useState<KnowledgeFile | null>(null)
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)

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

  const knowledgePathOf = (k: KnowledgeFile) =>
    k.filepath || (k.category ? `${k.category}/${k.name}` : k.name)

  const handleApprove = async () => {
    if (!reviewingKnowledge) return
    const filepath = knowledgePathOf(reviewingKnowledge)

    // 1) 状态置为 validated 并写盘
    const success = await updateKnowledgeFile(reviewingKnowledge.id, {
      status: 'validated',
      updatedAt: new Date().toISOString(),
    })
    if (!success) {
      addToast('审核失败，请重试', 'error')
      return
    }

    // 2) 提交到 .knowledges 独立仓库的固定分支 ocean-knowledge
    const status = await loadKnowledgeGitStatus()
    if (!status.managed) {
      addToast('审核通过', 'success')
      handleReviewClose()
      return
    }

    // 提交信息：LLM 开启且可用时用 LLM 生成，否则用默认信息
    let message = ''
    try {
      const gitConfig = await loadKnowledgeGitConfig()
      if (gitConfig.llmCommitMessageEnabled) {
        const resolved = await resolveKnowledgeGitProvider(gitConfig.llmProviderId, gitConfig.llmModel)
        if (resolved) {
          const [baselineRaw, currentRaw] = await Promise.all([
            loadKnowledgeBaseline(filepath),
            loadKnowledgeRawFile(filepath),
          ])
          const generated = await generateKnowledgeCommitMessage(
            resolved.provider,
            resolved.model,
            gitConfig.llmCommitMessagePrompt,
            baselineRaw,
            currentRaw.content ?? '',
          )
          if (generated) message = generated
        } else {
          addToast('未找到可用的 LLM，改用默认提交信息', 'warning')
        }
      }
    } catch (error) {
      console.error('生成提交信息失败，改用默认信息:', error)
    }

    const commitResult = await commitKnowledgeGit(filepath, message)
    if (commitResult.success) {
      addToast('审核通过', 'success')
      handleReviewClose()
    } else {
      addToast(`审核通过，但提交失败：${commitResult.error || '未知错误'}`, 'error')
      handleReviewClose()
    }
  }

  // 不审批：二次确认后回滚当前卡片的更新
  const handleRejectClick = () => {
    setRejectConfirmOpen(true)
  }

  const handleConfirmReject = async () => {
    setRejectConfirmOpen(false)
    if (!reviewingKnowledge) return
    const filepath = knowledgePathOf(reviewingKnowledge)
    const result = await rollbackKnowledgeGit(filepath)
    if (result.success) {
      addToast(result.action === 'deleted' ? '已撤销新增，文件已删除' : '已撤销更新，内容已回滚', 'success')
      await loadKnowledgeFiles()
      handleReviewClose()
    } else {
      addToast(`撤销失败：${result.error || '未知错误'}`, 'error')
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
        onReject={handleRejectClick}
      />

      {/* 不审批确认弹窗 */}
      <ConfirmModal
        isOpen={rejectConfirmOpen}
        title="确认不审批"
        message="将撤销这张知识卡片的本次更新：已存在的知识回滚到上一个版本；全新的知识将被删除。此操作不可恢复。"
        confirmText="确认撤销"
        cancelText="取消"
        onConfirm={handleConfirmReject}
        onCancel={() => setRejectConfirmOpen(false)}
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