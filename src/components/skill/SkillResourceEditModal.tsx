import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Modal, Input, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { Edit3, Eye } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import type { SkillResource } from '../../types'

interface SkillResourceEditModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (fileName: string, fileContent: string) => Promise<boolean>
  mode: 'create' | 'edit'
  initialData?: SkillResource | null
  existingNames?: string[]
  filePlaceholder?: string
  contentPlaceholder?: string
}

export const SkillResourceEditModal: FC<SkillResourceEditModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  mode,
  initialData = null,
  existingNames = [],
  filePlaceholder = 'filename',
  contentPlaceholder = '# 在此输入文件内容...',
}) => {
  const { addToast } = useToastStore()
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const initialSnapshot = useRef<string>('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

  const getSnapshot = () => JSON.stringify({ fileName, fileContent })
  const hasChanges = () => getSnapshot() !== initialSnapshot.current

  useEffect(() => {
    if (isOpen) {
      const initName = mode === 'edit' && initialData ? initialData.name : ''
      const initContent = mode === 'edit' && initialData ? (initialData.content || '') : ''
      setFileName(initName)
      setFileContent(initContent)
      setShowConfirm(false)
      setViewMode('edit')
      setTimeout(() => {
        initialSnapshot.current = JSON.stringify({ fileName: initName, fileContent: initContent })
      }, 0)
    }
  }, [isOpen, mode, initialData])

  const handleClose = () => {
    if (hasChanges()) {
      setShowConfirm(true)
      return
    }
    onClose()
  }

  const handleSubmit = async () => {
    if (!fileName.trim()) {
      addToast('请输入文件名', 'warning')
      return
    }
    if (!fileContent.trim()) {
      addToast('请输入文件内容', 'warning')
      return
    }
    if (mode === 'create' && existingNames.includes(fileName.trim())) {
      addToast('文件名已存在', 'warning')
      return
    }

    const success = await onConfirm(fileName.trim(), fileContent.trim())
    if (success) {
      addToast(mode === 'create' ? '文件创建成功' : '文件更新成功', 'success')
      initialSnapshot.current = getSnapshot()
      onClose()
    } else {
      addToast('保存失败', 'error')
    }
  }

  return (
    <>
      <Modal
        layoutKey="skill-resource"
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={mode === 'create' ? '新建文件' : '编辑文件'}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => handleClose()}>取消</Button>
            <Button variant="outline" size="sm" onClick={handleSubmit} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg">
              {mode === 'create' ? '创建' : '保存'}
            </Button>
          </div>
        }
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden pr-2 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">文件名</label>
            <Input
              placeholder={filePlaceholder}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              disabled={mode === 'edit'}
              autoFocus
            />
            {mode === 'edit' && (
              <p className="mt-1 text-xs text-macos-text-tertiary">编辑模式下文件名不可修改</p>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-500">文件内容</label>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'edit'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Edit3 size={14} />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'preview'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye size={14} />
                  预览
                </button>
              </div>
            </div>
            {viewMode === 'edit' ? (
              <div className="flex-1 min-h-0">
                <MarkdownEditor
                  placeholder={contentPlaceholder}
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="font-mono text-sm h-full"
                />
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto">
                {fileContent.trim() ? (
                  <MarkdownRenderer content={fileContent} />
                ) : (
                  <p className="text-sm text-macos-text-tertiary text-center py-8">
                    暂无内容，请切换到编辑模式输入内容
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要退出吗？"
        confirmText="退出"
        cancelText="继续编辑"
        onConfirm={() => {
          setShowConfirm(false)
          onClose()
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
