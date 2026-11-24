import type { FC } from 'react'
import { useEffect, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { Loader2, ShieldCheck, Undo2, RotateCcw } from 'lucide-react'
import { Modal, Button } from '../ui'
import type { PendingAssetItem } from '../../utils/storage'
import {
  loadAssetBaselineFromLocal,
  loadAssetRawFromLocal,
} from '../../utils/storage'

interface AssetReviewModalProps {
  isOpen: boolean
  onClose: () => void
  asset: PendingAssetItem | null
  /** 当前审核视图：pending=待审核（驳回/通过），rejected=已驳回（恢复待审/通过） */
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
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [currentBody, setCurrentBody] = useState('')

  useEffect(() => {
    if (!isOpen || !asset) return
    let cancelled = false

    setLoading(true)
    setBaseline(undefined)
    Promise.all([loadAssetBaselineFromLocal(asset.refPath), loadAssetRawFromLocal(asset.refPath)])
      .then(([base, current]) => {
        if (cancelled) return
        setBaseline(base === null ? null : stripFrontmatter(base ?? ''))
        if (current !== null) {
          setCurrentBody(stripFrontmatter(current))
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

  const hasBaseline = baseline !== null && baseline !== undefined

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
          <span className="font-mono">{asset.refPath}</span>
          {mode === 'rejected' && (
            <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs">已驳回</span>
          )}
          {asset.version != null && (
            <span className="px-2 py-0.5 bg-gray-50 text-macos-text-tertiary rounded text-xs font-mono">v{asset.version}</span>
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
              oldValue={baseline ?? ''}
              newValue={currentBody}
              splitView
              useDarkTheme={false}
            />
          </div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-gray-50 text-xs text-macos-text-secondary border-b border-gray-100">
              新资产（无 git 基线）
            </div>
            <pre className="p-3 text-xs whitespace-pre-wrap max-h-[50vh] overflow-y-auto">{currentBody}</pre>
          </div>
        )}
      </div>
    </Modal>
  )
}
