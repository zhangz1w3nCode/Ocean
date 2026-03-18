import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { FileText, Type } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal } from '../ui'
import { useToastStore } from '../../stores/toastStore'

interface CreateWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (name: string, description: string) => void
  existingNames?: string[]
}

export const CreateWorkflowModal: FC<CreateWorkflowModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  existingNames = [],
}) => {
  const { addToast } = useToastStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // 验证失败的字段
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)

  // 初始数据快照（用于检测是否有修改）
  const initialSnapshot = useRef<string>('')

  // 生成当前数据快照
  const getSnapshot = () => {
    return JSON.stringify({ name, description })
  }

  // 检测是否有修改
  const hasChanges = () => {
    return getSnapshot() !== initialSnapshot.current
  }

  // 当弹窗打开时，重置表单
  useEffect(() => {
    if (isOpen) {
      setName('')
      setDescription('')
      setInvalidFields(new Set())
      // 延迟设置快照，确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen])

  const handleSubmit = () => {
    // 验证工作流名称
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入工作流名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 检查名称唯一性
    if (existingNames.includes(name.trim())) {
      setInvalidFields(new Set(['name']))
      addToast('工作流名称已存在，请使用其他名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 清除验证失败状态
    setInvalidFields(new Set())

    // 提交
    onConfirm(name.trim(), description.trim())

    // 显示成功提示
    addToast('工作流创建成功', 'success')

    handleClose(true)
  }

  const handleClose = (skipConfirm = false) => {
    // 如果不是跳过确认，且有修改，则显示确认弹窗
    if (!skipConfirm && hasChanges()) {
      setShowConfirm(true)
      return
    }

    setName('')
    setDescription('')
    setInvalidFields(new Set())
    onClose()
  }

  // 确认关闭
  const handleConfirmClose = () => {
    setShowConfirm(false)
    handleClose(true)
  }

  // 取消关闭
  const handleCancelClose = () => {
    setShowConfirm(false)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title="创建新工作流"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => handleClose()}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmit}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              创建
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 名称输入 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Type size={16} className="text-macos-text-secondary" />
              工作流名称 *
            </label>
            <Input
              placeholder="例如：订单处理流程"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (invalidFields.has('name')) setInvalidFields(new Set())
              }}
              autoFocus
              invalid={invalidFields.has('name')}
            />
          </div>

          {/* 描述输入 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <FileText size={16} className="text-macos-text-secondary" />
              描述（可选）
            </label>
            <Textarea
              placeholder="简要描述这个工作流的用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* 确认关闭弹窗 */}
      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要退出吗？"
        confirmText="退出"
        cancelText="继续编辑"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
      />
    </>
  )
}