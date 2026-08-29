import type { FC } from 'react'
import { useEffect } from 'react'
import { RefreshCw, Activity, FileText, Package } from 'lucide-react'
import { Button } from '../components/ui'
import { MarkdownRenderer } from '../components/ui'
import { useWorkflowInstanceStore } from '../stores/workflowInstanceStore'
import type { WorkflowInstance } from '../types'
import { formatStatus, formatRelativeTime } from '../utils/format'

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  unknown: 'bg-gray-100 text-gray-500',
}

const InstanceCard: FC<{
  instance: WorkflowInstance
  isActive: boolean
  onClick: () => void
}> = ({ instance, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`
      w-full text-left p-3 rounded-lg border transition-colors duration-200
      ${isActive
        ? 'border-gray-300 bg-[#E5E7EB]'
        : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'
      }
    `}
  >
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-xs font-mono text-macos-text-secondary truncate">
        {instance.instanceId}
      </span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${statusColors[instance.status] || statusColors.unknown}`}>
        {formatStatus(instance.status)}
      </span>
    </div>
    <div className="text-sm font-medium text-macos-text truncate">
      {instance.workflowName}
    </div>
    <div className="flex items-center gap-3 mt-1 text-xs text-macos-text-tertiary">
      {instance.currentStep && (
        <span className="truncate">{instance.currentStep}</span>
      )}
      <span className="flex-shrink-0">{formatRelativeTime(instance.createdAt)}</span>
    </div>
  </button>
)

export const WorkflowInstancesPage: FC = () => {
  const {
    instances,
    isLoaded,
    selectedInstance,
    processContent,
    artifacts,
    isLoadingDetail,
    loadInstances,
    selectInstance,
  } = useWorkflowInstanceStore()

  useEffect(() => {
    if (!isLoaded) {
      loadInstances()
    }
  }, [isLoaded, loadInstances])

  const handleRefresh = () => {
    loadInstances()
  }

  const handleSelectInstance = (instance: WorkflowInstance) => {
    if (selectedInstance?.instanceId === instance.instanceId) {
      selectInstance(null)
    } else {
      selectInstance(instance)
    }
  }

  return (
    <>
      {/* 页面头部 */}
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm"
          >
            <RefreshCw size={16} className="flex-shrink-0" />
            <span className="ml-1.5">刷新</span>
          </Button>
        </div>
      </div>

      {/* 页面内容 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 实例列表 */}
        <div className="w-72 border-r border-gray-100 overflow-y-auto p-3">
          {instances.length > 0 ? (
            <div className="flex flex-col gap-2">
              {instances.map((instance) => (
                <InstanceCard
                  key={`${instance.workflowName}-${instance.instanceId}`}
                  instance={instance}
                  isActive={selectedInstance?.instanceId === instance.instanceId}
                  onClick={() => handleSelectInstance(instance)}
                />
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Activity size={28} className="text-macos-text-tertiary" />
              </div>
              <p className="text-sm text-macos-text-tertiary">暂无工作流实例</p>
              <p className="text-xs text-macos-text-tertiary mt-1">Agent 使用工作流后将在此显示</p>
            </div>
          )}
        </div>

        {/* 详情面板 */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedInstance ? (
            <div className="max-w-4xl mx-auto">
              {/* 实例信息 */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-lg font-semibold text-macos-text">
                    {selectedInstance.instanceId}
                  </h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[selectedInstance.status] || statusColors.unknown}`}>
                    {formatStatus(selectedInstance.status)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-macos-text-tertiary">
                  <span>工作流: {selectedInstance.workflowName}</span>
                  <span>创建: {formatRelativeTime(selectedInstance.createdAt)}</span>
                  {selectedInstance.currentStep && (
                    <span>当前: {selectedInstance.currentStep}</span>
                  )}
                  {selectedInstance.artifactCount > 0 && (
                    <span>产物: {selectedInstance.artifactCount}</span>
                  )}
                </div>
              </div>

              {/* process.md 执行进度 */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={16} className="text-macos-text-secondary" />
                  <h3 className="text-sm font-medium text-macos-text">执行进度 (process.md)</h3>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  {isLoadingDetail ? (
                    <p className="text-sm text-macos-text-tertiary">加载中...</p>
                  ) : processContent ? (
                    <MarkdownRenderer content={processContent} className="text-sm" />
                  ) : (
                    <p className="text-sm text-macos-text-tertiary">暂无进度数据</p>
                  )}
                </div>
              </div>

              {/* artifacts 产物列表 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Package size={16} className="text-macos-text-secondary" />
                  <h3 className="text-sm font-medium text-macos-text">节点产物 ({artifacts.length})</h3>
                </div>
                {artifacts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {artifacts.map((artifact) => (
                      <div
                        key={artifact.name}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <span className="text-sm font-mono text-macos-text truncate">
                          {artifact.name}
                        </span>
                        <div className="flex items-center gap-3 text-xs text-macos-text-tertiary flex-shrink-0 ml-2">
                          <span>{(artifact.size / 1024).toFixed(1)} KB</span>
                          <span>{formatRelativeTime(artifact.updatedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-macos-text-tertiary">暂无产物</p>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <FileText size={28} className="text-macos-text-tertiary" />
              </div>
              <p className="text-sm text-macos-text-tertiary">选择左侧实例查看详情</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
