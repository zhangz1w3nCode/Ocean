import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw,
  Pause,
  Play,
  Trash2,
  RotateCcw,
  XCircle,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '../components/ui'
import { useToastStore } from '../stores/toastStore'
import { useAppStore } from '../stores/appStore'
import { useCompileStore } from '../stores/compileStore'
import { KnowledgeDetailModal } from '../components/knowledge'
import { loadKnowledgeRawFile, parseKnowledgeFrontmatter } from '../utils/storage'
import type { KnowledgeFile } from '../types'
import type { KnowledgeCompileTask } from '../utils/storage'

// ── 状态元数据（对齐工作流实例页的三态配色风格）──
const STATUS_META: Record<string, { label: string; icon: typeof Clock; className: string; dot: string }> = {
  pending: { label: '排队中', icon: Clock, className: 'text-amber-600 bg-amber-50 border-amber-200', dot: 'bg-amber-400' },
  processing: { label: '编译中', icon: Loader2, className: 'text-blue-600 bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  done: { label: '已完成', icon: CheckCircle2, className: 'text-green-600 bg-green-50 border-green-200', dot: 'bg-emerald-500' },
  failed: { label: '失败', icon: AlertCircle, className: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500' },
  cancelled: { label: '已取消', icon: Ban, className: 'text-gray-500 bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'done' | 'failed' | 'cancelled'

const FILTER_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '排队中' },
  { id: 'processing', label: '编译中' },
  { id: 'done', label: '已完成' },
  { id: 'failed', label: '失败' },
  { id: 'cancelled', label: '已取消' },
]

const formatTime = (ts: number) => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 列表行（对齐实例页行布局：状态点/源文件/阶段/状态徽章/时间）──
const TaskRow: FC<{ task: KnowledgeCompileTask; onOpen: () => void }> = ({ task, onOpen }) => {
  const { retry, cancel } = useCompileStore()
  const meta = STATUS_META[task.status] || STATUS_META.pending
  const StatusIcon = meta.icon
  const spinning = task.status === 'processing'

  return (
    <div
      className="flex items-center px-3 py-3 gap-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer group"
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
        <span className="text-sm text-macos-text truncate" title={task.sourceName}>
          {task.sourceName}
        </span>
      </div>
      <span className="flex-1 min-w-0 text-xs text-macos-text-secondary truncate text-center" title={task.error || task.detail || ''}>
        {task.status === 'failed' && task.error ? task.error.slice(0, 40) : (task.detail || '-')}
      </span>
      <div className="flex-1 min-w-0 flex justify-center">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-xs ${meta.className}`}>
          <StatusIcon size={12} className={spinning ? 'animate-spin' : ''} />
          {meta.label}
          {task.status === 'failed' && task.retryCount ? ` ${task.retryCount}次` : ''}
        </span>
      </div>
      <span className="flex-1 min-w-0 text-xs text-macos-text-tertiary text-center">
        {formatTime(task.addedAt)}
      </span>
      <div
        className="flex items-center gap-1 flex-shrink-0 w-16 justify-end"
        onClick={(e) => e.stopPropagation()}
      >
        {(task.status === 'failed' || task.status === 'cancelled') && (
          <Button variant="ghost" size="sm" onClick={() => void retry(task.id)} title="重新编译">
            <RotateCcw size={14} />
          </Button>
        )}
        {(task.status === 'pending' || task.status === 'processing') && (
          <Button variant="ghost" size="sm" onClick={() => void cancel(task.id)} title="取消任务">
            <XCircle size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}

// ── 详情视图（对齐实例页 DetailField 风格）──
const DetailField: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start gap-3 py-1.5">
    <span className="w-20 flex-shrink-0 text-xs text-macos-text-tertiary text-right">{label}</span>
    <div className="flex-1 min-w-0 text-sm text-macos-text break-all">{children}</div>
  </div>
)

const TaskDetail: FC<{ task: KnowledgeCompileTask }> = ({ task }) => {
  const { retry, cancel } = useCompileStore()
  const meta = STATUS_META[task.status] || STATUS_META.pending
  const StatusIcon = meta.icon
  const { setKnowledgeSubPage } = useAppStore()
  const [previewKnowledge, setPreviewKnowledge] = useState<KnowledgeFile | null>(null)

  // 复用知识库详情弹窗：从产卡路径加载原文并构造 KnowledgeFile
  const openCardPreview = async (cardPath: string) => {
    const { content, mtime } = await loadKnowledgeRawFile(cardPath)
    if (content === null) {
      setPreviewKnowledge(null)
      return
    }
    const { metadata, body } = parseKnowledgeFrontmatter(content)
    const tags = Array.isArray(metadata.tags)
      ? metadata.tags.map((t: unknown) => String(t))
      : typeof metadata.tags === 'string' && metadata.tags
        ? String(metadata.tags).replace(/^\[|\]$/g, '').split(',').map((t) => t.trim()).filter(Boolean)
        : []
    setPreviewKnowledge({
      id: cardPath,
      name: String(metadata.name || cardPath.split('/').pop() || ''),
      type: 'knowledge',
      summary: String(metadata.summary || ''),
      content: body,
      tags,
      status: metadata.status === 'validated' ? 'validated' : 'pending',
      category: cardPath.includes('/') ? cardPath.slice(0, cardPath.lastIndexOf('/')) : undefined,
      filepath: cardPath,
      rawFrontmatter: metadata,
      createdAt: mtime || new Date().toISOString(),
      updatedAt: mtime || new Date().toISOString(),
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 max-w-4xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <FileText size={20} className="text-macos-text-tertiary flex-shrink-0" />
          <h2 className="text-lg font-semibold text-macos-text truncate">{task.sourceName}</h2>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-xs ${meta.className}`}>
            <StatusIcon size={12} className={task.status === 'processing' ? 'animate-spin' : ''} />
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(task.status === 'failed' || task.status === 'cancelled') && (
            <Button variant="outline" size="sm" onClick={() => void retry(task.id)}>
              <RotateCcw size={14} />
              <span className="ml-1">重新编译</span>
            </Button>
          )}
          {(task.status === 'pending' || task.status === 'processing') && (
            <Button variant="outline" size="sm" onClick={() => void cancel(task.id)}>
              <XCircle size={14} />
              <span className="ml-1">取消</span>
            </Button>
          )}
        </div>
      </div>

      <div className="bg-gray-50/60 border border-gray-100 rounded-xl px-4 py-3 mb-4">
        <DetailField label="源文件">{task.sourceName}</DetailField>
        <DetailField label="状态">
          <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${meta.className}`}>{meta.label}</span>
        </DetailField>
        <DetailField label="当前阶段">{task.phase || '-'}</DetailField>
        <DetailField label="详情">{task.detail || '-'}</DetailField>
        {task.error && (
          <DetailField label="错误">
            <span className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1 block">{task.error}</span>
          </DetailField>
        )}
        <DetailField label="重试次数">{task.retryCount ?? 0}</DetailField>
        <DetailField label="入队时间">{formatTime(task.addedAt)}</DetailField>
        {task.finishedAt && <DetailField label="完成时间">{formatTime(task.finishedAt)}</DetailField>}
        <DetailField label="任务 ID">
          <span className="text-xs font-mono">{task.id}</span>
        </DetailField>
      </div>

      {task.cards && task.cards.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-macos-text-secondary">产出知识卡（{task.cards.length}）</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setKnowledgeSubPage('review')}
              title="前往知识审核页处理 pending 卡"
            >
              前往审核
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {task.cards.map((c) => (
              <div
                key={c}
                className="flex items-center gap-2 bg-emerald-50/60 border border-emerald-100 rounded-lg px-3 py-2 cursor-pointer hover:bg-emerald-50"
                onClick={() => void openCardPreview(c)}
                title="点击预览知识卡"
              >
                <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                <span className="text-sm text-emerald-800 truncate">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <KnowledgeDetailModal
        isOpen={previewKnowledge !== null}
        onClose={() => setPreviewKnowledge(null)}
        onEdit={() => {
          setPreviewKnowledge(null)
          setKnowledgeSubPage('review')
        }}
        knowledge={previewKnowledge}
      />
    </div>
  )
}

// ── 顶部任务多 tab（参考实例页 InstanceTabs，简化不做拖拽排序）──
const TaskTab: FC<{ task: KnowledgeCompileTask; isActive: boolean }> = ({ task, isActive }) => {
  const { closeDetail, openDetail } = useCompileStore()
  const meta = STATUS_META[task.status] || STATUS_META.pending
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors flex-shrink-0 ${
        isActive ? 'bg-white text-macos-text shadow-sm border border-gray-200' : 'text-macos-text-secondary hover:bg-gray-100 hover:text-macos-text'
      }`}
      onClick={() => openDetail(task.id)}
    >
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
      <span className="max-w-40 truncate">{task.sourceName}</span>
      <button
        className="ml-1 text-macos-text-tertiary hover:text-gray-700 flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          closeDetail(task.id)
        }}
        title="关闭"
      >
        <X size={12} />
      </button>
    </div>
  )
}

