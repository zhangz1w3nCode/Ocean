import type { FC } from 'react'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, Pencil, Search, GitBranchPlus } from 'lucide-react'
import { Modal } from '../../ui/Modal'
import { useHarnessStore } from '../../../stores/harnessStore'
import type { HarnessSessionRuntime } from '../../../stores/harnessStore'
import type { HarnessWorktree, HarnessSessionSummary } from '../../../types'

function formatRelative(mtime: number): string {
  const diff = Date.now() - mtime
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时`
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}天`
  return new Date(mtime).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function worktreeLabel(wt: HarnessWorktree): { title: string; branch: string | null } {
  if (wt.isMain) return { title: '主工作树', branch: wt.branch }
  const idx = wt.path.lastIndexOf('.worktrees/')
  const name = idx >= 0 ? wt.path.slice(idx + '.worktrees/'.length) : wt.path.split('/').pop() ?? wt.path
  return { title: name, branch: wt.branch }
}

function sessionTitle(s: HarnessSessionSummary): string {
  return s.name || s.firstUserText || (s.timestamp ? new Date(s.timestamp).toLocaleString('zh-CN') : '未命名会话')
}

const StatusDot: FC<{ runtime?: HarnessSessionRuntime }> = ({ runtime }) => {
  if (!runtime) return <div className="w-1.5 h-1.5 rounded-full bg-macos-text-tertiary/40 shrink-0" />
  if (runtime.pendingApproval) return <div className="w-1.5 h-1.5 rounded-full bg-macos-warning shrink-0" title="待确认" />
  if (runtime.status === 'streaming' || runtime.isStreaming) return <div className="w-1.5 h-1.5 rounded-full bg-macos-warning animate-pulse shrink-0" title="运行中" />
  if (runtime.status === 'error') return <div className="w-1.5 h-1.5 rounded-full bg-macos-error shrink-0" title="错误" />
  if (runtime.status === 'closed') return <div className="w-1.5 h-1.5 rounded-full bg-macos-text-tertiary/40 shrink-0" title="已停止" />
  return <div className="w-1.5 h-1.5 rounded-full bg-macos-success shrink-0" title="就绪" />
}

const SessionRow: FC<{
  title: string
  runtime?: HarnessSessionRuntime
  meta: string
  isActive: boolean
  onClick: () => void
  onRename?: () => void
  onDelete?: () => void
  deleteLabel?: string
}> = ({ title, runtime, meta, isActive, onClick, onRename, onDelete, deleteLabel = '删除' }) => {
  return (
    <div
      className={`group relative flex items-center gap-2 pl-6 pr-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
        isActive ? 'bg-[#E8EAED] text-macos-text' : 'text-macos-text-secondary hover:bg-[#F0F1F3]'
      }`}
      onClick={onClick}
    >
      <StatusDot runtime={runtime} />
      <span className="flex-1 min-w-0 truncate">{title}</span>
      <span className="text-macos-text-tertiary text-[10px] shrink-0">{meta}</span>
      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
        {onRename && (
          <button
            onClick={(e) => { e.stopPropagation(); onRename() }}
            className="p-1 rounded hover:bg-black/5 text-macos-text-tertiary hover:text-macos-text"
            title="重命名"
          >
            <Pencil size={12} strokeWidth={1.5} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-black/5 text-macos-text-tertiary hover:text-macos-error"
            title={deleteLabel}
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  )
}

export const SessionPanel: FC<{ width: number }> = ({ width }) => {
  const worktrees = useHarnessStore((s) => s.worktrees)
  const worktreesError = useHarnessStore((s) => s.worktreesError)
  const sessionsByWorktree = useHarnessStore((s) => s.sessionsByWorktree)
  const runtimes = useHarnessStore((s) => s.runtimes)
  const activeSessionId = useHarnessStore((s) => s.activeSessionId)
  const startSession = useHarnessStore((s) => s.startSession)
  const openSession = useHarnessStore((s) => s.openSession)
  const stopSession = useHarnessStore((s) => s.stopSession)
  const deleteSessionFile = useHarnessStore((s) => s.deleteSessionFile)
  const refreshSessions = useHarnessStore((s) => s.refreshSessions)

  const [filter, setFilter] = useState('')
  // 分组三态：collapsed（完全收起，零会话行）/ preview（3 条 + 展开剩余）/ expanded（全部）
  const [groupState, setGroupState] = useState<Record<string, 'collapsed' | 'preview' | 'expanded'>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [wtName, setWtName] = useState('')
  const [wtBranch, setWtBranch] = useState('')
  const [wtBase, setWtBase] = useState('')
  const [baseOpen, setBaseOpen] = useState(false)
  const [baseActive, setBaseActive] = useState(0)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const createWorktree = useHarnessStore((s) => s.createWorktree)
  const branches = useHarnessStore((s) => s.branches)
  const currentBranch = useHarnessStore((s) => s.currentBranch)
  const loadBranches = useHarnessStore((s) => s.loadBranches)

  const groups = useMemo(() => {
    return worktrees
      .filter((wt) => !wt.bare)
      .map((wt) => {
        const label = worktreeLabel(wt)
        const runtime = Object.values(runtimes).find((rt) => rt.worktreePath === wt.path && rt.status !== 'closed')
        const sessions = (sessionsByWorktree[wt.path] ?? []).filter((s) =>
          filter ? sessionTitle(s).toLowerCase().includes(filter.toLowerCase()) : true
        )
        return { wt, label, runtime, sessions }
      })
  }, [worktrees, runtimes, sessionsByWorktree, filter])

  // 活跃会话的文件路径集合（历史列表里标记为活跃，不可重复打开）
  const activeSessionFiles = useMemo(() => {
    const set = new Set<string>()
    for (const rt of Object.values(runtimes)) {
      if (rt.status !== 'closed' && rt.sessionFile) set.add(rt.sessionFile)
    }
    return set
  }, [runtimes])

  const handleRename = (sessionId: string, current: string | null) => {
    const name = window.prompt('会话名称', current ?? '')
    if (name === null) return
    void useHarnessStore.getState().setSessionName(sessionId, name.trim())
  }

  const handleDelete = (file: string) => {
    if (!window.confirm('确定删除该会话文件？删除后不可恢复。')) return
    void deleteSessionFile(file).then((ok) => {
      if (!ok) window.alert('删除失败：会话可能正在运行')
    })
  }

  const handleCreateWorktree = async () => {
    const name = wtName.trim()
    if (!name || creating) return
    setCreating(true)
    setCreateError(null)
    const res = await createWorktree(name, wtBranch.trim() || undefined, wtBase.trim() || undefined)
    setCreating(false)
    if (res.success) {
      setCreateOpen(false)
      setWtName('')
      setWtBranch('')
      setWtBase('')
      setBaseOpen(false)
      if (res.path) setGroupState((g) => ({ ...g, [res.path as string]: 'preview' }))
    } else {
      setCreateError(res.error ?? '创建失败')
    }
  }

  // 来源分支候选：当前分支置顶，其余按搜索词过滤
  const flatBranches = useMemo(() => {
    const q = wtBase.trim().toLowerCase()
    const matched = branches.filter((b) => !q || b.toLowerCase().includes(q))
    const withoutCurrent = matched.filter((b) => b !== currentBranch)
    return currentBranch && (!q || currentBranch.toLowerCase().includes(q))
      ? [currentBranch, ...withoutCurrent]
      : withoutCurrent
  }, [branches, currentBranch, wtBase])

  return (
    <div style={{ width }} className="flex-shrink-0 h-full flex flex-col overflow-hidden">
      <div className="p-2 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5 px-1">
          <Search size={12} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="过滤会话"
            className="flex-1 min-w-0 bg-transparent text-xs text-macos-text placeholder:text-macos-text-tertiary outline-none"
          />
        </div>
        <button
          onClick={() => {
            setCreateOpen(true)
            void loadBranches()
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-lg text-xs font-medium text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED] transition-colors"
          title="新建 git worktree 工作区（输入工作区名、分支名与来源分支）"
        >
          <GitBranchPlus size={12} strokeWidth={1.5} />
          新建工作区
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-2 space-y-1">
        {worktreesError && (
          <div className="px-2 py-1.5 text-[11px] text-macos-error">{worktreesError}</div>
        )}
        {groups.map(({ wt, label, runtime, sessions }) => {
          const key = wt.path
          // 分组三态：collapsed 完全收起（零会话行）/ preview 3 条预览 / expanded 全部
          const state = groupState[key] ?? 'collapsed'
          const isCollapsed = state === 'collapsed'
          const visibleSessions = state === 'expanded' ? sessions : state === 'preview' ? sessions.slice(0, 3) : []
          const remainingCount = Math.max(0, sessions.length - 3)
          return (
            <div key={key} className="space-y-0.5">
              <div
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-xs text-macos-text hover:bg-[#F0F1F3] transition-colors"
                onClick={() => setGroupState((g) => ({ ...g, [key]: state === 'collapsed' ? 'preview' : 'collapsed' }))}
              >
                {isCollapsed ? <ChevronRight size={12} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" /> : <ChevronDown size={12} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" />}
                <span className="font-medium truncate flex-1 min-w-0" title={wt.path}>{label.title}</span>
                {label.branch && (
                  <span className="text-[10px] text-macos-text-tertiary shrink-0 max-w-24 truncate" title={label.branch}>
                    [{label.branch}]
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setGroupState((g) => ({ ...g, [key]: 'preview' })); void startSession(wt.path) }}
                  className="p-1 rounded hover:bg-black/5 text-macos-text-tertiary hover:text-macos-text shrink-0"
                  title="新建会话"
                >
                  <Plus size={12} strokeWidth={1.5} />
                </button>
              </div>

              {/* 活跃会话（进程运行中；完全收起时隐藏） */}
              {runtime && !isCollapsed && (
                <SessionRow
                  title={runtime.sessionName || `会话 ${runtime.sessionId.slice(-6)}`}
                  runtime={runtime}
                  meta={runtime.isStreaming ? '运行中' : formatRelative(runtime.startedAt)}
                  isActive={activeSessionId === runtime.sessionId}
                  onClick={() => useHarnessStore.getState().setActiveSession(runtime.sessionId)}
                  onRename={() => handleRename(runtime.sessionId, runtime.sessionName)}
                  deleteLabel="停止会话"
                  onDelete={() => void stopSession(runtime.sessionId).then(() => void refreshSessions(wt.path))}
                />
              )}

              {/* 历史会话（~/.pi/agent/sessions 扫描） */}
              {visibleSessions.map((s) => {
                const isThisActive = !!runtime && runtime.sessionFile === s.file
                const rtByFile = Object.values(runtimes).find((rt) => rt.sessionFile === s.file && rt.status !== 'closed')
                if (isThisActive) return null
                return (
                  <SessionRow
                    key={s.file}
                    title={sessionTitle(s)}
                    runtime={rtByFile}
                    meta={formatRelative(s.mtime)}
                    isActive={activeSessionId !== null && !!rtByFile && rtByFile.sessionId === activeSessionId}
                    onClick={() => {
                      if (rtByFile) {
                        useHarnessStore.getState().setActiveSession(rtByFile.sessionId)
                      } else if (activeSessionFiles.has(s.file)) {
                        window.alert('该会话已在运行中')
                      } else {
                        void openSession(s.file)
                      }
                    }}
                    onDelete={() => handleDelete(s.file)}
                  />
                )
              })}
              {state === 'preview' && remainingCount > 0 && (
                <button
                  onClick={() => setGroupState((g) => ({ ...g, [key]: 'expanded' }))}
                  className="w-full text-left pl-10 py-1 text-[11px] text-macos-text-tertiary hover:text-macos-text"
                >
                  展开剩余 {remainingCount} 个会话
                </button>
              )}
              {state === 'expanded' && remainingCount > 0 && (
                <button
                  onClick={() => setGroupState((g) => ({ ...g, [key]: 'preview' }))}
                  className="w-full text-left pl-10 py-1 text-[11px] text-macos-text-tertiary hover:text-macos-text"
                >
                  收起
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Modal
        layoutKey="harness-create-worktree"
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建工作区"
        size="sm"
        autoHeight
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-macos-text">工作区名称</label>
            <input
              value={wtName}
              onChange={(e) => setWtName(e.target.value)}
              placeholder="如 feature-x（将创建 .worktrees/feature-x）"
              className="w-full px-3 py-2 rounded-lg border border-macos-border bg-white text-sm text-macos-text placeholder:text-macos-text-tertiary outline-none focus:border-macos-text/30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-macos-text">来源分支</label>
            <div className="relative">
              <input
                value={wtBase}
                onChange={(e) => {
                  setWtBase(e.target.value)
                  setBaseOpen(true)
                  setBaseActive(0)
                }}
                onFocus={() => setBaseOpen(true)}
                onBlur={() => setTimeout(() => setBaseOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    if (baseOpen && flatBranches.length > 0) {
                      e.preventDefault()
                      const direction = e.key === 'ArrowDown' ? 1 : -1
                      setBaseActive((i) => (i + direction + flatBranches.length) % flatBranches.length)
                    }
                    return
                  }
                  if (e.key === 'Enter') {
                    if (baseOpen && flatBranches.length > 0) {
                      e.preventDefault()
                      setWtBase(flatBranches[baseActive] ?? flatBranches[0])
                      setBaseOpen(false)
                      return
                    }
                    void handleCreateWorktree()
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setBaseOpen(false)
                  }
                }}
                placeholder={currentBranch ? `搜索或输入，默认当前分支（${currentBranch}）` : '搜索或输入来源分支'}
                className="w-full px-3 py-2 rounded-lg border border-macos-border bg-white text-sm text-macos-text placeholder:text-macos-text-tertiary outline-none focus:border-macos-text/30"
              />
            </div>
            {baseOpen && flatBranches.length > 0 && (
              <div className="border border-macos-border rounded-lg max-h-40 overflow-y-auto bg-white">
                {flatBranches.map((b, i) => (
                  <button
                    key={b}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => setBaseActive(i)}
                    onClick={() => {
                      setWtBase(b)
                      setBaseOpen(false)
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                      i === baseActive ? 'bg-[#E8EAED] text-macos-text' : 'text-macos-text-secondary hover:bg-macos-bg'
                    }`}
                  >
                    <span className="flex-1 min-w-0 text-left truncate font-mono">{b}</span>
                    {b === currentBranch && (
                      <span className="shrink-0 text-[10px] text-macos-text-tertiary">当前</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-macos-text">分支名称</label>
            <input
              value={wtBranch}
              onChange={(e) => setWtBranch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void handleCreateWorktree()
              }}
              placeholder="留空默认 feat/<工作区名称>"
              className="w-full px-3 py-2 rounded-lg border border-macos-border bg-white text-sm text-macos-text placeholder:text-macos-text-tertiary outline-none focus:border-macos-text/30"
            />
          </div>
          {createError && <div className="text-xs text-macos-error">{createError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setCreateOpen(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED] transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => void handleCreateWorktree()}
              disabled={!wtName.trim() || creating}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-macos-text hover:opacity-80 transition-opacity disabled:opacity-40"
            >
              {creating ? '创建中…' : '创建'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
