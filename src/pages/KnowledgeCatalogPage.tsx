import { useState, useEffect, useMemo, useCallback, useRef, type FC } from 'react'
import {
  ChevronRight, ChevronDown, FolderOpen, FolderClosed, FileText,
  Eye, PencilLine, Save, FileQuestion, Code,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { MarkdownEditor, MarkdownRenderer } from '../components/ui'
import { AtomicCodeMirrorEditor, wikiLinks } from '@atomic-editor/editor'
import { languages as codeLanguages } from '@codemirror/language-data'
import '@atomic-editor/editor/styles.css'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useToastStore } from '../stores/toastStore'
import {
  loadKnowledgeRawFile, saveKnowledgeRawFile, listKnowledgeFoldersFromLocal, isElectron,
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
      level.push({ name: `${fileName}.md`, path: fp, kind: 'file', children: [] })
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
              <ChevronDown size={13} className="flex-shrink-0 text-macos-text-tertiary" />
            ) : (
              <ChevronRight size={13} className="flex-shrink-0 text-macos-text-tertiary" />
            )}
            {isOpen ? (
              <FolderOpen size={14} className="flex-shrink-0 text-macos-text-tertiary" />
            ) : (
              <FolderClosed size={14} className="flex-shrink-0 text-macos-text-tertiary" />
            )}
          </>
        ) : (
          <>
            <span className="w-[13px] flex-shrink-0" />
            <FileText size={14} className="flex-shrink-0 text-macos-text-tertiary" />
          </>
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
  const { addToast } = useToastStore()

  const [folders, setFolders] = useState<KnowledgeFolder[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [body, setBody] = useState('')
  // 当前文件开头 YAML 头的**原文字面量**：编辑区不展示它，写盘时原样拼回
  const frontmatterRef = useRef('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'wysiwyg'>('edit')

  const tree = useMemo(() => {
    const filePaths = Array.from(
      new Set(knowledgeFiles.map((k) => k.filepath).filter((p): p is string => !!p)),
    )
    return buildTree(folders, filePaths)
  }, [folders, knowledgeFiles])

  // 目录树与文件列表都来自磁盘，切回本 tab 时重新拉取
  useEffect(() => {
    if (!isElectron()) return
    const refresh = async () => {
      const [list, loaded] = await Promise.all([
        listKnowledgeFoldersFromLocal(),
        loadKnowledgeFiles(),
      ])
      setFolders(list)
      void loaded
    }
    refresh()
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
    setSelectedPath(path)
    setDirty(false)
    const { content } = await loadKnowledgeRawFile(path)
    const { frontmatter, body: bodyOnly } = splitKnowledgeRawFile(content ?? '')
    frontmatterRef.current = frontmatter
    setBody(bodyOnly)
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value)
    setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!selectedPath) return
    setSaving(true)
    const success = await saveKnowledgeRawFile(
      selectedPath,
      joinKnowledgeRawFile(frontmatterRef.current, body),
    )
    setSaving(false)
    if (success) {
      setDirty(false)
      addToast('已保存', 'success')
      // 让知识库/知识图谱 tab 与本 tab 数据一致
      await loadKnowledgeFiles()
      setFolders(await listKnowledgeFoldersFromLocal())
    } else {
      addToast('保存失败，请重试', 'error')
    }
  }, [selectedPath, body, addToast, loadKnowledgeFiles])

  const hasTree = tree.length > 0

  return (
    <div className="flex-1 flex min-h-0 gap-2 overflow-hidden">
      {/* 左侧文件树 */}
      <div className="w-56 flex-shrink-0 h-full overflow-y-auto py-2 px-2 rounded-lg border border-gray-100">
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

      {/* 右侧编辑区 */}
      <div className="flex-1 flex flex-col min-h-0 rounded-lg border border-gray-100 overflow-hidden">
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
                })]}
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
    </div>
  )
}