export const KnowledgeCompilePage: FC<{ nested?: boolean }> = ({ nested = false }) => {
  const { addToast } = useToastStore()
  const { setKnowledgeSubPage } = useAppStore()
  const {
    tasks,
    summary,
    paused,
    openDetailIds,
    activeDetailId,
    refresh,
    startListening,
    openDetail,
    showList,
    pause,
    resume,
    clearFinished,
  } = useCompileStore()
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    refresh()
    const unsubscribe = startListening()
    return unsubscribe
  }, [refresh, startListening])

  const filtered = useMemo(() => {
    const list = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)
    return [...list].sort((a, b) => (sortDesc ? b.addedAt - a.addedAt : a.addedAt - b.addedAt))
  }, [tasks, filter, sortDesc])

  const openTabs = useMemo(
    () => openDetailIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as KnowledgeCompileTask[],
    [openDetailIds, tasks],
  )
  const activeTask = activeDetailId ? tasks.find((t) => t.id === activeDetailId) : null

  const countOf = (id: StatusFilter) =>
    id === 'all' ? tasks.length : tasks.filter((t) => t.status === id).length

  const content = (
    <>
      {/* 顶部 tab 栏：列表 tab + 已打开的任务 tab（参考工作流实例页） */}
      <div className="h-16 px-6 flex items-center justify-between gap-4 border-b border-gray-100">
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 py-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors flex-shrink-0 ${
              activeDetailId === null ? 'bg-white text-macos-text shadow-sm border border-gray-200' : 'text-macos-text-secondary hover:bg-gray-100 hover:text-macos-text'
            }`}
            onClick={showList}
          >
            <FileText size={12} />
            任务列表
          </div>
          {openTabs.map((t) => (
            <TaskTab key={t.id} task={t} isActive={activeDetailId === t.id} />
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {paused ? (
            <Button variant="outline" size="sm" onClick={() => void resume()} className="rounded-lg">
              <Play size={14} />
              <span className="ml-1">恢复队列</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void pause()}
              className="rounded-lg"
              disabled={tasks.length === 0}
            >
              <Pause size={14} />
              <span className="ml-1">暂停队列</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()} className="rounded-lg" title="刷新">
            <RefreshCw size={14} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void clearFinished()}
            className="rounded-lg"
            title="清除已完成与已取消"
            disabled={countOf('done') + countOf('cancelled') === 0}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* 内容区：列表视图或详情视图 */}
      {activeTask ? (
        <TaskDetail task={activeTask} />
      ) : (
        <>
          {/* 状态筛选 tab */}
          <div className="px-6 pt-4 flex items-center gap-2">
            {FILTER_TABS.map((t) => (
              <button
                key={t.id}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                  filter === t.id
                    ? 'bg-white text-macos-text shadow-sm border-gray-200'
                    : 'text-macos-text-secondary hover:bg-gray-100 border-transparent'
                }`}
                onClick={() => setFilter(t.id)}
              >
                {t.label}
                <span className="ml-1 text-macos-text-tertiary">{countOf(t.id)}</span>
              </button>
            ))}
            {paused && <span className="ml-2 text-xs text-amber-600">队列已暂停</span>}
          </div>

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {filtered.length > 0 ? (
              <div className="w-full">
                <div className="flex items-center px-3 py-2.5 gap-4 text-xs font-medium text-macos-text-tertiary border-b border-gray-100">
                  <span className="flex-1 min-w-0 text-center">源文件</span>
                  <span className="flex-1 min-w-0 text-center">阶段 / 详情</span>
                  <span className="flex-1 min-w-0 text-center">状态</span>
                  <button
                    className="flex-1 min-w-0 flex items-center justify-center gap-1 cursor-pointer hover:text-macos-text transition-colors"
                    onClick={() => setSortDesc(!sortDesc)}
                  >
                    入队时间
                    {sortDesc ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                  </button>
                  <span className="w-16 flex-shrink-0" />
                </div>
                {filtered.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={() => openDetail(t.id)} />
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                  <FileText size={32} className="text-macos-text-tertiary" strokeWidth={1.5} />
                </div>
                <p className="text-sm text-macos-text-tertiary mt-4">
                  {tasks.length === 0 ? '暂无加工任务' : '当前筛选下无任务'}
                </p>
                {tasks.length === 0 && (
                  <Button
                    variant="outline"
                    onClick={() => setKnowledgeSubPage('source')}
                    className="mt-4 bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 rounded-lg py-2 text-sm"
                  >
                    去知识源页面发起编译
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  )

  if (nested) return <div className="h-full flex flex-col bg-white">{content}</div>
  return <div className="h-full flex flex-col bg-white">{content}</div>
}
