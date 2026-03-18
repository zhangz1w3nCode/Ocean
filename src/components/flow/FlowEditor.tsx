import type { FC } from 'react'
import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { FlowCanvas } from './FlowCanvas'
import { FlowToolbar } from './FlowToolbar'
import { PropertiesPanel } from './PropertiesPanel'
import { NodePanel } from './NodePanel'
import { useFlowEditorStore } from '../../stores/flowEditorStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useMemo } from 'react'

interface FlowEditorProps {
  workflowId?: string
  workflowName?: string
  onBack?: () => void
  onSave?: () => void
}

export const FlowEditor: FC<FlowEditorProps> = ({
  workflowId,
  workflowName,
  onBack,
  onSave,
}) => {
  const { initNewWorkflow, reset, loadWorkflow, workflowId: currentId, canUndo, canRedo, undo, redo } = useFlowEditorStore()
  const { getWorkflowById } = useWorkflowStore()

  // 初始化工作流
  useMemo(() => {
    // 如果 workflowId 变了或者当前没有加载工作流，则初始化
    if (workflowId !== currentId) {
      if (workflowId && workflowId.startsWith('wf-')) {
        // 新创建的工作流（id以 wf- 开头）
        initNewWorkflow(workflowName || '未命名工作流', workflowId)
      } else if (workflowId) {
        // 已有工作流，尝试加载保存的数据
        const workflow = getWorkflowById(workflowId)
        if (workflow && workflow.nodes && workflow.nodes.length > 0) {
          // 加载保存的节点和边
          loadWorkflow(workflow.nodes, workflow.edges, workflow.name, workflowId)
        } else {
          // 没有保存的数据，初始化新的
          reset()
          initNewWorkflow(workflowName || '未命名工作流', workflowId)
        }
      } else {
        // 没有 workflowId，使用默认数据
        reset()
        if (workflowName) {
          initNewWorkflow(workflowName, null)
        }
      }
    }
    return () => {
      // 组件卸载时清理
    }
  }, [workflowId, workflowName])

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (canUndo()) {
          undo()
        }
      }
      // Ctrl+Shift+Z 或 Ctrl+Y 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (canRedo()) {
          redo()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo, undo, redo])

  return (
    <div className="h-full p-4">
      {/* 白色圆角卡片容器 */}
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {/* 工具栏 */}
        <FlowToolbar onBack={onBack} onSave={onSave} />

        {/* 主内容 */}
        <div className="flex-1 flex overflow-hidden bg-gray-50/50">
          {/* 左侧节点面板 */}
          <NodePanel />

          {/* 画布区域 */}
          <div className="flex-1 relative m-4">
            <div className="absolute inset-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <ReactFlowProvider>
                <FlowCanvas />
              </ReactFlowProvider>
            </div>
          </div>

          {/* 属性面板 */}
          <PropertiesPanel />
        </div>
      </div>
    </div>
  )
}