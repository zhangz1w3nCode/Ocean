import type { FC } from 'react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Plus, Wand2, X, Inbox, Loader2 } from 'lucide-react'
import {
  KnowledgeSourceCard,
  KnowledgeSourceUploadModal,
  KnowledgeSourceDetailModal,
  isKnowledgeRawAccepted,
} from '../components/knowledge'
import { Button } from '../components/ui'
import { useToastStore } from '../stores/toastStore'
import {
  listKnowledgeRawFilesFromLocal,
  saveKnowledgeRawFileToLocal,
  type KnowledgeRawFile,
} from '../utils/storage'
import { useCompileStore } from '../stores/compileStore'
import { useAppStore } from '../stores/appStore'

// toast 宽度有限，文件名列表过长时截断，避免提示被撑爆
const summarizeNames = (names: string[]): string => {
  if (names.length <= 3) return names.join('、')
  return `${names.slice(0, 3).join('、')} 等 ${names.length} 个文件`
}

export const KnowledgeSourcePage: FC<{ nested?: boolean }> = ({ nested = false }) => {
  const { addToast } = useToastStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [rawFiles, setRawFiles] = useState<KnowledgeRawFile[]>([])
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<KnowledgeRawFile | null>(null)
  // 编译多选模式
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { enqueue } = useCompileStore()
  const { setKnowledgeSubPage } = useAppStore()
  const [submitting, setSubmitting] = useState(false)

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const compileSelected = async () => {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    const names = [...selected]
    const result = await enqueue(names)
    setSubmitting(false)
    if (result.success) {
      addToast(`已入队 ${names.length} 个知识源的编译任务`, 'success')
      exitSelectMode()
      setKnowledgeSubPage('compile')
    } else {
      addToast(result.error || '入队失败', 'error')
    }
  }

  const refreshRawFiles = useCallback(async () => {
    setRawFiles(await listKnowledgeRawFilesFromLocal())
  }, [])

  useEffect(() => {
    refreshRawFiles()
  }, [refreshRawFiles])

  const visibleFiles = useMemo(() => {
    const query = searchQuery.toLowerCase()
    if (!query) return rawFiles
    return rawFiles.filter((file) => file.name.toLowerCase().includes(query))
  }, [rawFiles, searchQuery])

  const handleFiles = async (dropped: File[]) => {
    if (dropped.length === 0 || uploading) return

    const accepted = dropped.filter((file) => isKnowledgeRawAccepted(file.name))
    const rejected = dropped.filter((file) => !isKnowledgeRawAccepted(file.name))

    if (accepted.length === 0) {
      addToast(`不支持的格式，已跳过：${summarizeNames(rejected.map((f) => f.name))}`, 'error')
      return
    }

    setUploading(true)
    const savedNames: string[] = []
    const failedNames: string[] = []
    for (const file of accepted) {
      // 走字节而非文件路径：Electron 32+ 已移除 File.path，且字节原样落盘不做编码转换
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await saveKnowledgeRawFileToLocal(file.name, bytes)
      if (result.success && result.savedName) {
        savedNames.push(result.savedName)
      } else {
        failedNames.push(file.name)
      }
    }
    setUploading(false)

    if (savedNames.length > 0) {
      addToast(`已导入 ${savedNames.length} 个文件：${summarizeNames(savedNames)}`, 'success')
      await refreshRawFiles()
      setIsUploadOpen(false)
    }
    if (failedNames.length > 0) {
      addToast(`导入失败：${summarizeNames(failedNames)}`, 'error')
    }
    if (rejected.length > 0) {
      addToast(`不支持的格式，已跳过：${summarizeNames(rejected.map((f) => f.name))}`, 'warning')
    }
  }

  const innerContent = (
    <>
      {/* 页面头部 */}
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-3">
          {selectMode && (
            <>
              <span className="text-sm text-macos-text-secondary">已选 {selected.size} / {rawFiles.length}</span>
              <Button
                variant="outline"
                onClick={() => setSelected(new Set(visibleFiles.map((f) => f.name)))}
                className="py-2 text-sm rounded-lg"
              >
                全选
              </Button>
              <Button variant="outline" onClick={exitSelectMode} className="py-2 text-sm rounded-lg">
                <X size={16} />
              </Button>
            </>
          )}
          {/* 搜索框 */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary"
            />
            <input
              type="text"
              placeholder=""
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg
                         placeholder:text-macos-text-tertiary focus:outline-none
                         hover:border-gray-300 focus:border-gray-400
                         focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                         transition-[border-color,box-shadow] duration-200"
            />
          </div>

          {/* 编译入口：进入多选模式 */}
          {rawFiles.length > 0 && !selectMode && (
            <Button
              variant="outline"
              onClick={() => setSelectMode(true)}
              className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
            >
              <Wand2 size={16} className="flex-shrink-0" />
              <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
                编译知识源
              </span>
            </Button>
          )}

          {/* 添加按钮 */}
          <Button
            variant="outline"
            onClick={() => setIsUploadOpen(true)}
            className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
          >
            <Plus size={16} className="flex-shrink-0" />
            <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
              添加知识源
            </span>
          </Button>
        </div>
      </div>

      {/* 页面内容 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {selectMode && selected.size > 0 && (
          <div className="max-w-6xl mx-auto mb-4">
            <div className="flex items-center justify-between bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-2.5">
              <span className="text-sm text-blue-700">已选择 {selected.size} 个知识源</span>
              <Button
                onClick={() => void compileSelected()}
                disabled={submitting}
                className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 px-4 text-sm"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                <span className="ml-1">编译选中（{selected.size}）</span>
              </Button>
            </div>
          </div>
        )}
        {visibleFiles.length > 0 ? (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
              {visibleFiles.map((file) => (
                <KnowledgeSourceCard
                  key={file.name}
                  file={file}
                  selectMode={selectMode}
                  selected={selected.has(file.name)}
                  onToggleSelect={() => toggleSelect(file.name)}
                  onClick={() => {
                    setPreviewFile(file)
                    setIsPreviewOpen(true)
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <Inbox size={32} className="text-macos-text-tertiary" />
            </div>
          </div>
        )}
      </div>

      {/* 上传弹窗 */}
      <KnowledgeSourceUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onFiles={handleFiles}
        uploading={uploading}
      />

      {/* 预览弹窗 */}
      <KnowledgeSourceDetailModal
        key={previewFile?.name || 'empty'}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />
    </>
  )

  if (nested) {
    return innerContent
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {innerContent}
      </div>
    </div>
  )
}
