import { useState, useEffect, useMemo, useCallback, useRef, type FC } from 'react'
import {
  FolderOpen, FolderClosed, FileText,
  Eye, PencilLine, Save, FileQuestion, Code,
  Network,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { MarkdownEditor, MarkdownRenderer } from '../components/ui'
import { mermaidBlocks } from '../components/ui/MarkdownRenderer'
import { AtomicCodeMirrorEditor, wikiLinks } from '@atomic-editor/editor'
import { languages as codeLanguages } from '@codemirror/language-data'
import '@atomic-editor/editor/styles.css'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useKnowledgeGraph } from '../hooks/useKnowledgeGraph'
import { RelatedKnowledgePanel } from '../components/knowledge/RelatedKnowledgePanel'
import { useToastStore } from '../stores/toastStore'
import {
  loadKnowledgeRawFile, saveKnowledgeRawFile, isElectron,
  splitKnowledgeRawFile, joinKnowledgeRawFile,
  type KnowledgeFolder,
} from '../utils/storage'

interface TreeNode {
  name: string
  /** 目录为相对 .knowledges 的路径；文件为去掉 .md 的相对路径（即 KnowledgeFile.filepath） */
  path: string
  kind: 'folder' | 'file'
  children: TreeNode[]
}

/** 把「目录树 + 文件相对路径」合并成一棵可渲染的树 */
function buildTree(folders: KnowledgeFolder[], filePaths: string[]): TreeNode[] {
  const root: TreeNode[] = []

  const ensureFolder = (segments: string[]): TreeNode[] => {
    let level = root
    for (const seg of segments) {
      let found = level.find((n) => n.kind === 'folder' && n.name === seg)
      if (!found) {
        const path = segments.slice(0, segments.indexOf(seg) + 1).join('/')
        found = { name: seg, path, kind: 'folder', children: [] }
        level.push(found)
      }
      level = found.children
    }
    return level
  }

  const addFolder = (folder: KnowledgeFolder, ancestors: string[]) => {
    const level = ensureFolder([...ancestors, folder.name])
    for (const child of folder.children) addFolder(child, [...ancestors, folder.name])
  }
  for (const f of folders) addFolder(f, [])

  for (const fp of filePaths) {
    const lastSlash = fp.lastIndexOf('/')
    const dir = lastSlash > 0 ? fp.substring(0, lastSlash) : ''
    const fileName = lastSlash > 0 ? fp.substring(lastSlash + 1) : fp
    const level = dir ? ensureFolder(dir.split('/')) : root
    if (!level.some((n) => n.kind === 'file' && n.path === fp)) {
      level.push({ name: fileName, path: fp, kind: 'file', children: [] })
    }
  }

  const sortRecursive = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach((n) => sortRecursive(n.children))
  }
  sortRecursive(root)
  return root
}

/**
 * 在 frontmatter 原文字面量中设置 status 字段：
 * 已有 status 行则替换，否则在闭合 --- 之前插入；无 frontmatter 时原样返回。
 */
function setFrontmatterStatus(frontmatter: string, status: string): string {
  if (!frontmatter) return frontmatter
  if (/^status:.*$/m.test(frontmatter)) {
    return frontmatter.replace(/^status:.*$/m, `status: ${status}`)
  }
  const close = frontmatter.lastIndexOf('---')
  if (close <= 0) return frontmatter
  return `${frontmatter.slice(0, close)}status: ${status}\n${frontmatter.slice(close)}`
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  expanded: Set<string>
  selectedPath: string | null
  onToggle: (path: string) => void
  onSelectFile: (path: string) => void
}

const TreeRow: FC<TreeRowProps> = ({
  node, depth, expanded, selectedPath, onToggle, onSelectFile,
}) => {
  const isFolder = node.kind === 'folder'
  const isOpen = expanded.has(node.path)
  const isSelected = !isFolder && selectedPath === node.path

  return (
    <>
      <button
        onClick={() => (isFolder ? onToggle(node.path) : onSelectFile(node.path))}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`w-full flex items-center gap-1.5 pr-2 py-1 rounded text-left text-sm transition-colors ${
          isSelected
            ? 'bg-[#E5E7EB] text-macos-text'
            : 'text-macos-text-secondary hover:bg-[#E8EAED] hover:text-macos-text'
        }`}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <FolderOpen size={14} className="flex-shrink-0 text-macos-text-tertiary" />
            ) : (
              <FolderClosed size={14} className="flex-shrink-0 text-macos-text-tertiary" />
            )}
          </>
        ) : (
          <FileText size={14} className="flex-shrink-0 text-macos-text-tertiary" />
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {isFolder &&
        isOpen &&
        node.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={onToggle}
            onSelectFile={onSelectFile}
          />
        ))}
    </>
  )
}

