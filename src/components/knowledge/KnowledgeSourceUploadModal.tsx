import type { FC } from 'react'
import { useState, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../ui'

// 本期仅支持这两种；后续扩展格式时只需改这一处白名单
const ACCEPTED_EXTENSIONS = ['md', 'txt']

export const isKnowledgeRawAccepted = (name: string): boolean => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return false
  return ACCEPTED_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
}

interface KnowledgeSourceUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onFiles: (files: File[]) => void
  uploading: boolean
}

export const KnowledgeSourceUploadModal: FC<KnowledgeSourceUploadModalProps> = ({
  isOpen,
  onClose,
  onFiles,
  uploading,
}) => {
  const [isDragActive, setIsDragActive] = useState(false)
  // 用深度计数而非 relatedTarget 判断，避免拖拽经过子元素时高亮态闪烁
  const dragDepthRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 弹窗打开期间拦截窗口级拖放：否则落在虚线区外的文件会被 Chromium 直接当页面导航打开
  useEffect(() => {
    if (!isOpen) return
    const prevent = (e: DragEvent) => {
      e.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      dragDepthRef.current = 0
      setIsDragActive(false)
    }
  }, [isOpen])

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    setIsDragActive(true)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragActive(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current = 0
    setIsDragActive(false)
    if (uploading) return
    onFiles(Array.from(e.dataTransfer.files))
  }

  // 点击虚线区等价于选择文件：复用同一条上传链路，不另开路径
  const openFilePicker = () => {
    if (uploading) return
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    // 清空 value：否则连续选中同一个文件不会再触发 change
    e.target.value = ''
    if (picked.length > 0) onFiles(picked)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="添加知识源" size="md">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div
        onClick={openFilePicker}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 min-h-0 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          isDragActive ? 'border-gray-400 bg-gray-100/60' : 'border-gray-300 bg-gray-50'
        }`}
      >
        {uploading ? (
          <p className="text-sm text-macos-text flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            正在导入...
          </p>
        ) : (
          <>
            <p className="text-sm text-macos-text">拖拽文件到这里</p>
            <p className="text-xs text-macos-text-tertiary">支持Markdown,Txt等格式的文件</p>
          </>
        )}
      </div>
    </Modal>
  )
}
