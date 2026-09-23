import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Settings, ShieldCheck } from 'lucide-react'
import { Switch } from '../components/ui'
import { useToastStore } from '../stores/toastStore'
import type { JevConfig } from '../types'
import { loadJevConfig, saveJevConfig } from '../utils/storage'

export const WorkflowSettingsPage: FC = () => {
  const { addToast } = useToastStore()
  const [jevConfig, setJevConfig] = useState<JevConfig | null>(null)

  useEffect(() => {
    loadJevConfig().then(setJevConfig)
  }, [])

  // 保存时保留 baseUrl/apiKey（由一级设置维护），仅更新 validation 部分
  const persistValidation = async (next: JevConfig) => {
    setJevConfig(next)
    const ok = await saveJevConfig({ ...next, updatedAt: new Date().toISOString() })
    if (!ok) {
      addToast('Jev 校验配置保存失败', 'error')
    }
  }

  const handleToggle = async (checked: boolean) => {
    if (!jevConfig) return
    if (checked && !jevConfig.apiKey.trim()) {
      addToast('请先在「设置 → Jev」中配置 API Key', 'error')
      return
    }
    await persistValidation({
      ...jevConfig,
      validation: { ...jevConfig.validation, enabled: checked },
    })
  }

  const handleThresholdChange = async (value: number) => {
    if (!jevConfig) return
    await persistValidation({
      ...jevConfig,
      validation: { ...jevConfig.validation, threshold: value },
    })
  }

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

            {/* 产物符合性校验（Jev） */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-macos-text-secondary" />
                  <div className="text-sm font-medium text-macos-text">产物符合性校验（Jev）</div>
                </div>
                {jevConfig && (
                  <Switch
                    checked={jevConfig.validation.enabled}
                    onChange={handleToggle}
                    size="sm"
                  />
                )}
              </div>
              <div className="mt-2 text-xs text-macos-text-tertiary leading-relaxed">
                开启后，执行 <span className="font-mono">ocean workflow next</span> 推进时，Jev 会校验上一节点的产物是否按照节点内容执行：
                判定概率低于阈值则阻断推进，提示用 <span className="font-mono">ocean artifact update</span> 补正产物；
                Jev 服务不可用时自动降级为产物存在性检查，不阻断工作流。API 地址与密钥在「设置 → Jev」中配置。
              </div>

              {jevConfig && jevConfig.validation.enabled && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs font-medium text-macos-text-secondary">判定阈值</div>
                    <div className="text-xs font-mono text-macos-text">
                      {jevConfig.validation.threshold.toFixed(2)}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={0.95}
                    step={0.05}
                    value={jevConfig.validation.threshold}
                    onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
                    className="w-full accent-gray-900"
                  />
                  <div className="flex justify-between mt-1 text-[10px] text-macos-text-tertiary">
                    <span>0.30（宽松）</span>
                    <span>0.95（严格）</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
