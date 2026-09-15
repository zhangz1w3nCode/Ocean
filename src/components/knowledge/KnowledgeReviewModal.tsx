import type { FC } from 'react'
import { useEffect, useState } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { BookOpen, FolderOpen, ShieldCheck, Undo2, Loader2 } from 'lucide-react'
import { Modal, Button } from '../ui'
import type { KnowledgeFile } from '../../types'
import { loadKnowledgeBaseline, loadKnowledgeRawFile } from '../../utils/storage'

interface KnowledgeReviewModalProps {
  isOpen: boolean
  onClose: () => void
  knowledge: KnowledgeFile | null
  onApprove: () => Promise<void> | void
  onReject: () => Promise<void> | void
}

// 剥离 YAML 头，仅比较正文（diff 更聚焦内容变更）
const stripFrontmatter = (raw: string): string => {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(raw)
  return match ? raw.slice(match[0].length) : raw
}

export const KnowledgeReviewModal: FC<KnowledgeReviewModalProps> = ({
  isOpen,
  onClose,
  knowledge,
  onApprove,
  onReject,
}) => {
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [currentBody, setCurrentBody] = useState('')

  useEffect(() => {
    if (!isOpen || !knowledge) return
    let cancelled = false
    const filepath =
      knowledge.filepath ||
      (knowledge.category ? `${knowledge.category}/${knowledge.name}` : knowledge.name)

    setLoading(true)
    setBaseline(undefined)
    Promise.all([loadKnowledgeBaseline(filepath), loadKnowledgeRawFile(filepath)])
      .then(([base, current]) => {
        if (cancelled) return
        // 优先用磁盘当前原文；无原文时回退 store 中的正文
        setBaseline(base === null ? null : stripFrontmatter(base ?? ''))
        if (current.content !== null) {
          setCurrentBody(stripFrontmatter(current.content))
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, knowledge])

  if (!knowledge) return null

  const newValue = currentBody || knowledge.content || ''
  const hasBaseline = baseline !== null && baseline !== undefined

  return (
    <Modal
      layoutKey="knowledge-review"
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="xl"
      footer={
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={approving || rejecting}
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
              <Undo2 size={14} className="mr-1" />
              取消审核
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={approving || rejecting}
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
          </div>
        </div>
      }
    >
      {/* 头部信息 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-amber-50">
          <BookOpen size={28} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">{knowledge.name}</h2>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium bg-amber-50 text-amber-600">
              待审核
            </span>
            {knowledge.category && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                <FolderOpen size={10} />
                {knowledge.category}
              </span>
            )}
          </div>
          {knowledge.summary && (
            <p className="text-sm text-macos-text-secondary mt-2">{knowledge.summary}</p>
          )}
        </div>
      </div>

      {/* diff 区域 */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-macos-text">变更对比</span>
        </div>
        <div className="h-[420px] overflow-auto rounded-lg border border-gray-100">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-macos-text-tertiary">
              加载中…
            </div>
          ) : (
            <ReactDiffViewer
              oldValue={hasBaseline ? (baseline as string) : ''}
              newValue={newValue}
              splitView={true}
              useDarkTheme={false}
              hideLineNumbers={false}
              styles={{ contentText: { fontSize: '12px', fontFamily: 'monospace' } }}
            />
          )}
        </div>
      </div>
    </Modal>
  )
}