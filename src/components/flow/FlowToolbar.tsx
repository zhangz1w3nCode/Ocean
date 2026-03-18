import type { FC } from 'react'
import {
  Trash2,
  Undo2,
  Redo2,
  LayoutGrid,
  Save,
  ArrowLeft,
  Play,
  MousePointer2,
  X,
  Image,
  Check,
  Share2,
} from 'lucide-react'
import { useFlowEditorStore } from '../../stores/flowEditorStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useState } from 'react'
import { ApplyModal } from './ApplyModal'

interface FlowToolbarProps {
  onBack?: () => void
  onSave?: () => void
  onClose?: () => void
  workflowId?: string | null
}

export const FlowToolbar: FC<FlowToolbarProps> = ({ onBack, onSave, onClose, workflowId }) => {
  const {
    workflowName,
    selectedNodeId,
    selectedEdgeId,
    selectedNodeIds,
    selectedEdgeIds,
    deleteNode,
    deleteEdge,
    deleteSelectedNodes,
    clearSelection,
    canUndo,
    canRedo,
    undo,
    redo,
    autoLayout,
    nodes,
    edges,
  } = useFlowEditorStore()
  const { getWorkflowById } = useWorkflowStore()
  const [showApplyModal, setShowApplyModal] = useState(false)

  const handleDelete = () => {
    if (selectedNodeIds.length > 1) {
      deleteSelectedNodes()
      clearSelection()
    } else if (selectedNodeId) {
      deleteNode(selectedNodeId)
      clearSelection()
    } else if (selectedEdgeId) {
      deleteEdge(selectedEdgeId)
      clearSelection()
    }
  }

  const handleAutoLayout = () => {
    autoLayout()
  }

  const handleExportImage = async () => {
    const element = document.querySelector('.react-flow') as HTMLElement
    if (!element) return

    try {
      // 使用 html2canvas 或简单的截图方法
      // 由于没有 html2canvas，使用原生方法
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // 设置画布大小
      const rect = element.getBoundingClientRect()
      canvas.width = rect.width * 2
      canvas.height = rect.height * 2
      ctx.scale(2, 2)

      // 简单背景
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, rect.height)

      // 由于直接截图复杂，使用简化方案：导出 JSON 数据
      const data = {
        workflowName,
        nodes,
        edges,
        exportedAt: new Date().toISOString()
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `${workflowName}.json`
      link.href = url
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('导出失败:', error)
    }
  }

  const hasSelection = selectedNodeId || selectedEdgeId || selectedNodeIds.length > 0 || selectedEdgeIds.length > 0

  // 检查工作流是否已保存（检查 WORKFLOW.md 是否存在）
  const workflow = workflowId ? getWorkflowById(workflowId) : null
  const isWorkflowSaved = workflow?.hasMetadata === true

  const handleApplyClick = () => {
    if (!isWorkflowSaved) {
      // 如果未保存，先提示保存
      const saveBtn = document.querySelector('[data-save-button]') as HTMLButtonElement
      saveBtn?.click()
      return
    }
    // 已保存，打开应用弹窗
    setShowApplyModal(true)
  }

  return (
    <div className="h-14 px-4 flex items-center justify-between bg-white border-b border-macos-border">
      {/* 左侧：返回 + 标题 */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          title="返回"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="h-6 w-px bg-gray-200" />

        <div>
          <h1 className="text-sm font-semibold text-gray-800">{workflowName}</h1>
          <p className="text-xs text-gray-500">编辑中</p>
        </div>
      </div>

      {/* 中间：工具按钮 */}
      <div className="flex items-center gap-1">
        <ToolbarButton icon={<MousePointer2 size={18} />} title="选择" active />
        <ToolbarDivider />

        <ToolbarButton
          icon={<Trash2 size={18} />}
          title="删除"
          onClick={handleDelete}
          disabled={!hasSelection}
        />
        <ToolbarDivider />

        <ToolbarButton
          icon={<Undo2 size={18} />}
          title="撤销 (Ctrl+Z)"
          onClick={undo}
          disabled={!canUndo()}
        />
        <ToolbarButton
          icon={<Redo2 size={18} />}
          title="重做 (Ctrl+Y)"
          onClick={redo}
          disabled={!canRedo()}
        />
        <ToolbarDivider />

        <ToolbarButton
          icon={<LayoutGrid size={18} />}
          title="自动布局"
          onClick={handleAutoLayout}
        />
      </div>

      {/* 右侧：保存 + 应用 + 关闭 */}
      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          data-save-button
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700
                     bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Save size={16} />
          保存
        </button>

        <button
          onClick={handleApplyClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            isWorkflowSaved
              ? 'text-white bg-gray-700 hover:bg-gray-800 border border-gray-700'
              : 'text-gray-400 bg-gray-100 hover:bg-gray-200 border border-gray-200'
          }`}
          title={isWorkflowSaved ? '应用当前工作流到其他模块' : '请先保存工作流后再应用'}
        >
          <Share2 size={16} />
          应用
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-macos-text-secondary transition-colors"
            title="关闭"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 应用弹窗 */}
      <ApplyModal
        isOpen={showApplyModal}
        onClose={() => setShowApplyModal(false)}
        workflowName={workflowName}
        workflowId={workflowId || null}
      />
    </div>
  )
}

// 工具栏按钮
interface ToolbarButtonProps {
  icon: React.ReactNode
  title: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
}

const ToolbarButton: FC<ToolbarButtonProps> = ({
  icon,
  title,
  onClick,
  disabled,
  active,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`
      p-2 rounded-lg transition-colors
      ${active ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}
      ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
    `}
  >
    {icon}
  </button>
)

// 分隔线
const ToolbarDivider = () => <div className="h-5 w-px bg-gray-200 mx-1" />