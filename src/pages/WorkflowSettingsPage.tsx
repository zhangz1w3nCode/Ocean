import type { FC } from 'react'
import { Settings } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { FOLLOW_ZOOM_DEFAULT, FOLLOW_ZOOM_MAX, FOLLOW_ZOOM_MIN } from '../utils/instanceFlowViewport'

export const WorkflowSettingsPage: FC = () => {
  const followZoom = useAppStore(s => s.followZoom)
  const setFollowZoom = useAppStore(s => s.setFollowZoom)
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
            {/* 跟随模式缩放比例 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium text-macos-text">跟随模式缩放比例</div>
                <span className="text-sm font-medium text-macos-text-secondary">{followZoom.toFixed(1)}x</span>
              </div>
              <div className="text-xs text-macos-text-tertiary mb-2">
                实例详情的执行进度图开启「跟随模式」后，聚焦当前正在执行节点时的放大倍数；1.0x 即节点原始尺寸
              </div>
              <input
                type="range"
                min={FOLLOW_ZOOM_MIN}
                max={FOLLOW_ZOOM_MAX}
                step={0.1}
                value={followZoom}
                onChange={(e) => { void setFollowZoom(Number(e.target.value)) }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-600"
              />
              <div className="flex items-center justify-between mt-1 text-[10px] text-macos-text-tertiary">
                <span>{FOLLOW_ZOOM_MIN}x</span>
                <span>默认 {FOLLOW_ZOOM_DEFAULT}x</span>
                <span>{FOLLOW_ZOOM_MAX}x</span>
              </div>
            </div>

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
