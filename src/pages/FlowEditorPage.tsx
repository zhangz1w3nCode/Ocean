import type { FC } from 'react'
import { FlowEditor } from '../components/flow/FlowEditor'
import { useWorkflowStore } from '../stores/workflowStore'
import { useFlowEditorStore } from '../stores/flowEditorStore'
import { useToastStore } from '../stores/toastStore'

interface FlowEditorPageProps {
  workflowId?: string
  onBack?: () => void
}

export const FlowEditorPage: FC<FlowEditorPageProps> = ({
  workflowId,
  onBack,
}) => {
  const { saveWorkflowData, getWorkflowById } = useWorkflowStore()
  const { nodes, edges } = useFlowEditorStore()
  const { addToast } = useToastStore()

  const workflow = workflowId ? getWorkflowById(workflowId) : null
  const workflowName = workflow?.name || (workflowId ? '未命名工作流' : '未命名工作流')

  const handleSave = async () => {
    if (!workflowId) {
      addToast('没有工作流ID，无法保存', 'error')
      return
    }

    // 显示"正在保存..."，不自动消失（duration = 0）
    const loadingToastId = addToast('正在保存...', 'info', 0)

    const success = await saveWorkflowData(workflowId, nodes, edges)

    // 移除"正在保存..."提示
    useToastStore.getState().removeToast(loadingToastId)

    // 显示结果
    if (success) {
      addToast('保存成功', 'success')
    } else {
      addToast('保存失败，请重试', 'error')
    }
  }

  return (
    <div className="h-full w-full">
      <FlowEditor
        workflowId={workflowId}
        workflowName={workflowName}
        onBack={onBack}
        onSave={handleSave}
      />
    </div>
  )
}