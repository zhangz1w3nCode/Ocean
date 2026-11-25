import type { FC } from 'react'
import { useEffect, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { Loader2, ShieldCheck, Undo2, RotateCcw, AlertTriangle, Trash2 } from 'lucide-react'
import { Modal, Button } from '../ui'
import type { PendingAssetItem } from '../../utils/storage'
import { reviewDiff } from '../../utils/storage'

interface AssetReviewModalProps {
  isOpen: boolean
  onClose: () => void
  asset: PendingAssetItem | null
  /** 当前审核视图：pending=待审核（驳回/通过），rejected=已驳回（恢复待审） */
  mode: 'pending' | 'rejected'
  onApprove: () => Promise<void> | void
  onReject: () => Promise<void> | void
  onRestore?: () => Promise<void> | void
  /** 丢弃当前（最早 pending）快照——冲突草稿的出路之一（H5） */
  onDiscard?: () => Promise<void> | void
}

// 剥离 YAML 头，仅比较正文（diff 更聚焦内容变更）
const stripFrontmatter = (raw: string): string => {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(raw)
  return match ? raw.slice(match[0].length) : raw
}

export const AssetReviewModal: FC<AssetReviewModalProps> = ({
  isOpen,
  onClose,
  asset,
  mode,
  onApprove,
  onReject,
  onRestore,
  onDiscard,
}) => {
  const [formalBody, setFormalBody] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mergeConflict, setMergeConflict] = useState(false)
  const [autoMerged, setAutoMerged] = useState(false)
  const [baseStale, setBaseStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  useEffect(() => {
    if (!isOpen || !asset) return
    let cancelled = false

    setLoading(true)
    setFormalBody(null)
    reviewDiff(asset.type, asset.name)
      .then((r) => {
        if (cancelled) return
        if (r.success) {
          setIsNew(!!r.isNew)
          setVersion(r.version ?? null)
          setFormalBody(r.formal ? stripFrontmatter(r.formal) : null)
          setDraftBody(r.draft != null ? stripFrontmatter(r.draft) : r.content ? stripFrontmatter(r.content) : '')
          setMergeConflict(!!r.mergeConflict)
          setAutoMerged(!!r.autoMerged)
          setBaseStale(!!r.baseStale)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, asset])

  if (!asset) return null

  const hasBaseline = formalBody !== null
  const inConflict = mode === 'pending' && (mergeConflict || asset.mergeConflict === true)

  return (
    <Modal
      layoutKey="asset-review"
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'rejected' ? `已驳回资产：${asset.name}` : `审核资产：${asset.name}`}
      size="xl"
      footer={
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <div className="flex items-center gap-2">
            {mode === 'pending' ? (
              <>
                {inConflict ? (
                  // 冲突草稿（H5）：禁止通过，提供丢弃；正文含冲突标记供人工判断
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={discarding}
                    onClick={async () => {
                      setDiscarding(true)
                      try {
                        await onDiscard?.()
                      } finally {
                        setDiscarding(false)
                      }
                    }}
                    className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
                  >
                    {discarding ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Trash2 size={14} className="mr-1" />}
                    丢弃此草稿
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rejecting}
                      onClick={async () => {
                        setRejecting(true)
                        try {
                          await onReject()
                        } finally {
                          setRejecting(false)
                        }
                      }}
                      className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
                    >
                      {rejecting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Undo2 size={14} className="mr-1" />}
                      审核不通过
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={approving}
                      onClick={async () => {
                        setApproving(true)
                        try {
                          await onApprove()
                        } finally {
                          setApproving(false)
                        }
                      }}
                      className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
                    >
                      {approving ? (
                        <>
                          <Loader2 size={14} className="mr-1 animate-spin" />
                          处理中…
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={14} className="mr-1" />
                          审核通过
                        </>
                      )}
                    </Button>
                  </>
                )}
              </>
            ) : (
              // 已驳回资产不得直接流转到审核通过：仅可恢复待审后重新审核
              <Button
                variant="outline"
                size="sm"
                disabled={restoring}
                onClick={async () => {
                  setRestoring(true)
                  try {
                    await onRestore?.()
                  } finally {
                    setRestoring(false)
                  }
                }}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
              >
                {restoring ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RotateCcw size={14} className="mr-1" />}
                恢复待审
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-macos-text-secondary flex-wrap">
          <span className="px-2 py-0.5 bg-gray-100 rounded font-mono">{asset.type}</span>
          {mode === 'rejected' && (
            <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs">已驳回</span>
          )}
          {inConflict && (
            <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs">冲突</span>
          )}
          {!inConflict && autoMerged && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">已自动合并</span>
          )}
          {!isNew && version != null && (
            <span className="px-2 py-0.5 bg-gray-50 text-macos-text-tertiary rounded text-xs font-mono">v{version}</span>
          )}
          {asset.pendingCount > 1 && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-xs">待审 {asset.pendingCount} 版</span>
          )}
        </div>
        {mode === 'rejected' && asset.rejectReason && (
          <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 leading-relaxed">
            不通过理由：{asset.rejectReason}
          </div>
        )}
        {inConflict && (
          <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 leading-relaxed flex items-start gap-1.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              该草稿与已通过版本存在合并冲突（正文中的 <code className="bg-red-100 px-1 rounded">&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> / <code className="bg-red-100 px-1 rounded">=======</code> / <code className="bg-red-100 px-1 rounded">&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code> 标记处）。
              可在对应资产的编辑页修改草稿后重新审核（保存即视为冲突已处理），或丢弃此草稿。
            </div>
          </div>
        )}
        {!inConflict && autoMerged && (
          <div className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-macos-text-secondary leading-relaxed">
            此草稿已自动并入最新通过版本的改动，请确认合并结果后通过。
          </div>
        )}
        {!inConflict && !autoMerged && baseStale && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-600 leading-relaxed">
            草稿创建后正式版本已更新，点击「审核通过」时将自动合并，若无法自动合并会提示冲突。
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-macos-text-tertiary" />
          </div>
        ) : hasBaseline ? (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <ReactDiffViewer
              oldValue={formalBody ?? ''}
              newValue={draftBody}
              splitView
              useDarkTheme={false}
            />
          </div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 text-xs text-macos-text-secondary border-b border-gray-100">
              新建资产（正式位置尚无过审版本）
            </div>
            <pre className="p-3 text-xs whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{draftBody}</pre>
          </div>
        )}
      </div>
    </Modal>
  )
}
