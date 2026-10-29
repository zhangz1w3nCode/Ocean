import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText, FileCode, FileJson, RefreshCw, Loader2 } from 'lucide-react'
import { useHarnessStore, loadHarnessModule } from '../../../stores/harnessStore'

interface DirEntry {
  name: string
  type: 'file' | 'directory'
}

interface LevelProps {
  dirPath: string
  depth: number
  levels: Record<string, DirEntry[]>
  loading: Record<string, boolean>
  expanded: Record<string, boolean>
  onToggle: (dirPath: string) => void
  onOpenFile: (filePath: string) => void
}

const fileIcon = (name: string): typeof FileText => {
  if (/\.(ts|tsx|js|jsx|cjs|mjs|css|html|vue|svelte)$/i.test(name)) return FileCode
  if (/\.json$/i.test(name)) return FileJson
  return FileText
}

const Level: FC<LevelProps> = ({ dirPath, depth, levels, loading, expanded, onToggle, onOpenFile }) => {
  const entries = levels[dirPath]
  const isLoading = !!loading[dirPath]

  if (!entries) {
    if (isLoading) {
      return (
        <div style={{ paddingLeft: depth * 12 + 10 }} className="py-1.5 pr-2">
          <Loader2 size={11} strokeWidth={1.5} className="animate-spin text-macos-text-tertiary" />
        </div>
      )
    }
    return null
  }

  return (
    <>
      {entries.map((entry) => {
        const childPath = `${dirPath}/${entry.name}`
        const isExpanded = !!expanded[childPath]
        const Icon = entry.type === 'directory' ? (isExpanded ? FolderOpen : Folder) : fileIcon(entry.name)
        return (
          <div key={entry.name}>
            <button
              onClick={() => (entry.type === 'directory' ? onToggle(childPath) : onOpenFile(childPath))}
              className="w-full flex items-center gap-1 py-1 pr-2 rounded-md text-xs text-macos-text-secondary hover:text-macos-text hover:bg-macos-bg transition-colors text-left"
              style={{ paddingLeft: depth * 12 + 8 }}
              title={childPath}
            >
              {entry.type === 'directory' ? (
                isExpanded ? (
                  <ChevronDown size={11} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" />
                ) : (
                  <ChevronRight size={11} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" />
                )
              ) : (
                <span className="w-[11px] shrink-0" />
              )}
              <Icon size={12} strokeWidth={1.5} className={`shrink-0 ${entry.type === 'directory' ? 'text-macos-text-tertiary' : 'text-macos-accent/70'}`} />
              <span className="truncate">{entry.name}</span>
            </button>
            {entry.type === 'directory' && isExpanded && (
              <Level
                dirPath={childPath}
                depth={depth + 1}
                levels={levels}
                loading={loading}
                expanded={expanded}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// 工作区文件浏览器（DSH sidebar-files 模式：懒加载目录树 + 点击文件在预览 Tab 打开）
export const FileBrowser: FC = () => {
  const runtime = useHarnessStore((s) => (s.activeSessionId ? s.runtimes[s.activeSessionId] : undefined))
  const openFileViewer = useHarnessStore((s) => s.openFileViewer)
  const root = runtime?.worktreePath
  const [levels, setLevels] = useState<Record<string, DirEntry[]>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const loadDir = useCallback(async (dirPath: string) => {
    const sessionId = useHarnessStore.getState().activeSessionId
    if (!sessionId) return
    setLoading((l) => ({ ...l, [dirPath]: true }))
    const res = await loadHarnessModule()?.listSessionDir?.(sessionId, dirPath)
    setLoading((l) => ({ ...l, [dirPath]: false }))
    if (!res || !res.success) {
      setError(res?.error ?? '读取目录失败')
      return
    }
    setError(null)
    setLevels((lv) => ({ ...lv, [dirPath]: res.entries ?? [] }))
  }, [])

  // 切换会话（root 变化）时重置树
  useEffect(() => {
    setLevels({})
    setExpanded({})
    setError(null)
    if (root) void loadDir(root)
  }, [root, loadDir])

  const toggle = useCallback(
    (dirPath: string) => {
      setExpanded((e) => {
        const willOpen = !e[dirPath]
        if (willOpen && !levels[dirPath]) void loadDir(dirPath)
        return { ...e, [dirPath]: willOpen }
      })
    },
    [levels, loadDir]
  )

  const openFile = useCallback(
    (filePath: string) => {
      const sessionId = useHarnessStore.getState().activeSessionId
      if (sessionId) void openFileViewer(sessionId, filePath)
    },
    [openFileViewer]
  )

  if (!runtime?.sessionId || !root) {
    return <div className="p-3 text-xs text-macos-text-tertiary">当前会话无工作区路径</div>
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-2.5 py-1.5 border-b border-macos-border/60 flex items-center gap-1.5 text-[10px] text-macos-text-tertiary shrink-0">
        <span className="flex-1 truncate font-mono" title={root}>
          {root}
        </span>
        <button
          onClick={() => {
            setLevels({})
            void loadDir(root)
          }}
          className="p-1 rounded hover:bg-macos-bg text-macos-text-tertiary hover:text-macos-text transition-colors shrink-0"
          title="重新加载"
        >
          <RefreshCw size={11} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5 px-1">
        {error && <div className="px-2 py-1.5 text-xs text-macos-error">{error}</div>}
        <Level
          dirPath={root}
          depth={0}
          levels={levels}
          loading={loading}
          expanded={expanded}
          onToggle={toggle}
          onOpenFile={openFile}
        />
      </div>
    </div>
  )
}
