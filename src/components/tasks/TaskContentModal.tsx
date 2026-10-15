import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Edit3, Eye } from 'lucide-react'
import { Modal, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { formatRelativeTime } from '../../utils/format'

interface TaskContentModalProps {
  isOpen: boolean
  onClose: () => void
  initialContent: string
  /** 任务最近更新时间（查看态展示） */
  updatedAt?: string
  onConfirm: (content: string) => Promise<boolean>
}

// 任务内容弹窗：默认查看态（md 渲染，底部 取消/编辑），点编辑进入编辑态（md 编辑/预览切换 + 保存）
export const TaskContentModal: FC<TaskContentModalProps> = ({
  isOpen,
  onClose,
  initialContent,
  updatedAt,
  onConfirm,
}) => {
  const { addToast } = useToastStore()
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialSnapshot = useRef<string>('')

  // 表单实时镜像（ref）：脏检测快照必须读到重置后的值（同 TaskContextFormModal）
  const formStateRef = useRef({ content })
  formStateRef.current = { content }

  const getSnapshot = () => JSON.stringify(formStateRef.current)
  const hasChanges = () => getSnapshot() !== initialSnapshot.current

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent)
      setIsEditing(false)
      setViewMode('edit')
      setInvalidFields(new Set())
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialContent])

  const handleSubmit = async () => {
    if (isSubmitting) return

    if (!content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入任务内容', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    setInvalidFields(new Set())
    setIsSubmitting(true)
    const success = await onConfirm(content.trim())
    setIsSubmitting(false)
    if (success) {
      addToast('任务内容已更新', 'success')
      handleClose(true)
    }
  }

  // 取消：查看态直接关闭；编辑态有修改先确认，放弃修改回到查看态
  const handleCancel = () => {
    if (!isEditing) {
      handleClose(true)
      return
    }
    if (hasChanges()) {
      setShowConfirm(true)
      return
    }
    backToView()
  }

  const backToView = () => {
    setIsEditing(false)
    setViewMode('edit')
    setInvalidFields(new Set())
    setContent(initialContent)
    setShowConfirm(false)
  }

  const handleClose = (skipConfirm = false) => {
    if (!skipConfirm && isEditing && hasChanges()) {
      setShowConfirm(true)
      return
    }
    setInvalidFields(new Set())
    setShowConfirm(false)
    onClose()
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title="任务内容"
        size="xl"
        footer={
          isEditing ? (
            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => handleCancel()}>
                取消
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
              >
                保存
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => handleClose(true)}>
                取消
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
              >
                编辑
              </Button>
            </div>
          )
        }
      >
        {isEditing ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-end mb-1.5">
              {/* 编辑/预览切换 */}
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
                  placeholder="在此输入任务内容，支持 Markdown 格式..."
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value)
                    if (invalidFields.has('content')) setInvalidFields(new Set())
                  }}
                  invalid={invalidFields.has('content')}
                  rows={12}
                  fill
                />
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto">
                {content.trim() ? (
                  <MarkdownRenderer content={content} className="text-sm" />
                ) : (
                  <p className="text-sm text-macos-text-tertiary text-center py-8">暂无内容</p>
                )}
              </div>
            )}
          </div>
        ) : (
          // 查看态：md 渲染（与上下文查看弹窗同构）
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
              <span className="text-xs text-macos-text-tertiary">
                {updatedAt ? `更新于 ${formatRelativeTime(updatedAt)}` : ''}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {initialContent.trim() ? (
                <MarkdownRenderer content={initialContent} className="text-sm" />
              ) : (
                <p className="text-sm text-macos-text-tertiary text-center py-8">暂无内容</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要放弃修改吗？"
        confirmText="放弃修改"
        cancelText="继续编辑"
        onConfirm={() => { setShowConfirm(false); backToView() }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
