import type { FC } from 'react'
import { useState, useEffect, useMemo } from 'react'
import { Search, ShieldCheck, XCircle, FolderGit2, Bot, Wand2, Box, Folder, ClipboardList, BookOpen, Code } from 'lucide-react'
import { AssetReviewModal } from '../components/review/AssetReviewModal'
import { useReviewStore } from '../stores/reviewStore'
import { useToastStore } from '../stores/toastStore'
import { Card, Dropdown, Modal, Textarea, Button } from '../components/ui'
import type { PendingAssetItem } from '../utils/storage'
import {
  reviewApprove,
  reviewReject,
  reviewRestore,
} from '../utils/storage'

const typeLabels: Record<string, string> = {
  skill: '技能',
  agent: '智能体',
  node: '节点',
  resource: '资源文件',
  workflow: '工作流',
  task: '任务',
  knowledge: '知识',
  codebase: '代码库',
}

const typeIcons: Record<string, typeof Box> = {
  skill: Wand2,
  agent: Bot,
  node: Box,
  resource: Folder,
  workflow: FolderGit2,
  task: ClipboardList,
  knowledge: BookOpen,
  codebase: Code,
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
  const { reviewAssets, loading, loadReviewAssets, openReview, closeReview, reviewing, reviewModalOpen } = useReviewStore()
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    loadReviewAssets()
  }, [loadReviewAssets])

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
    } else {
      addToast(`审核通过失败：${result.error || '未知错误'}`, 'error')
      return
    }
    closeReview()
    await refreshAll()
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

  const reviewingIsRejected = reviewing?.reviewStatus === 'rejected'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 页面头部：状态筛选 + 类型筛选 + 搜索（结构对齐各资产列表页） */}
      <div className="h-16 px-6 flex items-center justify-end">
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
      />

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
