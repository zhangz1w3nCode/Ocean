import type { FC } from 'react'
import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch, CheckCircle2, AlertCircle, Loader2, RefreshCw, Sparkles, RotateCcw,
} from 'lucide-react'
import { Button, Switch, MarkdownEditor, Dropdown } from '../components/ui'
import { useToastStore } from '../stores/toastStore'
import { useSettingsStore } from '../stores/settingsStore'
import {
  loadKnowledgeGitStatus,
  initKnowledgeGit,
  loadKnowledgeGitConfig,
  saveKnowledgeGitConfig,
  getDefaultKnowledgeGitConfig,
  getDefaultKnowledgeGitCommitMessagePrompt,
  type KnowledgeGitConfig,
} from '../utils/storage'

/**
 * 知识设置页：git 托管状态管理 + LLM 提交信息配置。
 */
export const KnowledgeSettingsPage: FC = () => {
  const { addToast } = useToastStore()
  const { llmProviders, loadLLMProviders } = useSettingsStore()

  const [checking, setChecking] = useState(true)
  const [managed, setManaged] = useState(false)
  const [branch, setBranch] = useState<string | null>(null)
  const [branchError, setBranchError] = useState<string | null>(null)
  const [hasCommits, setHasCommits] = useState(false)
  const [initializing, setInitializing] = useState(false)

  const [gitConfig, setGitConfig] = useState<KnowledgeGitConfig>(getDefaultKnowledgeGitConfig())
  const [savingConfig, setSavingConfig] = useState(false)

  // 刷新 git 托管状态
  const refreshStatus = useCallback(async (showToast = false) => {
    setChecking(true)
    try {
      const status = await loadKnowledgeGitStatus()
      setManaged(status.managed)
      setBranch(status.branch)
      setHasCommits(status.hasCommits)
      setBranchError(status.branchError || null)
      if (status.branchError) {
        addToast(status.branchError, 'warning')
      } else if (showToast) {
        addToast(status.managed ? '知识库已开启 git 托管' : '知识库未开启 git 托管', status.managed ? 'success' : 'info')
      }
    } catch {
      setManaged(false)
      setBranch(null)
      setBranchError(null)
      setHasCommits(false)
      if (showToast) addToast('检测失败', 'error')
    } finally {
      setChecking(false)
    }
  }, [addToast])

  // 进入页面刷新一次托管状态 + 加载 LLM 提交信息配置
  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    let cancelled = false
    loadKnowledgeGitConfig().then((config) => {
      if (!cancelled) setGitConfig(config)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadLLMProviders()
  }, [loadLLMProviders])

  // 提供商下拉选项（仅借用设置中的 LLM 配置，与是否启用无关，也不写回全局配置）
  const providerOptions: { value: string; label: string }[] = llmProviders.map((p) => ({
    value: p.id,
    label: p.name,
  }))

  // 当前选中提供商；未显式选择时回退到列表第一个（不依赖 isEnabled）
  const selectedProvider =
    llmProviders.find((p) => p.id === gitConfig.llmProviderId) ||
    llmProviders[0] ||
    null

  // 模型下拉选项：优先提供商已配置的可用模型，兜底默认模型
  const modelOptions: { value: string; label: string }[] = (() => {
    if (!selectedProvider) return []
    const list = [...(selectedProvider.availableModels || [])]
    if (selectedProvider.defaultModel && !list.includes(selectedProvider.defaultModel)) {
      list.unshift(selectedProvider.defaultModel)
    }
    return list.map((m) => ({ value: m, label: m }))
  })()

  // 开启 git 托管
  const handleInit = useCallback(async () => {
    setInitializing(true)
    try {
      const result = await initKnowledgeGit()
      if (result.success) {
        addToast('知识库已开启 git 托管', 'success')
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

  // 保存 LLM 提交信息配置
  const handleSaveConfig = useCallback(async () => {
    // 开启 LLM 生成提交信息时，必须选好提供商与模型，禁止保存空值
    let toSave = gitConfig
    if (gitConfig.llmCommitMessageEnabled) {
      // 归一化：把 UI 上隐式回退到的提供商/模型显式落盘，避免存成空
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
      const ok = await saveKnowledgeGitConfig(toSave)
      addToast(ok ? '保存成功' : '保存失败', ok ? 'success' : 'error')
    } finally {
      setSavingConfig(false)
    }
  }, [gitConfig, selectedProvider, addToast])

  const handleResetPrompt = useCallback(() => {
    setGitConfig((c) => ({ ...c, llmCommitMessagePrompt: getDefaultKnowledgeGitCommitMessagePrompt() }))
    addToast('已重置为默认提示词', 'success')
  }, [addToast])

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto flex flex-col gap-4">

        {/* 知识库 git 托管 */}
        <div className="p-4 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
            <div className="text-sm font-medium text-macos-text">知识库 git 托管</div>
          </div>
          <div className="text-xs text-macos-text-tertiary mb-3">
            将 .knowledges 作为独立 git 仓库托管，知识审核的 diff、历史版本与提交均基于该仓库，与项目仓库解耦
          </div>

          {/* 状态显示 */}
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
                  .knowledges/.git
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

          {branchError && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-red-500">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{branchError}</span>
            </div>
          )}

          {/* 操作按钮 */}
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
            开启后，审核通过时会调用下方选定的 LLM，依据知识卡片的变更内容按 Angular 规范生成提交信息；未开启或调用失败时使用默认提交信息。此处的提供商/模型选择独立保存，不影响设置中的 LLM 默认配置
          </div>

          {gitConfig.llmCommitMessageEnabled && (
            <>
              {/* 提供商 / 模型选择 */}
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
                使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded">{'{{diff}}'}</code> 作为知识卡片变更内容的占位符
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

      </div>
    </div>
  )
}
