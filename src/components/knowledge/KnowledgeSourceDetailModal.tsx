import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { FileText, File, Loader2, CalendarClock, HardDrive } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import { formatRelativeTime, formatFileSize, fileExtensionOf } from '../../utils/format'
import { loadKnowledgeSourcePreview, type KnowledgeRawFile, type KnowledgeSourcePreview } from '../../utils/storage'

interface KnowledgeSourceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  file: KnowledgeRawFile | null
}

export const KnowledgeSourceDetailModal: FC<KnowledgeSourceDetailModalProps> = ({
  isOpen,
  onClose,
  file,
}) => {
  const [preview, setPreview] = useState<KnowledgeSourcePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !file) {
      setPreview(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    loadKnowledgeSourcePreview(file.name).then((result) => {
      if (cancelled) return
      if (result.success && result.preview) {
        setPreview(result.preview)
      } else {
        setPreview(null)
        setError(result.error || '读取失败')
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, file?.name])

  if (!file) return null

  const ext = fileExtensionOf(file.name)
  const isMarkdown = ext === 'MD'
  const Icon = isMarkdown ? FileText : File

  return (
    <Modal
      layoutKey="knowledge-source"
      isOpen={isOpen}
      onClose={onClose}
      title=""
      size="xl"
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      {/* 头部信息 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
          <Icon size={28} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1 break-all">{file.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium">
              {ext || '未知'}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-macos-text-tertiary">
              <HardDrive size={12} />
              {formatFileSize(file.size)}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-macos-text-tertiary">
              <CalendarClock size={12} />
              {formatRelativeTime(file.mtime)}
            </span>
            <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium break-all">
              {file.name}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-macos-text-tertiary">
            <Loader2 size={16} className="animate-spin" />
            加载中...
          </div>
        )}

        {!loading && error && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-macos-error">无法预览该文件：{error}</p>
          </div>
        )}

        {!loading && !error && preview && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <FileText size={16} />
              文件内容
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              {preview.content ? (
                isMarkdown ? (
                  <MarkdownRenderer content={preview.content} />
                ) : (
                  <pre className="text-sm text-macos-text-secondary whitespace-pre-wrap break-all font-mono leading-relaxed">
                    {preview.content}
                  </pre>
                )
              ) : (
                <p className="text-sm text-macos-text-tertiary text-center py-4">文件内容为空</p>
              )}
            </div>
            {preview.truncated && (
              <p className="mt-2 text-xs text-macos-text-tertiary">
                文件较大，仅预览前 {formatFileSize(preview.size > 1024 * 1024 ? 1024 * 1024 : preview.size)} 内容。
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
