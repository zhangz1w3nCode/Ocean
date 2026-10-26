import type { FC } from 'react'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, RefreshCw, FileWarning, Folder, PanelLeft, GitBranch, Plus } from 'lucide-react'
import { useHarnessStore } from '../../../stores/harnessStore'
import { MarkdownRenderer } from '../../ui/MarkdownRenderer/MarkdownRenderer'
import { FileBrowser } from './FileBrowser'
import { GitChanges } from './GitChanges'
import { DiffView } from './DiffView'
import { CodeHighlight } from './CodeHighlight'
import { MarkdownWithFrontmatter } from './MarkdownWithFrontmatter'

const MAX_RENDER_CHARS = 200 * 1024

// 右侧文件预览面板（对齐 DSH 文件查看器：路径栏 + 内容渲染 + 刷新/关闭）
// 由消息流中的文件路径链接点击触发
export const FileViewer: FC<{ width: number; onResizeStart: (e: React.MouseEvent) => void }> = ({ width, onResizeStart }) => {
  const fileViewer = useHarnessStore((s) => s.fileViewer)
  const fileViewerOpen = useHarnessStore((s) => s.fileViewerOpen)
  const filePanelTab = useHarnessStore((s) => s.filePanelTab)
  const setFilePanelTab = useHarnessStore((s) => s.setFilePanelTab)
  const closePreviewTab = useHarnessStore((s) => s.closePreviewTab)
  const filesTabOpen = useHarnessStore((s) => s.filesTabOpen)
  const closeFilesTab = useHarnessStore((s) => s.closeFilesTab)
  const openFilesTab = useHarnessStore((s) => s.openFilesTab)
  const diffMode = useHarnessStore((s) => s.diffMode)
  const refreshFileViewer = useHarnessStore((s) => s.refreshFileViewer)
  const closeFileViewer = useHarnessStore((s) => s.closeFileViewer)
  const [error, setError] = useState<string | null>(null)

  const fv = fileViewer
  const hasFile = !!fv && fv.path !== ''
  const isDiff = fv?.mode === 'diff'
  const isMarkdown = fv && fv.mode === 'content' ? /\.((md|markdown)|txt)$/i.test(fv.path) : false
  const segments = fv ? fv.path.split('/').filter(Boolean) : []
  const fileName = segments[segments.length - 1] ?? (fv?.path ?? '')
  const content = fv && fv.content.length > MAX_RENDER_CHARS
    ? fv.content.slice(0, MAX_RENDER_CHARS) + '\n\n…（内容过长，仅显示前 200KB）'
    : (fv?.content ?? '')

  const handleRefresh = async () => {
    setError(null)
    const err = await refreshFileViewer()
    if (err) setError(err)
  }

  return (
    <AnimatePresence initial={false}>
      {fileViewerOpen && (
        <motion.div
          key="harness-file-viewer"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex-shrink-0 h-full flex items-stretch overflow-hidden"
          style={{ width }}
        >
          {/* 分割线：聊天主区 ↔ 文件预览（可拖拽调宽，对齐知识目录页） */}
          <div
            onMouseDown={onResizeStart}
            title="拖动调整宽度"
            className="w-px flex-shrink-0 bg-gray-200 hover:bg-gray-300 transition-colors cursor-col-resize relative group"
          >
            <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
          </div>

          <div className="flex-1 min-w-[280px] h-full flex flex-col">
      {/* Tab 条（DSH DockLayout 模式：Git 变更钉死 Tab + 文件浏览 Tab + 预览 chip + 折叠按钮） */}
      <div className="h-9 px-1.5 border-b border-macos-border/70 flex items-center gap-1 shrink-0">
        <button
          onClick={() => setFilePanelTab('git')}
          className={`h-7 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
            filePanelTab === 'git' ? 'bg-[#E8EAED] text-macos-text font-medium' : 'text-macos-text-secondary hover:bg-macos-bg'
          }`}
        >
          <GitBranch size={12} strokeWidth={1.5} />
          Git 变更
        </button>

        {filesTabOpen && (
        <div
          className={`h-7 pr-1 pl-2.5 rounded-md text-xs flex items-center gap-1 transition-colors ${
            filePanelTab === 'files' ? 'bg-[#E8EAED] text-macos-text font-medium' : 'text-macos-text-secondary hover:bg-macos-bg'
          }`}
        >
          <button onClick={() => setFilePanelTab('files')} className="flex items-center gap-1.5">
            <Folder size={12} strokeWidth={1.5} />
            文件
          </button>
          <button
            onClick={closeFilesTab}
            className="w-4 h-4 rounded-full flex items-center justify-center text-macos-text-tertiary hover:text-macos-text hover:bg-black/10 shrink-0"
            title="关闭文件浏览"
          >
            <X size={10} strokeWidth={1.8} />
          </button>
        </div>
        )}
        {!filesTabOpen && (
          <button
            onClick={openFilesTab}
            className="w-6 h-6 rounded-md grid place-items-center text-macos-text-tertiary hover:text-macos-text hover:bg-macos-bg transition-colors shrink-0"
            title="打开文件浏览"
          >
            <Plus size={11} strokeWidth={1.8} />
          </button>
        )}
        {hasFile && (
          <div
            className={`h-7 px-1.5 pl-2.5 rounded-md text-xs flex items-center gap-1 max-w-56 transition-colors ${
              filePanelTab === 'preview' ? 'bg-[#E8EAED] text-macos-text font-medium' : 'text-macos-text-secondary hover:bg-macos-bg'
            }`}
          >
            <button onClick={() => setFilePanelTab('preview')} className="max-w-44 truncate" title={fv?.path}>
              {fileName}
            </button>
            <button
              onClick={closePreviewTab}
              className="w-4 h-4 rounded-full flex items-center justify-center text-macos-text-tertiary hover:text-macos-text hover:bg-black/10 shrink-0"
              title="关闭预览"
            >
              <X size={10} strokeWidth={1.8} />
            </button>
          </div>
        )}
        <div className="flex-1" />
        {filePanelTab === 'preview' && hasFile && (
          <button
            onClick={() => void handleRefresh()}
            className="p-1.5 rounded-lg text-macos-text-tertiary hover:text-macos-text hover:bg-macos-bg transition-colors shrink-0"
            title="重新读取"
          >
            <RefreshCw size={13} strokeWidth={1.5} />
          </button>
        )}
        <button
          onClick={closeFileViewer}
          className="p-1.5 rounded-lg text-macos-text-tertiary hover:text-macos-text hover:bg-macos-bg transition-colors shrink-0"
          title="收起面板"
        >
          <PanelLeft size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* 内容区：Git 变更 / 文件浏览 / 文件预览 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {filePanelTab === 'git' ? (
          <GitChanges />
        ) : filePanelTab === 'files' ? (
          <FileBrowser />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {error ? (
              <div className="p-3 flex items-start gap-2 text-xs text-macos-error">
                <FileWarning size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : isDiff ? (
              <DiffView diff={content} mode={diffMode} />
            ) : isMarkdown ? (
              <div className="px-4 py-3">
                <MarkdownWithFrontmatter content={content} />
              </div>
            ) : (
              <CodeHighlight code={content} filePath={fv?.path ?? ''} />
            )}
          </div>
        )}
      </div>

      {/* 底部状态行 */}
      {hasFile && filePanelTab === 'preview' && (
        <div className="px-3 py-1.5 border-t border-macos-border/70 text-[10px] text-macos-text-tertiary shrink-0 flex items-center justify-between">
          <span>{(fv?.content.length ?? 0).toLocaleString()} 字符</span>
          <span className="truncate ml-2" title={fv?.path}>{fv?.path}</span>
        </div>
      )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
