import type { FC } from 'react'
import { Settings } from 'lucide-react'

export const WorkflowSettingsPage: FC = () => {
  return (
    <>
      <div className="h-16 px-6 flex items-center justify-end" />

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Settings size={20} className="text-macos-text-secondary" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-macos-text">工作流设置</h2>
          </div>

          <div className="flex flex-col gap-4">
            {/* 工作流存储路径 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">工作流存储路径</div>
              <div className="text-xs text-macos-text-tertiary">
                工作流定义和实例数据存储在项目根目录的 .workflows/ 目录下
              </div>
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded text-xs font-mono text-macos-text-secondary">
                .workflows/
              </div>
            </div>

            {/* 实例保留策略 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">实例保留</div>
              <div className="text-xs text-macos-text-tertiary">
                Agent 使用工作流产生的实例将自动存储在对应工作流的 instance/ 目录下，可在"实例"标签页中查看
              </div>
            </div>

            {/* 节点存储路径 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">节点存储路径</div>
              <div className="text-xs text-macos-text-tertiary">
                节点定义存储在项目根目录的 .nodes/ 目录下，跨资产来源共享
              </div>
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded text-xs font-mono text-macos-text-secondary">
                .nodes/
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
