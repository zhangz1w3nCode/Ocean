import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { GitBranch, RefreshCw, ChevronDown, ChevronRight, Loader2, GitCommitHorizontal, MoreHorizontal, List, FolderTree, Columns2, Rows3 } from 'lucide-react'
import { useHarnessStore, type GitChangeFile } from '../../../stores/harnessStore'

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case 'A':
      return 'bg-macos-success/15 text-macos-success'
    case 'M':
      return 'bg-macos-warning/15 text-macos-warning'
    case 'D':
      return 'bg-macos-error/15 text-macos-error'
    case 'U':
      return 'bg-indigo-500/15 text-indigo-600'
    default:
      return 'bg-gray-400/15 text-macos-text-secondary'
  }
}

const fileIconClass = (status: string): string => {
  switch (status) {
    case 'A':
      return 'text-macos-success/70'
    case 'D':
      return 'text-macos-error/70'
    case 'U':
      return 'text-indigo-500/70'
    default:
      return 'text-macos-text-tertiary'
  }
}

const ChangeRow: FC<{ file: GitChangeFile; source: 'branch' | 'worktree'; onOpenDiff: (path: string, source: 'branch' | 'worktree') => void; treeMode?: boolean; depth?: number }> = ({ file, source, onOpenDiff, treeMode = false, depth = 0 }) => {
  const name = file.path.split('/').pop() ?? file.path
  const dir = file.path.split('/').slice(0, -1).join('/')
  return (
    <button
      onClick={() => onOpenDiff(file.path, source)}
      className="w-full flex items-center gap-1.5 py-1 pr-2 rounded-md text-xs text-left transition-colors hover:bg-macos-bg group"
      style={treeMode ? { paddingLeft: depth * 12 + 24 } : undefined}
      title={file.path}
    >
      <span className={`w-4 text-center text-[11px] font-medium shrink-0 rounded-sm px-0.5 ${statusBadgeClass(file.status)}`}>
        {file.status}
      </span>
      {treeMode ? (
        <span className="min-w-0 flex-1 truncate text-macos-text-secondary group-hover:text-macos-text">{name}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">
          <span className="text-macos-text-secondary group-hover:text-macos-text">{name}</span>
          {dir && <span className="text-macos-text-tertiary ml-1.5 text-[10px]">{dir}</span>}
        </span>
      )}
      {file.additions != null && file.additions > 0 && (
        <span className="text-macos-success text-[10px] tabular-nums shrink-0">+{file.additions}</span>
      )}
      {file.deletions != null && file.deletions > 0 && (
        <span className="text-macos-error text-[10px] tabular-nums shrink-0">-{file.deletions}</span>
      )}
    </button>
  )
}

const Section: FC<{
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}> = ({ title, count, collapsed, onToggle, children }) => (
  <div className="border-b border-macos-border/50 last:border-b-0">
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-macos-text-secondary hover:bg-macos-bg/60 transition-colors"
    >
      {collapsed ? <ChevronRight size={11} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" /> : <ChevronDown size={11} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" />}
      <span className="font-medium">{title}</span>
      <span className="text-[10px] text-macos-text-tertiary tabular-nums">{count}</span>
    </button>
    {!collapsed && <div className="pb-1.5">{children}</div>}
  </div>
)

const FileTree: FC<{
  files: GitChangeFile[]
  source: 'branch' | 'worktree'
  onOpenDiff: (path: string, source: 'branch' | 'worktree') => void
}> = ({ files, source, onOpenDiff }) => {
  // 构建目录树：按路径段聚合
  type TreeNode = { name: string; children: Map<string, TreeNode>; file?: GitChangeFile }
  const root: TreeNode = { name: '', children: new Map() }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.children.has(seg)) node.children.set(seg, { name: seg, children: new Map() })
      node = node.children.get(seg)!
    }
    const fileName = parts[parts.length - 1]
    node.children.set(fileName, { name: fileName, children: new Map(), file: f })
  }

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const entries = [...node.children.entries()].sort(([a, av], [b, bv]) => {
      const aDir = !av.file
      const bDir = !bv.file
      if (aDir !== bDir) return aDir ? -1 : 1
      return a.localeCompare(b, 'en', { numeric: true })
    })
    return entries.map(([name, child]) => {
      if (child.file) {
        return <ChangeRow key={name} file={child.file} source={source} onOpenDiff={onOpenDiff} treeMode depth={depth} />
      }
      return (
        <div key={name}>
          <div
            className="flex items-center gap-1.5 py-1 pr-2 rounded-md text-xs text-macos-text-secondary hover:bg-macos-bg transition-colors cursor-default"
            style={{ paddingLeft: depth * 12 + 24 }}
          >
            <ChevronDown size={11} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
            <FolderTree size={12} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
            <span className="truncate">{name}</span>
            <span className="ml-auto text-[10px] text-macos-text-tertiary tabular-nums shrink-0">
              {countFiles(child)}
            </span>
          </div>
          {renderNode(child, depth + 1)}
        </div>
      )
    })
  }

  const countFiles = (node: TreeNode): number => {
    let count = 0
    for (const child of node.children.values()) {
      if (child.file) count += 1
      else count += countFiles(child)
    }
    return count
  }

  return <div className="px-1.5">{renderNode(root, 0)}</div>
}

