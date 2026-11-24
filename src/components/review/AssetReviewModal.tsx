import type { FC } from 'react'
import { useEffect, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { Loader2, ShieldCheck, Undo2, RotateCcw } from 'lucide-react'
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
}) => {
  const [formalBody, setFormalBody] = useState<string | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [restoring, setRestoring] = useState(false)

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
