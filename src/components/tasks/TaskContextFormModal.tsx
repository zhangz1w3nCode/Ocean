import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, FileText, Edit3, Eye } from 'lucide-react'
import { Modal, Input, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import type { TaskContextFile } from '../../types'

interface TaskContextFormModalProps {
  isOpen: boolean
  onClose: () => void
  /** create=添加上下文；edit=更新上下文（名称锁定，内容回填） */
  mode?: 'create' | 'edit'
  /** 编辑模式的初始上下文 */
  initialContext?: TaskContextFile | null
  /** 同名上下文已存在列表（覆盖更新提示） */
  existingContextNames?: string[]
  onConfirm: (contextName: string, content: string) => Promise<boolean>
}

export const TaskContextFormModal: FC<TaskContextFormModalProps> = ({
  isOpen,
  onClose,
  mode = 'create',
  initialContext = null,
  existingContextNames = [],
  onConfirm,
}) => {
  const { addToast } = useToastStore()
  const isEdit = mode === 'edit'
  const [contextName, setContextName] = useState('')
  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialSnapshot = useRef<string>('')

  // 表单实时镜像（ref）：脏检测快照必须读到重置后的值，
  // 直接闭包捕获 state 会在「上一次会话值 → 重置」间拿到旧值造成误判
  const formStateRef = useRef({ contextName, content })
  formStateRef.current = { contextName, content }

  const getSnapshot = () => JSON.stringify(formStateRef.current)
  const hasChanges = () => getSnapshot() !== initialSnapshot.current

  useEffect(() => {
    if (isOpen) {
      setContextName(isEdit ? (initialContext?.name || '') : '')
      setContent(isEdit ? (initialContext?.content || '') : '')
      setViewMode('edit')
      setInvalidFields(new Set())
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, initialContext])

  const handleSubmit = async () => {
    if (isSubmitting) return

    if (!contextName.trim()) {
      setInvalidFields(new Set(['contextName']))
      addToast('请输入上下文主题', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (contextName.includes('/') || contextName.includes('\\') || contextName.includes('..')) {
      setInvalidFields(new Set(['contextName']))
      addToast('上下文主题不能包含 / \\ .. 等非法字符', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (!content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入上下文内容', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    setInvalidFields(new Set())
    setIsSubmitting(true)
    // 同名覆盖即更新（后端按文件存在性判定 isUpdate）
    const isOverwrite = existingContextNames.includes(contextName.trim())
    const success = await onConfirm(contextName.trim(), content)
    setIsSubmitting(false)
    if (success) {
      addToast(isOverwrite || isEdit ? '上下文更新成功' : '上下文添加成功', 'success')
      handleClose(true)
    }
  }

  const handleClose = (skipConfirm = false) => {
    if (!skipConfirm && hasChanges()) {
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
        title={isEdit ? '更新上下文' : '添加上下文'}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => handleClose()}>
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
        }
      >
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Type size={16} className="text-macos-text-secondary" />
              上下文主题 *
            </label>
            <Input
              placeholder="例如：需求背景"
              value={contextName}
              onChange={(e) => {
                setContextName(e.target.value)
                if (invalidFields.has('contextName')) setInvalidFields(new Set())
              }}
              autoFocus={!isEdit}
              disabled={isEdit}
              invalid={invalidFields.has('contextName')}
            />
            {isEdit && (
              <p className="text-xs text-macos-text-tertiary mt-1">上下文主题不可修改</p>
            )}
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
                <FileText size={16} className="text-macos-text-secondary" />
                上下文内容 *
              </label>
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
                  placeholder="任务的背景、参考资料、约束条件等，支持 Markdown 格式..."
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value)
                    if (invalidFields.has('content')) setInvalidFields(new Set())
                  }}
                  invalid={invalidFields.has('content')}
                  rows={8}
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
        </div>
      </Modal>

      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要退出吗？"
        confirmText="退出"
        cancelText="继续编辑"
        onConfirm={() => { setShowConfirm(false); handleClose(true) }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
