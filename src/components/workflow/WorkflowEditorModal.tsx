import type { FC } from 'react'
import { useEffect, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ReactFlowProvider } from '@xyflow/react'
import { FlowCanvas } from '../flow/FlowCanvas'
import { FlowToolbar } from '../flow/FlowToolbar'
import { PropertiesPanel } from '../flow/PropertiesPanel'
import { NodePanel } from '../flow/NodePanel'
import { useFlowEditorStore } from '../../stores/flowEditorStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useToastStore } from '../../stores/toastStore'

interface WorkflowEditorModalProps {
  isOpen: boolean
  workflowId: string | null
  onClose: () => void
}

export const WorkflowEditorModal: FC<WorkflowEditorModalProps> = ({
  isOpen,
  workflowId,
  onClose,
}) => {
  const [nodePanelCollapsed, setNodePanelCollapsed] = useState(false)
  const [nodePanelWidth, setNodePanelWidth] = useState(208)

  const {
    initNewWorkflow,
    reset,
    loadWorkflow,
    workflowId: currentId,
    canUndo,
    canRedo,
    undo,
    redo,
    nodes,
    edges,
  } = useFlowEditorStore()
  const { getWorkflowById, saveWorkflowData } = useWorkflowStore()
  const { addToast } = useToastStore()

  const workflow = workflowId ? getWorkflowById(workflowId) : null
  const workflowName = workflow?.name || '未命名工作流'

  // 初始化工作流
  const initializeWorkflow = useCallback(async () => {
    if (!workflowId) return

    // 每次打开都从文件系统重新加载对应的工作流数据，确保是最新的
    const store = useWorkflowStore.getState()
    if (store.reloadWorkflowById) {
      await store.reloadWorkflowById(workflowId)
    }

    // 重新加载后，从 store 获取最新数据
    const freshStore = useWorkflowStore.getState()
    const wf = freshStore.getWorkflowById(workflowId)
    const name = wf?.name || '未命名工作流'

    if (wf && wf.nodes && wf.nodes.length > 0) {
      // 有已保存的节点数据，加载它们
      loadWorkflow(wf.nodes, wf.edges, wf.name, workflowId)
    } else {
      // 没有节点数据，初始化新工作流
      reset()
      initNewWorkflow(name, workflowId)
    }
  }, [workflowId, initNewWorkflow, reset, loadWorkflow])

  useEffect(() => {
    if (isOpen && workflowId) {
      initializeWorkflow()
    }
  }, [isOpen, workflowId, initializeWorkflow])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo()) undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (canRedo()) redo()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, canUndo, canRedo, undo, redo, onClose])

  const handleSave = async () => {
    if (!workflowId) {
      addToast('没有工作流ID，无法保存', 'error')
      return
    }

    const loadingToastId = addToast('正在保存...', 'info', 0)
    const success = await saveWorkflowData(workflowId, nodes, edges)
    useToastStore.getState().removeToast(loadingToastId)

    if (success) {
      addToast('保存成功', 'success')
    } else {
      addToast('保存失败，请重试', 'error')
    }
  }

  const toggleNodePanel = () => {
    setNodePanelCollapsed(!nodePanelCollapsed)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[50]"
            onClick={onClose}
          />

          {/* 弹窗容器 */}
          <div className="fixed inset-0 z-[50] flex items-center justify-center p-4 pointer-events-none">
            {/* 弹窗内容 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[1200px] h-[700px] max-w-full max-h-full
                         bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 工具栏 */}
              <FlowToolbar
                onBack={onClose}
                onSave={handleSave}
                onClose={onClose}
                workflowId={workflowId}
              />

              {/* 主内容 */}
              <div className="flex-1 flex overflow-hidden">
                {/* 画布区域 */}
                <div className="flex-1 relative bg-gray-50 overflow-hidden">
                  {/* 左侧节点面板 - 浮动 */}
                  <NodePanel
                    collapsed={nodePanelCollapsed}
                    onToggleCollapse={toggleNodePanel}
                    width={nodePanelWidth}
                    onWidthChange={setNodePanelWidth}
                  />

                  <ReactFlowProvider>
                    <FlowCanvas />
                  </ReactFlowProvider>

                  {/* 浮动属性面板 */}
                  <PropertiesPanel />
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}