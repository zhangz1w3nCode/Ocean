import type { FC } from 'react'
import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch, CheckCircle2, AlertCircle, Loader2, RefreshCw, Sparkles, RotateCcw, UploadCloud,
} from 'lucide-react'
import { Button, Switch, MarkdownEditor, Dropdown } from '../components/ui'
import { useToastStore } from '../stores/toastStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  loadAssetGitStatus,
  initAssetGit,
  loadAssetGitConfig,
  saveAssetGitConfig,
  syncApprovedAssetsToLocal,
  getDefaultKnowledgeGitConfig,
  getDefaultKnowledgeGitCommitMessagePrompt,
} from '../utils/storage'

/**
 * 审核设置页：.ocean git 托管 + LLM 提交信息 + 一键同步。
 * 结构对齐 KnowledgeSettingsPage（P3），托管对象为 .ocean 资产源区仓库。
 */
export const ReviewSettingsPage: FC = () => {
  const { addToast } = useToastStore()
  const { llmProviders, loadLLMProviders } = useSettingsStore()

  const [checking, setChecking] = useState(true)
  const [managed, setManaged] = useState(false)
  const [branch, setBranch] = useState<string | null>(null)
  const [hasCommits, setHasCommits] = useState(false)
  const [initializing, setInitializing] = useState(false)

  const [gitConfig, setGitConfig] = useState(getDefaultKnowledgeGitConfig())
  const [savingConfig, setSavingConfig] = useState(false)

  const [syncing, setSyncing] = useState(false)

  const refreshStatus = useCallback(async (showToast = false) => {
    setChecking(true)
    try {
      const status = await loadAssetGitStatus()
      setManaged(status.managed)
      setBranch(status.branch)
      setHasCommits(status.hasCommits)
      if (showToast) {
        addToast(status.managed ? '.ocean 已开启 git 托管' : '.ocean 未开启 git 托管', status.managed ? 'success' : 'info')
      }
    } catch {
      setManaged(false)
      setBranch(null)
      setHasCommits(false)
      if (showToast) addToast('检测失败', 'error')
    } finally {
      setChecking(false)
    }
  }, [addToast])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    let cancelled = false
    loadAssetGitConfig().then((config) => {
      if (!cancelled) setGitConfig(config)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadLLMProviders()
  }, [loadLLMProviders])

  const providerOptions: { value: string; label: string }[] = llmProviders.map((p) => ({
    value: p.id,
    label: p.name,
  }))

  const selectedProvider =
    llmProviders.find((p) => p.id === gitConfig.llmProviderId) ||
    llmProviders[0] ||
    null

  const modelOptions: { value: string; label: string }[] = (() => {
    if (!selectedProvider) return []
    const list = [...(selectedProvider.availableModels || [])]
    if (selectedProvider.defaultModel && !list.includes(selectedProvider.defaultModel)) {
      list.unshift(selectedProvider.defaultModel)
    }
    return list.map((m) => ({ value: m, label: m }))
  })()

  const handleInit = useCallback(async () => {
    setInitializing(true)
    try {
      const result = await initAssetGit()
      if (result.success) {
        addToast('.ocean 已开启 git 托管（黑名单已排除密钥与运行态）', 'success')
        await refreshStatus()
      } else {
        addToast(`托管失败：${result.error || '未知错误'}`, 'error')
      }
    } catch (e: any) {
      addToast(`托管失败：${e.message || String(e)}`, 'error')
    } finally {
      setInitializing(false)
    }
  }, [refreshStatus, addToast])

  const handleSaveConfig = useCallback(async () => {
    let toSave = gitConfig
    if (gitConfig.llmCommitMessageEnabled) {
      const providerId = gitConfig.llmProviderId || selectedProvider?.id || ''
      const model = gitConfig.llmModel || selectedProvider?.defaultModel || ''
      if (!providerId) {
        addToast('请选择模型提供商', 'warning')
        return
      }
      if (!model) {
        addToast('请选择模型', 'warning')
        return
      }
      toSave = { ...gitConfig, llmProviderId: providerId, llmModel: model }
      setGitConfig(toSave)
    }
    setSavingConfig(true)
    try {
      const ok = await saveAssetGitConfig(toSave)
      addToast(ok ? '保存成功' : '保存失败', ok ? 'success' : 'error')
    } finally {
      setSavingConfig(false)
    }
  }, [gitConfig, selectedProvider, addToast])

  const handleResetPrompt = useCallback(() => {
    setGitConfig((c) => ({ ...c, llmCommitMessagePrompt: getDefaultKnowledgeGitCommitMessagePrompt() }))
    addToast('已重置为默认提示词', 'success')
  }, [addToast])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const report = await syncApprovedAssetsToLocal()
      if (!report) {
        addToast('同步失败', 'error')
        return
      }
      const summary = `同步完成：新增 ${report.added.length} / 更新 ${report.updated.length} / 跳过待审 ${report.skippedPending.length}；运行时目录中的其他内容保持不变`
      addToast(summary, 'success')
      console.log('[sync-approved-assets] 明细:', report)
    } finally {
      setSyncing(false)
    }
  }, [addToast])

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">

        {/* .ocean git 托管 */}
        <div className="p-4 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
            <div className="text-sm font-medium text-macos-text">资产 git 托管（.ocean）</div>
          </div>
          <div className="text-xs text-macos-text-tertiary mb-3">
            将 .ocean 资产源区作为独立 git 仓库托管，资产审核的 diff 基线、历史版本与提交均基于该仓库；密钥（llm-config.json）与运行态已由黑名单排除，不会入库
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {checking ? (
              <>
                <Loader2 size={14} className="animate-spin text-macos-text-tertiary" />
                <span className="text-macos-text-tertiary">检测中...</span>
              </>
            ) : managed ? (
              <>
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="text-macos-text whitespace-nowrap">已开启托管</span>
                {branch && (
                  <span className="px-2 py-0.5 bg-green-50 rounded font-mono text-green-600 text-xs whitespace-nowrap">
                    {branch}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-gray-50 rounded font-mono text-macos-text-tertiary whitespace-nowrap">
                  .ocean/.git
                </span>
                {!hasCommits && (
                  <span className="text-macos-text-tertiary">（暂无提交，首次审核通过后生成）</span>
                )}
              </>
            ) : (
              <>
                <AlertCircle size={14} className="text-macos-text-tertiary" />
                <span className="text-macos-text-tertiary">未开启托管</span>
              </>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            {!managed && !initializing && !checking && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInit}
                className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400"
              >
                托管
              </Button>
            )}
            {initializing && (
              <Button variant="outline" size="sm" disabled className="bg-[#E5E7EB] border border-gray-300 text-gray-700">
                <Loader2 size={14} className="animate-spin mr-1" />
                托管中...
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => refreshStatus(true)}
              disabled={checking || initializing}
              className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-3 py-1.5 text-sm"
            >
              <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* LLM 提交信息 */}
        <div className="p-4 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
              <div className="text-sm font-medium text-macos-text">LLM 生成提交信息</div>
            </div>
            <Switch
              checked={gitConfig.llmCommitMessageEnabled}
              onChange={(checked) =>
                setGitConfig((c) => ({ ...c, llmCommitMessageEnabled: checked }))
              }
              size="sm"
            />
          </div>
          <div className="text-xs text-macos-text-tertiary mb-3">
            开启后，资产审核通过时会调用下方选定的 LLM，依据资产变更内容按 Angular 规范生成提交信息；未开启或调用失败时使用默认提交信息。此处的提供商/模型选择独立保存，不影响设置中的 LLM 默认配置
          </div>

          {gitConfig.llmCommitMessageEnabled && (
            <>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-macos-text mb-2">模型提供商</div>
                  <Dropdown
                    value={selectedProvider?.id || ''}
                    options={providerOptions}
                    onChange={(v) => setGitConfig((c) => ({ ...c, llmProviderId: v, llmModel: '' }))}
                    placeholder={providerOptions.length ? '请选择提供商' : '暂无可用提供商'}
                    className="w-full"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-macos-text mb-2">模型</div>
                  <Dropdown
                    value={gitConfig.llmModel || selectedProvider?.defaultModel || ''}
                    options={modelOptions}
                    onChange={(v) => setGitConfig((c) => ({ ...c, llmModel: v }))}
                    placeholder={modelOptions.length ? '请选择模型' : '该提供商暂无模型'}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mb-2 mt-5">
                <span className="text-sm font-medium text-macos-text">提交信息提示词</span>
                <Button variant="ghost" size="sm" onClick={handleResetPrompt} className="text-gray-600 hover:text-gray-800">
                  <RotateCcw size={14} className="mr-1.5" />
                  重置为默认
                </Button>
              </div>
              <p className="text-xs text-macos-text-tertiary mb-2">
                使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded">{'{{diff}}'}</code> 作为资产变更内容的占位符
              </p>
              <MarkdownEditor
                value={gitConfig.llmCommitMessagePrompt}
                onChange={(e) => setGitConfig((c) => ({ ...c, llmCommitMessagePrompt: e.target.value }))}
                rows={12}
                className="font-mono text-sm"
              />
            </>
          )}

          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-4 py-2 text-sm"
            >
              {savingConfig ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>

        {/* 一键同步 */}
        <div className="p-4 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <UploadCloud size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
            <div className="text-sm font-medium text-macos-text">一键同步</div>
          </div>
          <div className="text-xs text-macos-text-tertiary mb-3">
            把审核通过（validated）的技能/智能体物化到运行时目录（.pi 或 .claude 下的 skills/agents，由资产来源设置决定）：运行时没有的新增，已有的覆盖；运行时目录里不在同步范围内的内容（未纳管或未过审）保持原样，不会被删除
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-4 py-2 text-sm"
          >
            {syncing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <UploadCloud size={14} className="mr-1.5" />}
            {syncing ? '同步中...' : '同步通过审核的资产'}
          </Button>
        </div>

      </div>
    </div>
  )
}
