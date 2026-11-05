import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { FileText, Type, PenLine, Upload } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useProjectStore } from '../../stores/projectStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { isElectron } from '../../utils/storage'
import { loadWorkflowPackageModule, type InspectPackageView } from '../../utils/workflowPackageBridge'

interface CreateWorkflowModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (name: string, description: string) => void
  existingNames?: string[]
}

type Mode = 'select' | 'manual'

export const CreateWorkflowModal: FC<CreateWorkflowModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  existingNames = [],
}) => {
  const { addToast } = useToastStore()
  const [mode, setMode] = useState<Mode>('select')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // 验证失败的字段
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)

  // 导入流程状态
  const [pendingImport, setPendingImport] = useState<InspectPackageView | null>(null)
  const [importing, setImporting] = useState(false)

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
      setMode('select')
      setName('')
      setDescription('')
      setInvalidFields(new Set())
      setPendingImport(null)
      setImporting(false)
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
    setMode('select')
    setPendingImport(null)
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

  // 选择要导入的包并预检冲突（不写盘）
  const handlePickImport = async () => {
    if (!isElectron() || !window.electronAPI?.pickWorkflowPackageImportPath) {
      addToast('导入仅支持桌面端', 'warning')
      return
    }
    const root = useProjectStore.getState().currentProject?.path || ''
    if (!root) {
      addToast('未选择项目目录，无法导入', 'error')
      return
    }
    const pkgModule = loadWorkflowPackageModule()
    if (!pkgModule) {
      addToast('导入模块未就绪，请重新构建桌面端', 'error')
      return
    }

    const picked = await window.electronAPI.pickWorkflowPackageImportPath()
    if (!picked?.success) {
      addToast(`选择导入文件失败${picked?.error ? `：${picked.error}` : ''}`, 'error')
      return
    }
    if (!picked.path) return // 用户取消

    const inspected = pkgModule.inspectWorkflowPackage(root, picked.path)
    if (!inspected.success) {
      addToast(`无法导入：${inspected.error ?? '未知错误'}`, 'error')
      return
    }
    setPendingImport(inspected)
  }

  // 确认导入（覆盖写入）
  const handleConfirmImport = async () => {
    if (importing) return
    if (!pendingImport?.path) return
    const root = useProjectStore.getState().currentProject?.path || ''
    const pkgModule = loadWorkflowPackageModule()
    if (!root || !pkgModule) {
      addToast('导入模块未就绪', 'error')
      return
    }

    setImporting(true)
    try {
      const result = pkgModule.importWorkflowPackage(root, pendingImport.path)
      if (!result.success) {
        addToast(`导入失败：${result.error ?? '未知错误'}`, 'error')
        return
      }

      await useWorkflowStore.getState().loadWorkflows()

      addToast('导入成功', 'success')

      setPendingImport(null)
      handleClose(true)
    } finally {
      setImporting(false)
    }
  }

  // 渲染模式选择界面
  const renderModeSelect = () => (
    <div className="flex flex-col items-center justify-center py-8 px-10">
      <div className="flex gap-6">
        <button
          onClick={() => setMode('manual')}
          className="flex flex-col items-center gap-3 p-7 w-40 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
            <PenLine size={24} className="text-yellow-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">手动创建</span>
        </button>
        <button
          onClick={handlePickImport}
          className="flex flex-col items-center gap-3 p-7 w-40 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <Upload size={24} className="text-blue-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">外部导入</span>
        </button>
      </div>
    </div>
  )

  // ConfirmModal 的 message 按单行渲染，这里用分号拼接而非换行
  const importConfirmMessage = (() => {
    if (!pendingImport) return ''
    const parts: string[] = [
      `将导入工作流「${pendingImport.manifest?.workflowName ?? ''}」（全局节点 ${pendingImport.manifest?.counts?.globalNodes ?? 0} 个、局部节点 ${pendingImport.manifest?.counts?.localNodes ?? 0} 个）`,
    ]
    if (pendingImport.workflowExists) {
      parts.push('目标项目已存在同名工作流，其设计文件将被覆盖')
    }
    if (pendingImport.conflictingNodes?.length) {
      parts.push(
        `另有 ${pendingImport.conflictingNodes.length} 个同名全局节点将被覆盖，引用它们的其他工作流会一并受影响`,
      )
    }
    return parts.join('；')
  })()

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={mode === 'select' ? '新建工作流' : '创建新工作流'}
        footer={
          mode === 'manual' ? (
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
          ) : undefined
        }
      >
        {mode === 'select' ? (
          renderModeSelect()
        ) : (
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
        )}
      </Modal>

      {/* 导入确认（覆盖写入说明） */}
      <ConfirmModal
        isOpen={pendingImport !== null}
        title="确认导入"
        message={importConfirmMessage}
        confirmText={importing ? '导入中...' : '覆盖导入'}
        cancelText="取消"
        onConfirm={handleConfirmImport}
        onCancel={() => setPendingImport(null)}
      />

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