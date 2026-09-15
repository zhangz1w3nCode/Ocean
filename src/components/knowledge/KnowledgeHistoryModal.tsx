import type { FC } from 'react'
import { useEffect, useState, useCallback } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { History, GitCommit } from 'lucide-react'
import { Modal, Button } from '../ui'
import type { KnowledgeFile } from '../../types'
import {
  loadKnowledgeGitLog,
  loadKnowledgeGitShow,
  loadKnowledgeRawFile,
  type KnowledgeGitCommit,
} from '../../utils/storage'

interface KnowledgeHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  knowledge: KnowledgeFile | null
}

// 剥离 YAML 头，仅比较正文（与审核弹窗保持一致）
const stripFrontmatter = (raw: string): string => {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(raw)
  return match ? raw.slice(match[0].length) : raw
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
}

export const KnowledgeHistoryModal: FC<KnowledgeHistoryModalProps> = ({
  isOpen,
  onClose,
  knowledge,
}) => {
  const [commits, setCommits] = useState<KnowledgeGitCommit[]>([])
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [baselineBody, setBaselineBody] = useState('')
  const [currentBody, setCurrentBody] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDiff, setLoadingDiff] = useState(false)

  const filepath = knowledge
    ? knowledge.filepath || (knowledge.category ? `${knowledge.category}/${knowledge.name}` : knowledge.name)
    : ''

  // 加载提交历史 + 当前磁盘正文
  useEffect(() => {
    if (!isOpen || !knowledge) return
    let cancelled = false
    setLoadingList(true)
    setSelectedHash(null)
    setBaselineBody('')
    Promise.all([loadKnowledgeGitLog(filepath), loadKnowledgeRawFile(filepath)])
      .then(([log, current]) => {
        if (cancelled) return
        setCommits(log)
        setCurrentBody(stripFrontmatter(current.content ?? ''))
        setSelectedHash(log.length > 0 ? log[0].hash : null)
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false)
      })
    return () => { cancelled = true }
  }, [isOpen, knowledge, filepath])

  // 加载选中版本的原文
  const loadDiffFor = useCallback(async (hash: string) => {
    setLoadingDiff(true)
    try {
      const raw = await loadKnowledgeGitShow(filepath, hash)
      setBaselineBody(stripFrontmatter(raw ?? ''))
    } finally {
      setLoadingDiff(false)
    }
  }, [filepath])

  useEffect(() => {
    if (!selectedHash) {
      setBaselineBody('')
      return
    }
    loadDiffFor(selectedHash)
  }, [selectedHash, loadDiffFor])

  if (!knowledge) return null

  return (
    <Modal
      layoutKey="knowledge-history"
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="xl"
      footer={
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      {/* 头部信息 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100">
          <History size={28} className="text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">{knowledge.name}</h2>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium bg-gray-100 text-gray-600">
              历史版本
            </span>
            <span className="text-sm text-macos-text-tertiary">共 {commits.length} 个版本</span>
          </div>
        </div>
      </div>

      {loadingList ? (
        <div className="h-[420px] flex items-center justify-center text-sm text-macos-text-tertiary">
          加载中…
        </div>
      ) : commits.length === 0 ? (
        <div className="h-[420px] flex flex-col items-center justify-center text-center">
          <GitCommit size={28} className="text-macos-text-tertiary" />
          <p className="mt-3 text-sm text-macos-text-tertiary">暂无历史版本</p>
        </div>
      ) : (
        <div className="flex gap-4 h-[480px]">
          {/* 左侧：提交列表 */}
          <div className="w-64 flex-shrink-0 overflow-y-auto rounded-lg border border-gray-100">
            {commits.map((commit) => {
              const isActive = commit.hash === selectedHash
              return (
                <button
                  key={commit.hash}
                  onClick={() => setSelectedHash(commit.hash)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors ${
                    isActive ? 'bg-[#E5E7EB]' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="text-xs font-medium text-macos-text truncate" title={commit.subject}>
                    {commit.subject}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-macos-text-tertiary">
                    <span className="font-mono">{commit.hash.slice(0, 7)}</span>
                    <span>{formatDate(commit.date)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-macos-text-tertiary truncate">
                    {commit.author}
                  </div>
                </button>
              )
            })}
          </div>

          {/* 右侧：选中版本 ↔ 当前内容 diff */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-macos-text">版本对比（该版本 → 当前内容）</span>
              {selectedHash && (
                <span className="text-xs text-macos-text-tertiary font-mono">{selectedHash.slice(0, 7)}</span>
              )}
            </div>
            <div className="flex-1 overflow-auto rounded-lg border border-gray-100">
              {loadingDiff ? (
                <div className="h-full flex items-center justify-center text-sm text-macos-text-tertiary">
                  加载中…
                </div>
              ) : (
                <ReactDiffViewer
                  oldValue={baselineBody}
                  newValue={currentBody}
                  splitView={true}
                  useDarkTheme={false}
                  hideLineNumbers={false}
                  styles={{ contentText: { fontSize: '12px', fontFamily: 'monospace' } }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