// Git 变更 Tab（对齐 DSH 源代码管理面板）：分支对比 + 提交时间线 + 分支变更/工作区变更
export const GitChanges: FC = () => {
  const gitStatus = useHarnessStore((s) => s.gitStatus)
  const gitStatusLoading = useHarnessStore((s) => s.gitStatusLoading)
  const gitStatusError = useHarnessStore((s) => s.gitStatusError)
  const loadGitStatus = useHarnessStore((s) => s.loadGitStatus)
  const gitBaseBranch = useHarnessStore((s) => s.gitBaseBranch)
  const setGitBaseBranch = useHarnessStore((s) => s.setGitBaseBranch)
  const branches = useHarnessStore((s) => s.branches)
  const loadBranches = useHarnessStore((s) => s.loadBranches)
  const openFileDiff = useHarnessStore((s) => s.openFileDiff)
  const [baseOpen, setBaseOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const viewMode = useHarnessStore((s) => s.gitViewMode)
  const setViewMode = useHarnessStore((s) => s.setGitViewMode)
  const diffMode = useHarnessStore((s) => s.diffMode)
  const setDiffMode = useHarnessStore((s) => s.setDiffMode)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)

  useEffect(() => {
    void loadGitStatus()
    void loadBranches()
  }, [loadGitStatus, loadBranches])

  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  const openDiff = (filePath: string, source: 'branch' | 'worktree') => {
    const sessionId = useHarnessStore.getState().activeSessionId
    if (sessionId) void openFileDiff(sessionId, filePath, source)
  }

  const baseOptions = useMemo(() => {
    const list = branches.filter((b) => b !== gitStatus?.current)
    return gitBaseBranch && !list.includes(gitBaseBranch) ? [gitBaseBranch, ...list] : list
  }, [branches, gitBaseBranch, gitStatus?.current])

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* 分支对比栏 */}
      <div className="px-2.5 py-2 border-b border-macos-border/60 flex items-center gap-1.5 text-xs shrink-0">
        <GitBranch size={12} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
        <span className="font-medium text-macos-text truncate max-w-28" title={gitStatus?.current ?? ''}>
          {gitStatus?.current ?? '…'}
        </span>
        <span className="text-macos-text-tertiary shrink-0">→</span>
        <div className="relative">
          <button
            onClick={() => setBaseOpen((o) => !o)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-macos-text-secondary hover:bg-macos-bg hover:text-macos-text transition-colors max-w-36"
            title="选择对比基线分支"
          >
            <span className="truncate">{gitBaseBranch}</span>
            <ChevronDown size={10} strokeWidth={1.5} className="shrink-0" />
          </button>
          {baseOpen && (
            <div className="absolute top-full mt-1 left-0 z-20 w-48 max-h-56 overflow-y-auto rounded-lg border border-macos-border bg-white shadow-lg py-1" onMouseDown={(e) => e.stopPropagation()}>
              {baseOptions.length === 0 && <div className="px-3 py-2 text-xs text-macos-text-tertiary">无其他分支</div>}
              {baseOptions.map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setBaseOpen(false)
                    if (b !== gitBaseBranch) setGitBaseBranch(b)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs truncate font-mono transition-colors ${
                    b === gitBaseBranch ? 'bg-[#E8EAED] text-macos-text' : 'text-macos-text-secondary hover:bg-macos-bg'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {gitStatus && (gitStatus.ahead > 0 || gitStatus.behind > 0) && (
          <span className="flex items-center gap-1.5 text-[10px] tabular-nums shrink-0">
            {gitStatus.ahead > 0 && <span className="text-macos-success font-medium">↑{gitStatus.ahead}</span>}
            {gitStatus.behind > 0 && <span className="text-macos-text-tertiary">↓{gitStatus.behind}</span>}
          </span>
        )}
        <button
          onClick={() => void loadGitStatus()}
          className="p-1 rounded hover:bg-macos-bg text-macos-text-tertiary hover:text-macos-text transition-colors shrink-0"
          title="刷新"
        >
          {gitStatusLoading ? <Loader2 size={11} strokeWidth={1.5} className="animate-spin" /> : <RefreshCw size={11} strokeWidth={1.5} />}
        </button>
        <div className="relative">
          <button
            onClick={() => setViewMenuOpen((o) => !o)}
            className="p-1 rounded hover:bg-macos-bg text-macos-text-tertiary hover:text-macos-text transition-colors shrink-0"
            title="查看选项"
          >
            <MoreHorizontal size={11} strokeWidth={1.8} />
          </button>
          {viewMenuOpen && (
            <div
              className="absolute top-full right-0 mt-1.5 z-20 w-60 rounded-xl border border-macos-border bg-white shadow-xl py-2"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-3 pb-1 text-[10px] font-medium text-macos-text-tertiary tracking-wide">文件展示</div>
              <div className="px-1.5 space-y-0.5">
                {([
                  { key: 'tree', label: '文件树', hint: '按目录层级展示', icon: FolderTree },
                  { key: 'list', label: '列表', hint: '平铺全部文件', icon: List },
                ] as const).map(({ key, label, hint, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setViewMode(key)
                      setViewMenuOpen(false)
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      viewMode === key ? 'bg-[#E8EAED]' : 'hover:bg-macos-bg'
                    }`}
                  >
                    <Icon size={13} strokeWidth={1.5} className={`shrink-0 ${viewMode === key ? 'text-macos-text' : 'text-macos-text-tertiary'}`} />
                    <span className="flex-1 text-left">
                      <span className={`block font-medium ${viewMode === key ? 'text-macos-text' : 'text-macos-text-secondary'}`}>{label}</span>
                      <span className="block text-[10px] text-macos-text-tertiary leading-tight">{hint}</span>
                    </span>
                    {viewMode === key && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-macos-success" />}
                  </button>
                ))}
              </div>

              <div className="px-3 pt-2.5 pb-1 text-[10px] font-medium text-macos-text-tertiary tracking-wide border-t border-macos-border/40 mt-2">Diff 格式</div>
              <div className="px-1.5 space-y-0.5">
                {([
                  { key: 'inline', label: '内连', hint: '上下顺序展示增删行', icon: Rows3 },
                  { key: 'split', label: '并排', hint: '左栏旧版 · 右栏新版', icon: Columns2 },
                ] as const).map(({ key, label, hint, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setDiffMode(key)
                      setViewMenuOpen(false)
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      diffMode === key ? 'bg-[#E8EAED]' : 'hover:bg-macos-bg'
                    }`}
                  >
                    <Icon size={13} strokeWidth={1.5} className={`shrink-0 ${diffMode === key ? 'text-macos-text' : 'text-macos-text-tertiary'}`} />
                    <span className="flex-1 text-left">
                      <span className={`block font-medium ${diffMode === key ? 'text-macos-text' : 'text-macos-text-secondary'}`}>{label}</span>
                      <span className="block text-[10px] text-macos-text-tertiary leading-tight">{hint}</span>
                    </span>
                    {diffMode === key && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-macos-success" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {gitStatusError && <div className="px-2.5 py-2 text-xs text-macos-error">{gitStatusError}</div>}
        {gitStatusLoading && !gitStatus && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-macos-text-tertiary">
            <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
            正在读取 git 信息…
          </div>
        )}
        {gitStatus && (
          <>
            <Section title="提交" count={gitStatus.commits.length} collapsed={!!collapsed.commits} onToggle={() => toggle('commits')}>
              {gitStatus.commits.length === 0 && <div className="px-2.5 py-1 text-[11px] text-macos-text-tertiary">领先基线分支 0 个提交</div>}
              <div className="relative px-2.5">
                {gitStatus.commits.map((line, i) => (
                  <div key={i} className="relative flex items-start gap-2 py-0.5 pl-0.5">
                    <span className="relative z-10 mt-0.5 shrink-0">
                      <GitCommitHorizontal size={11} strokeWidth={1.8} className={i === 0 ? 'text-macos-warning' : 'text-macos-text-tertiary'} />
                    </span>
                    <span className="text-[11px] text-macos-text-secondary truncate" title={line}>
                      {line.length > 60 ? `${line.slice(0, 60)}…` : line}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="分支变更" count={gitStatus.branchFiles.length} collapsed={!!collapsed.branch} onToggle={() => toggle('branch')}>
              {gitStatus.branchFiles.length === 0 && <div className="px-2.5 py-1 text-[11px] text-macos-text-tertiary">与基线分支无差异</div>}
              {viewMode === 'tree' ? (
                <FileTree files={gitStatus.branchFiles} source="branch" onOpenDiff={openDiff} />
              ) : (
                <div className="px-1.5">
                  {gitStatus.branchFiles.map((f) => (
                    <ChangeRow key={f.path} file={f} source="branch" onOpenDiff={openDiff} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="工作区变更" count={gitStatus.worktreeFiles.length} collapsed={!!collapsed.worktree} onToggle={() => toggle('worktree')}>
              {gitStatus.worktreeFiles.length === 0 && <div className="px-2.5 py-1 text-[11px] text-macos-text-tertiary">工作区干净</div>}
              {viewMode === 'tree' ? (
                <FileTree files={gitStatus.worktreeFiles} source="worktree" onOpenDiff={openDiff} />
              ) : (
                <div className="px-1.5">
                  {gitStatus.worktreeFiles.map((f) => (
                    <ChangeRow key={f.path} file={f} source="worktree" onOpenDiff={openDiff} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