/**
 * 知识目录：左侧 .knowledges 文件树 + 右侧 Markdown 编辑区（Obsidian 式）
 * 读写均走文件原文，绕开 frontmatter 解析，保证回写逐字节保真。
 */
export const KnowledgeCatalogPage: FC = () => {
  const { knowledgeFiles, loadKnowledgeFiles } = useKnowledgeStore()
  // 图谱数据及其自带的 validated 知识列表：与 graphData 出自同一次 memo，
  // 节点 id 天然一致，用于反查邻居知识的 filepath 做跳转
  const { graphData, knowledgeFiles: graphKnowledges } = useKnowledgeGraph()
  const { addToast } = useToastStore()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [body, setBody] = useState('')
  // 当前文件开头 YAML 头的**原文字面量**：编辑区不展示它，写盘时原样拼回
  const frontmatterRef = useRef('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'wysiwyg'>('wysiwyg')
  // 「相关知识」图谱面板默认关闭
  const [showRelatedGraph, setShowRelatedGraph] = useState(false)
  // 「相关知识」栏宽度，可由左边缘拖拽调整
  const [relatedWidth, setRelatedWidth] = useState(380)
  const [treeWidth, setTreeWidth] = useState(224)

  const startTreeResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const container = (e.currentTarget as HTMLElement).parentElement
    if (!container) return
    const left = container.getBoundingClientRect().left
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      setTreeWidth(Math.max(160, Math.min(480, ev.clientX - left)))
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // 「相关知识」栏左边缘拖拽：右边缘固定，所以向左拖变宽
  const startRelatedResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const panel = (e.currentTarget as HTMLElement).parentElement
    if (!panel) return
    const right = panel.getBoundingClientRect().right
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      setRelatedWidth(Math.max(300, Math.min(760, right - ev.clientX)))
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])
  const tree = useMemo(() => {
    // 知识目录仅展示已审核通过（validated）的知识
    const filePaths = Array.from(
      new Set(
        knowledgeFiles
          .filter((k) => k.status === 'validated')
          .map((k) => k.filepath)
          .filter((p): p is string => !!p),
      ),
    )
    return buildTree([], filePaths)
  }, [knowledgeFiles])

  // 目录树与文件列表都来自磁盘，切回本 tab 时重新拉取
  useEffect(() => {
    if (!isElectron()) return
    loadKnowledgeFiles()
  }, [loadKnowledgeFiles])

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleSelectFile = useCallback(async (path: string) => {
    // 先把内容读到位再切选中项：实时编辑器只在挂载那一刻读 markdownSource，
    // 先 setSelectedPath 会让编辑器拿到上一个文件（首次则是空）的内容
    const { content } = await loadKnowledgeRawFile(path)
    const { frontmatter, body: bodyOnly } = splitKnowledgeRawFile(content ?? '')
    frontmatterRef.current = frontmatter
    setBody(bodyOnly.replace(/^\n+/, ''))
    setSelectedPath(path)
    setDirty(false)
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value)
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!selectedPath) return
    setSaving(true)
    // 更新即视为新内容：状态回退为待审核（INDEX.md 为系统生成的全局索引，不参与审核）
    const isIndex = (selectedPath.split('/').pop() || '').toLowerCase() === 'index'
    const nextFrontmatter = isIndex
      ? frontmatterRef.current
      : setFrontmatterStatus(frontmatterRef.current, 'pending')
    const success = await saveKnowledgeRawFile(
      selectedPath,
      joinKnowledgeRawFile(nextFrontmatter, body),
    )
    frontmatterRef.current = nextFrontmatter
    setSaving(false)
    if (success) {
      setDirty(false)
      addToast('已保存，状态已置为待审核', 'success')
      // 让知识库/知识图谱 tab 与本 tab 数据一致
      await loadKnowledgeFiles()
    } else {
      addToast('保存失败，请重试', 'error')
    }
  }, [selectedPath, body, addToast, loadKnowledgeFiles])

  const hasTree = tree.length > 0

  return (
    <div className="flex-1 flex min-h-0 gap-1 p-4 overflow-hidden">
      {/* 左侧文件树 */}
      <div className="flex-shrink-0 h-full overflow-y-auto py-2 px-2 rounded-lg [&::-webkit-scrollbar]:hidden" style={{ width: treeWidth }}>
        {hasTree ? (
          tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              expanded={expanded}
              selectedPath={selectedPath}
              onToggle={handleToggle}
              onSelectFile={handleSelectFile}
            />
          ))
        ) : (
          <div className="h-full flex items-center justify-center">
            <FileQuestion size={28} className="text-macos-text-tertiary" />
          </div>
        )}
      </div>
      <div
        className="w-px flex-shrink-0 bg-gray-200 hover:bg-gray-300 transition-colors cursor-col-resize relative group"
        onMouseDown={startTreeResize}
      >
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
      </div>

      {/* 右侧编辑区 */}
      <div className="flex-1 flex flex-col min-h-0 rounded-lg overflow-hidden">
        <div className="h-12 px-4 flex items-center justify-end flex-shrink-0">
          {selectedPath && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {([
                { mode: 'edit' as const, icon: PencilLine, label: '编辑' },
                { mode: 'wysiwyg' as const, icon: Code, label: '实时编辑' },
                { mode: 'preview' as const, icon: Eye, label: '预览' },
              ]).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
                    viewMode === mode
                      ? 'bg-[#E5E7EB] border border-gray-300 text-gray-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
              <button
                onClick={() => setShowRelatedGraph((prev) => !prev)}
                title={showRelatedGraph ? '收起相关知识' : '展开相关知识'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors ${
                  showRelatedGraph
                    ? 'bg-[#E5E7EB] border border-gray-300 text-gray-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Network size={15} />
                <span>相关知识</span>
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200"
              >
                <Save size={15} />
                <span>保存</span>
              </button>
            </div>
          )}
        </div>

        {/* 整块滚动，编辑器不固定高度 */}
        <div className={`flex-1 min-h-0 ${viewMode === 'wysiwyg' ? 'overflow-hidden px-4' : 'overflow-y-auto px-4 pb-4'}`}>
          {!selectedPath ? (
            <div className="h-full flex items-center justify-center">
              <FileQuestion size={32} className="text-macos-text-tertiary" />
            </div>
          ) : viewMode === 'wysiwyg' ? (
            <div className="h-full knowledge-wysiwyg" data-theme="light">
              <AtomicCodeMirrorEditor
                key={selectedPath}
                markdownSource={body}
                documentId={selectedPath}
                onMarkdownChange={(md) => { setBody(md); setDirty(true) }}
                extensions={[wikiLinks({
                  suggest: async (q) =>
                    knowledgeFiles
                      .filter(k => (k.filepath || k.name).toLowerCase().includes(q.toLowerCase()))
                      .slice(0, 20)
                      .map(k => ({ target: k.filepath || k.name, label: k.name })),
                  resolve: async (t) => {
                    const found = knowledgeFiles.find(k => (k.filepath || k.name) === t)
                    return found
                      ? { target: t, label: found.name, status: 'resolved' as const }
                      : { target: t, label: t, status: 'missing' as const }
                  },
                }), mermaidBlocks()]}
                codeLanguages={codeLanguages}
              />
            </div>
          ) : viewMode === 'edit' ? (
            <MarkdownEditor
              value={body}
              onChange={handleChange}
              className="min-h-full"
              placeholder=""
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedPath}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15 }}
              >
                <MarkdownRenderer content={body} />
              </motion.div>
            </AnimatePresence>
          )}
        </div>

      </div>

      {/* 「相关知识」侧滑栏：与左侧文件树同级，从整页右侧滑出成独立一栏 */}
      <AnimatePresence initial={false}>
        {showRelatedGraph && selectedPath && (
          <motion.div
            key="related-knowledge-panel"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-shrink-0 h-full"
            style={{ width: relatedWidth }}
          >
            <div className="relative h-full">
              <RelatedKnowledgePanel
                graphData={graphData}
                knowledgeFiles={graphKnowledges}
                selectedPath={selectedPath}
                onClose={() => setShowRelatedGraph(false)}
                onSelectKnowledge={handleSelectFile}
              />
              {/* 透明拖拽热区压在左边框上，不额外加可见分隔线 */}
              <div
                onMouseDown={startRelatedResize}
                title="拖动调整宽度"
                className="absolute inset-y-0 -left-1 w-2 cursor-col-resize z-10"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
