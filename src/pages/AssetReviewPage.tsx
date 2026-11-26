import type { FC } from 'react'
import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, ShieldCheck, XCircle, FolderGit2, Bot, Wand2, Box, Folder, BookOpen } from 'lucide-react'
import { AssetReviewModal } from '../components/review/AssetReviewModal'
import { useReviewStore } from '../stores/reviewStore'
import { useToastStore } from '../stores/toastStore'
import { Card, Dropdown, Modal, Textarea, Button } from '../components/ui'
import type { PendingAssetItem } from '../utils/storage'
import {
  reviewApprove,
  reviewReject,
  reviewRestore,
  reviewDiscard,
} from '../utils/storage'

const typeLabels: Record<string, string> = {
  skill: '技能',
  agent: '智能体',
  node: '节点',
  resource: '资源文件',
  workflow: '工作流',
  knowledge: '知识',
}

const typeIcons: Record<string, typeof Box> = {
  skill: Wand2,
  agent: Bot,
  node: Box,
  resource: Folder,
  workflow: FolderGit2,
  knowledge: BookOpen,
}

// 资产卡片：结构与视觉对齐 KnowledgeCard（图标盒 + 17px 粗名 + 灰底信息块；G11：不展示路径）
const AssetCard: FC<{ asset: PendingAssetItem; onClick?: () => void }> = ({ asset, onClick }) => {
  const Icon = typeIcons[asset.type] || Box
  const isRejected = asset.reviewStatus === 'rejected'

  return (
    <Card
      className="group relative p-0 cursor-pointer h-full flex flex-col"
      onClick={onClick}
      hoverable={true}
    >
      {/* 头部区域 */}
      <div className="px-4 pb-0 pt-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 shrink-0">
              <Icon size={18} className="text-gray-600" strokeWidth={1.5} />
            </div>
            <h3 className="font-bold text-[17px] text-gray-900 truncate">{asset.name}</h3>
          </div>
        </div>

        {/* 标签区域 */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
            {typeLabels[asset.type] || asset.type}
          </span>
          {isRejected ? (
            <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs">
              已驳回
            </span>
          ) : asset.isNew ? (
            <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs">
              新建
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-xs">
              待审核
            </span>
          )}
          {!isRejected && asset.pendingCount > 1 && (
            <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-xs">
              待审 {asset.pendingCount} 版
            </span>
          )}
          {!isRejected && asset.mergeConflict && (
            <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs">
              冲突
            </span>
          )}
          {!isRejected && !asset.mergeConflict && asset.autoMerged && (
            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
              已自动合并
            </span>
          )}
          {!isRejected && !asset.mergeConflict && !asset.autoMerged && asset.baseStale && (
            <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-xs">
              基准已变
            </span>
          )}
        </div>
      </div>

      {/* 信息预览区 - 浅灰色背景 */}
      <div className="flex-1 mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
        {isRejected && asset.rejectReason ? (
          <p className="text-xs text-red-600 leading-relaxed line-clamp-2 mb-1.5">
            不通过理由：{asset.rejectReason}
          </p>
        ) : null}
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {asset.description || '暂无描述'}
        </p>
      </div>
    </Card>
  )
}

export const AssetReviewPage: FC = () => {
  const { reviewAssets, loading, loadReviewAssets, openReview, closeReview, reviewing, reviewModalOpen, lastAdopt } = useReviewStore()
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const prevAdoptRef = useRef<{ adopted: { type: string; name: string; kind: string }[]; restoredDeletions: string[] } | null>(null)
  useEffect(() => {
    loadReviewAssets()
  }, [loadReviewAssets])
  // 直改收编提示（H7/H8）：仅在结果与上一轮不同（且非空）时提示一次，避免每次加载重复弹
  useEffect(() => {
    if (!lastAdopt) return
    if (prevAdoptRef.current && prevAdoptRef.current.adopted === lastAdopt.adopted && prevAdoptRef.current.restoredDeletions === lastAdopt.restoredDeletions) return
    prevAdoptRef.current = lastAdopt
    if (lastAdopt.adopted.length > 0) {
      addToast(`检测到 ${lastAdopt.adopted.length} 处未经审核的直接修改，已转入审核队列`, 'info')
    }
    if (lastAdopt.restoredDeletions.length > 0) {
      addToast(`检测到 ${lastAdopt.restoredDeletions.length} 处正式文件被删除，已还原；如需删除请使用删除操作`, 'warning')
    }
  }, [lastAdopt, addToast])

  const statusOptions = useMemo(() => {
    const pendingCount = reviewAssets.filter((a) => a.reviewStatus === 'pending').length
    const rejectedCount = reviewAssets.length - pendingCount
    return [
      { value: '', label: `全部状态（${reviewAssets.length}）` },
      { value: 'pending', label: `待审核（${pendingCount}）` },
      { value: 'rejected', label: `已驳回（${rejectedCount}）` },
    ]
  }, [reviewAssets])

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of reviewAssets) {
      if (statusFilter && a.reviewStatus !== statusFilter) continue
      counts.set(a.type, (counts.get(a.type) || 0) + 1)
    }
    return [
      { value: '', label: '全部类型' },
      ...Object.entries(typeLabels)
        .filter(([type]) => counts.has(type))
        .map(([type, label]) => ({ value: type, label: `${label}（${counts.get(type)}）` })),
    ]
  }, [reviewAssets, statusFilter])

  const filteredAssets = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return reviewAssets.filter((a) => {
      if (statusFilter && a.reviewStatus !== statusFilter) return false
      if (typeFilter && a.type !== typeFilter) return false
      if (!q) return true
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        (a.rejectReason || '').toLowerCase().includes(q)
      )
    })
  }, [reviewAssets, searchQuery, typeFilter, statusFilter])

  const refreshAll = async () => {
    await loadReviewAssets()
  }

  // 审核通过：共享模块内完成正式落盘 + version+1 + git 提交 + skill/agent 自动物化
  const handleApprove = async (asset: PendingAssetItem) => {
    const result = await reviewApprove(asset.type, asset.name)
    if (result.success) {
      addToast(`审核通过（v${result.version ?? '-'}）`, 'success')
      closeReview()
      await refreshAll()
      return
    }
    // 基准漂移自动合并（H3 步骤 4）：草稿已并入最新改动，需再次确认——非错误，保持弹窗开着看合并结果
    if (result.needReReview) {
      addToast(result.message || '基线已变化，草稿已自动合并，请确认合并结果后再次审核通过', 'info')
      await refreshAll()
      return
    }
    // 合并冲突（H5）：草稿已写回冲突标记，人工处理或丢弃
    if (result.conflict) {
      addToast(result.error || '草稿与已通过版本存在合并冲突，请处理冲突标记或丢弃草稿', 'error')
      await refreshAll()
      return
    }
    addToast(`审核通过失败：${result.error || '未知错误'}`, 'error')
  }

  // 审核不通过：必填理由，写入最早 pending 快照（正式位置不动）
  const handleConfirmReject = async () => {
    const reason = rejectReason.trim()
    if (!reason) {
      addToast('请填写审核不通过的理由', 'warning')
      return
    }
    if (!reviewing) return
    const result = await reviewReject(reviewing.type, reviewing.name, reason)
    if (result.success) {
      addToast('已标记审核不通过，可在状态筛选「已驳回」中查看', 'success')
      setRejectConfirmOpen(false)
      setRejectReason('')
    } else {
      addToast(`操作失败：${result.error || '未知错误'}`, 'error')
      return
    }
    closeReview()
    await refreshAll()
  }

  // 已驳回 → 恢复待审
  const handleRestore = async () => {
    if (!reviewing) return
    const result = await reviewRestore(reviewing.type, reviewing.name)
    if (result.success) {
      addToast('已恢复待审核', 'success')
    } else {
      addToast(`操作失败：${result.error || '未知错误'}`, 'error')
      return
    }
    closeReview()
    await refreshAll()
  }

  // 丢弃冲突草稿（H5）：删除最早 pending 快照目录
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false)
  const handleConfirmDiscard = async () => {
    setDiscardConfirmOpen(false)
    if (!reviewing) return
    const result = await reviewDiscard(reviewing.type, reviewing.name)
    if (result.success) {
      addToast('已丢弃该草稿', 'success')
    } else {
      addToast(`丢弃失败：${result.error || '未知错误'}`, 'error')
      return
    }
    closeReview()
    await refreshAll()
  }

  const reviewingIsRejected = reviewing?.reviewStatus === 'rejected'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 页面头部：状态筛选 + 类型筛选 + 搜索（结构对齐各资产列表页） */}
      <div className="min-h-16 px-6 py-3 flex items-center justify-end flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Dropdown
            value={statusFilter}
            onChange={(v) => setStatusFilter(v || '')}
            placeholder="全部状态"
            options={statusOptions}
          />
          <Dropdown
            value={typeFilter}
            onChange={(v) => setTypeFilter(v || '')}
            placeholder="全部类型"
            options={typeOptions}
          />
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
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
      </div>

      {/* 页面内容 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-macos-text-tertiary">
            加载中...
          </div>
        ) : filteredAssets.length > 0 ? (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredAssets.map((asset) => (
                <AssetCard
                  key={`${asset.type}-${asset.name}-${asset.ts}`}
                  asset={asset}
                  onClick={() => openReview(asset)}
                />
              ))}
            </div>
          </div>
        ) : (
          /* 空状态 */
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              {statusFilter === 'rejected' ? (
                <XCircle size={32} className="text-macos-text-tertiary" />
              ) : (
                <ShieldCheck size={32} className="text-macos-text-tertiary" />
              )}
            </div>
            <div className="mt-3 text-sm text-macos-text-secondary">
              {statusFilter === 'rejected' ? '没有已驳回的资产' : '没有待审核资产'}
            </div>
          </div>
        )}
      </div>

      <AssetReviewModal
        isOpen={reviewModalOpen}
        onClose={closeReview}
        asset={reviewing}
        mode={reviewingIsRejected ? 'rejected' : 'pending'}
        onApprove={() => (reviewing ? handleApprove(reviewing) : Promise.resolve())}
        onReject={() => setRejectConfirmOpen(true)}
        onRestore={handleRestore}
        onDiscard={() => setDiscardConfirmOpen(true)}
      />

      <Modal
        layoutKey="asset-discard-confirm"
        isOpen={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title={`丢弃草稿：${reviewing?.name ?? ''}`}
        footer={
          <div className="flex justify-end items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDiscardConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConfirmDiscard}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              确认丢弃
            </Button>
          </div>
        }
      >
        <div className="text-xs text-macos-text-secondary">
          将删除 {reviewing?.name ?? ''} 最早进入队列的待审快照（不可恢复）；正式位置不受影响。
        </div>
      </Modal>

      <Modal
        layoutKey="asset-reject-reason"
        isOpen={rejectConfirmOpen}
        onClose={() => setRejectConfirmOpen(false)}
        title={`审核不通过：${reviewing?.name ?? ''}`}
        footer={
          <div className="flex justify-end items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejectConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!rejectReason.trim()}
              onClick={handleConfirmReject}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              确认不通过
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="text-xs text-macos-text-secondary">
            驳回将作用于最早进入队列的待审快照；正式位置不受影响，重新编辑会生成新的待审快照。
          </div>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="请填写审核不通过的理由（必填）"
            className="w-full text-sm"
          />
        </div>
      </Modal>
    </div>
  )
}
