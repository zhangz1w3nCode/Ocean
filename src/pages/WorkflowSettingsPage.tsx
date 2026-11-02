import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Settings, Sparkles, RotateCcw } from 'lucide-react'
import { Button, Switch, MarkdownEditor, Dropdown, Input } from '../components/ui'
import { useToastStore } from '../stores/toastStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { LlmReviewConfig } from '../types'
import {
  loadLlmReviewConfig, saveLlmReviewConfig,
  getDefaultLlmReviewConfig, DEFAULT_LLM_REVIEW_PROMPT,
} from '../utils/storage'

export const WorkflowSettingsPage: FC = () => {
  const { addToast } = useToastStore()
  const { llmProviders, loadLLMProviders } = useSettingsStore()
  const [llmReviewConfig, setLlmReviewConfig] = useState<LlmReviewConfig>(getDefaultLlmReviewConfig())
  const [savingReview, setSavingReview] = useState(false)

  useEffect(() => {
    loadLlmReviewConfig().then(setLlmReviewConfig)
    loadLLMProviders()
  }, [loadLLMProviders])

  // ---------- LLM 提供商/模型联动（复用全局 LLM 设置） ----------
  const providerOptions = llmProviders.map((p) => ({ value: p.id, label: p.name }))
  const selectedProvider =
    llmProviders.find((p) => p.id === llmReviewConfig.providerId) || llmProviders[0] || null
  const modelOptions: { value: string; label: string }[] = (() => {
    if (!selectedProvider) return []
    const list = [...(selectedProvider.availableModels || [])]
    if (selectedProvider.defaultModel && !list.includes(selectedProvider.defaultModel)) {
      list.unshift(selectedProvider.defaultModel)
    }
    return list.map((m) => ({ value: m, label: m }))
  })()

  // 将回退选中的 provider 固化为显式 id，避免落盘空串造成隐式依赖
  const explicitProviderId = llmReviewConfig.providerId || selectedProvider?.id || ''

  // 审核方式：开关决定启停，下拉决定用 LLM 还是 Agent 智能审核
  const reviewMode: 'llm' | 'agent' = llmReviewConfig.mode === 'agent' ? 'agent' : 'llm'

  const handleReviewToggle = async (checked: boolean) => {
    if (checked && reviewMode === 'llm' && llmProviders.length === 0) {
      addToast('请先在「设置 → LLM」中配置模型提供商', 'error')
      return
    }
    const next = {
      ...llmReviewConfig,
      enabled: checked,
      mode: reviewMode,
      agent: llmReviewConfig.agent ?? { executable: '', model: '', timeoutMs: 300000 },
      providerId: checked && reviewMode === 'llm' ? explicitProviderId : llmReviewConfig.providerId,
    }
    setLlmReviewConfig(next)
    const ok = await saveLlmReviewConfig(next)
    if (!ok) {
      addToast('产物审核配置保存失败', 'error')
    }
  }

  const handleModeChange = async (nextMode: 'llm' | 'agent') => {
    if (nextMode === 'llm' && llmProviders.length === 0) {
      addToast('请先在「设置 → LLM」中配置模型提供商', 'error')
      return
    }
    const next = {
      ...llmReviewConfig,
      enabled: true,
      mode: nextMode,
      agent: llmReviewConfig.agent ?? { executable: '', model: '', timeoutMs: 300000 },
      providerId: nextMode === 'llm' ? explicitProviderId : llmReviewConfig.providerId,
    }
    setLlmReviewConfig(next)
    const ok = await saveLlmReviewConfig(next)
    if (!ok) {
      addToast('产物审核配置保存失败', 'error')
    }
  }

  const handleSaveReview = async () => {
    setSavingReview(true)
    try {
      const next = { ...llmReviewConfig, providerId: explicitProviderId }
      setLlmReviewConfig(next)
      const ok = await saveLlmReviewConfig(next)
      if (ok) {
        addToast('LLM 智能审核配置已保存', 'success')
      } else {
        addToast('LLM 智能审核配置保存失败', 'error')
      }
    } finally {
      setSavingReview(false)
    }
  }

  const handleResetPrompt = () => {
    setLlmReviewConfig((c) => ({ ...c, prompt: DEFAULT_LLM_REVIEW_PROMPT }))
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

            {/* LLM 智能审核产物 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-macos-text-secondary" />
                  <div className="text-sm font-medium text-macos-text">产物审核策略</div>
                </div>
                <Switch
                  checked={llmReviewConfig.enabled}
                  onChange={handleReviewToggle}
                  size="sm"
                />
              </div>
              <div className="mt-2 text-xs text-macos-text-tertiary leading-relaxed">
                开启后，执行 <span className="font-mono">ocean workflow complete</span> 提交产物时先做一次符合性校验：
                审核不通过或审核器不可用时产物均不写入、状态不推进。
              </div>

              {llmReviewConfig.enabled && (
                <div className="mt-4 flex items-center justify-between gap-4 p-3 rounded-lg bg-gray-50">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-macos-text">审核方式</div>
                    <div className="text-xs text-macos-text-tertiary mt-0.5">
                      {reviewMode === 'llm'
                        ? 'LLM 审核：把产物与节点任务交给下方选定的模型直接判定'
                        : 'Agent 智能审核：交给本地 agent 用只读工具实地核对产物里的文件与命令输出'}
                    </div>
                  </div>
                  <Dropdown
                    value={reviewMode}
                    onChange={(v) => handleModeChange(v as 'llm' | 'agent')}
                    options={[
                      { value: 'llm', label: 'LLM 审核' },
                      { value: 'agent', label: 'Agent 智能审核' },
                    ]}
                    className="w-44 flex-shrink-0"
                  />
                </div>
              )}

              {reviewMode === 'agent' && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-macos-text mb-2">Agent</div>
                      <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-macos-text-secondary">pi（本地）</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-macos-text mb-2">可执行文件（可选）</div>
                      <Input
                        value={llmReviewConfig.agent?.executable || ''}
                        onChange={(e) => setLlmReviewConfig((c) => ({
                          ...c,
                          agent: { ...(c.agent ?? { executable: '', model: '', timeoutMs: 300000 }), executable: e.target.value },
                        }))}
                        placeholder="留空自动探测 pi"
                        className="w-full"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-macos-text mb-2">超时（秒）</div>
                      <Input
                        value={String(Math.round((llmReviewConfig.agent?.timeoutMs ?? 300000) / 1000))}
                        onChange={(e) => setLlmReviewConfig((c) => ({
                          ...c,
                          agent: { ...(c.agent ?? { executable: '', model: '', timeoutMs: 300000 }), timeoutMs: Math.max(30, Number(e.target.value) || 300) * 1000 },
                        }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-macos-text mb-2">审核用模型（可选）</div>
                    <Input
                      value={llmReviewConfig.agent?.model || ''}
                      onChange={(e) => setLlmReviewConfig((c) => ({
                        ...c,
                        agent: { ...(c.agent ?? { executable: '', model: '', timeoutMs: 300000 }), model: e.target.value },
                      }))}
                      placeholder="留空用 agent 默认模型"
                      className="w-full"
                    />
                  </div>
                  <p className="text-xs text-macos-text-tertiary">
                    审核在独立会话中进行，不会污染被审核实例的执行会话；审核 agent 同样受调度器守卫约束，无法推进工作流状态。
                  </p>
                </div>
              )}

              {reviewMode === 'llm' && (
                <>
                  {/* 提供商 / 模型 */}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-macos-text mb-2">模型提供商</div>
                      <Dropdown
                        value={selectedProvider?.id || ''}
                        options={providerOptions}
                        onChange={(v) =>
                          setLlmReviewConfig((c) => ({ ...c, providerId: v, model: '' }))
                        }
                        placeholder={providerOptions.length ? '请选择提供商' : '暂无可用提供商'}
                        className="w-full"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-macos-text mb-2">模型</div>
                      <Dropdown
                        value={llmReviewConfig.model || selectedProvider?.defaultModel || ''}
                        options={modelOptions}
                        onChange={(v) => setLlmReviewConfig((c) => ({ ...c, model: v }))}
                        placeholder={modelOptions.length ? '请选择模型' : '该提供商暂无模型'}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* 审核提示词 */}
                  <div className="flex items-center justify-between mb-2 mt-5">
                    <span className="text-sm font-medium text-macos-text">审核提示词</span>
                    <Button variant="ghost" size="sm" onClick={handleResetPrompt} className="text-gray-600 hover:text-gray-800">
                      <RotateCcw size={14} className="mr-1.5" />
                      重置为默认
                    </Button>
                  </div>
                  <p className="text-xs text-macos-text-tertiary mb-2">
                    使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded">{'{{node_task}}'}</code> 注入节点任务内容、
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded">{'{{artifact}}'}</code> 注入产物内容。
                    提示词只需描述判断标准（是否按节点内容执行、何为敷衍/占位）；
                    LLM 输出格式由系统自动约束（对用户不可见），无需在提示词中维护
                  </p>
                  <MarkdownEditor
                    value={llmReviewConfig.prompt}
                    onChange={(e) => setLlmReviewConfig((c) => ({ ...c, prompt: e.target.value }))}
                    rows={12}
                    className="font-mono text-sm"
                  />

                  {/* LLM 参数 */}
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div>
                      <Input
                        label="温度 (temperature)"
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={llmReviewConfig.params.temperature}
                        onChange={(e) =>
                          setLlmReviewConfig((c) => ({
                            ...c,
                            params: { ...c.params, temperature: parseFloat(e.target.value) || 0 },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Input
                        label="最大输出 token"
                        type="number"
                        min={128}
                        step={128}
                        value={llmReviewConfig.params.maxTokens}
                        onChange={(e) =>
                          setLlmReviewConfig((c) => ({
                            ...c,
                            params: { ...c.params, maxTokens: parseInt(e.target.value) || 1024 },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Input
                        label="审核超时 (ms)"
                        type="number"
                        min={5000}
                        step={1000}
                        value={llmReviewConfig.params.timeoutMs}
                        onChange={(e) =>
                          setLlmReviewConfig((c) => ({
                            ...c,
                            params: { ...c.params, timeoutMs: parseInt(e.target.value) || 90000 },
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* 保存 */}
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="outline"
                      size="md"
                      onClick={handleSaveReview}
                      disabled={savingReview}
                    >
                      {savingReview ? '保存中...' : '保存'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
