import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { Link, KeyRound, Save } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { Button, Input } from '../ui'
import type { JevConfig } from '../../types'
import { loadJevConfig, saveJevConfig } from '../../utils/storage'

export const JevSettings: FC = () => {
  const { addToast } = useToastStore()
  const [config, setConfig] = useState<JevConfig | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadJevConfig().then(setConfig)
  }, [])

  if (!config) {
    return (
      <div className="max-w-xl">
        <div className="text-sm text-macos-text-tertiary">加载中...</div>
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const next: JevConfig = {
        ...config,
        updatedAt: new Date().toISOString(),
      }
      const ok = await saveJevConfig(next)
      if (ok) {
        setConfig(next)
        addToast('Jev 配置已保存', 'success')
      } else {
        addToast('Jev 配置保存失败', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-base font-medium text-macos-text">Jev 配置</h2>
        <span className="text-xs text-macos-text-tertiary">TypeSafe AI System One</span>
      </div>

      <div className="flex flex-col gap-5">
        {/* 说明 */}
        <div className="p-4 rounded-lg border border-gray-100 bg-gray-50/50">
          <div className="text-xs text-macos-text-secondary leading-relaxed">
            Jev 用于工作流推进时校验节点产物是否符合节点内容要求（产物符合性判断）。
            校验开关与阈值在「工作流 → 设置」中配置；Jev 服务不可用时 CLI 自动降级为产物存在性检查，不阻断工作流。
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <Link size={16} className="text-macos-text-secondary" />
            API 地址
          </label>
          <Input
            value={config.baseUrl}
            onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            placeholder="https://api.typesafe.ai"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <KeyRound size={16} className="text-macos-text-secondary" />
            API Key
          </label>
          <Input
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder="TypeSafe API Key"
          />
          <div className="mt-1.5 text-xs text-macos-text-tertiary">
            配置存储在项目目录 .ocean/jev-config.json，仅本机使用
          </div>
        </div>

        {/* 保存 */}
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={saving}
          >
            <div className="flex items-center gap-1.5">
              <Save size={14} />
              {saving ? '保存中...' : '保存'}
            </div>
          </Button>
        </div>
      </div>
    </div>
  )
}
