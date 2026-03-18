import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff, Type, Link, Key, Box, Database, Cpu, Plus, X, ChevronDown, Settings, ChevronUp } from 'lucide-react'
import { Modal, Button, ConfirmModal } from '../ui'
import { Input } from '../ui/Input'
import { useToastStore } from '../../stores/toastStore'
import type { LLMProvider, LLMProviderType, LLMModelParams } from '../../types'

interface LLMProviderModalProps {
  isOpen: boolean
  provider: LLMProvider | null
  onSave: (data: Partial<LLMProvider>) => void
  onClose: () => void
}

const PROVIDER_TYPES: { value: LLMProviderType; label: string; defaultBaseUrl: string }[] = [
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1' },
  { value: 'azure', label: 'Azure', defaultBaseUrl: '' },
  { value: 'custom', label: 'Custom', defaultBaseUrl: '' },
]

// 常用模型推荐
const POPULAR_MODELS: Record<string, string[]> = {
  'openai': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  'anthropic': ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'],
  'azure': ['gpt-4', 'gpt-4o', 'gpt-35-turbo'],
  'custom': [],
}

export const LLMProviderModal: FC<LLMProviderModalProps> = ({
  isOpen,
  provider,
  onSave,
  onClose,
}) => {
  const { addToast } = useToastStore()
  const [formData, setFormData] = useState({
    name: '',
    type: 'openai' as LLMProviderType,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    defaultModel: '',
    availableModels: [] as string[],
    modelParams: {
      temperature: 0.7,
      maxTokens: 4096,
    } as LLMModelParams,
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [newModelInput, setNewModelInput] = useState('')
  const [showAdvancedParams, setShowAdvancedParams] = useState(false)

  // 验证失败的字段
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)

  // 初始数据快照（用于检测是否有修改）
  const initialSnapshot = useRef<string>('')

  // 生成当前数据快照
  const getSnapshot = () => {
    return JSON.stringify(formData)
  }

  // 检测是否有修改
  const hasChanges = () => {
    return getSnapshot() !== initialSnapshot.current
  }

  useEffect(() => {
    if (isOpen) {
      if (provider) {
        // 编辑模式：填充现有数据
        setFormData({
          name: provider.name,
          type: provider.type,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          defaultModel: provider.defaultModel,
          availableModels: provider.availableModels,
          modelParams: provider.modelParams || {
            temperature: 0.7,
            maxTokens: 4096,
          },
        })
      } else {
        // 创建模式:重置表单
        setFormData({
          name: '',
          type: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          defaultModel: '',
          availableModels: [],
          modelParams: {
            temperature: 0.7,
            maxTokens: 4096,
          },
        })
      }
      setNewModelInput('')
      setInvalidFields(new Set())
      setShowApiKey(false)
      setShowAdvancedParams(false)
      // 延迟设置快照,确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [provider, isOpen])

  const handleTypeChange = (type: LLMProviderType) => {
    const selectedType = PROVIDER_TYPES.find(t => t.value === type)
    setFormData({
      ...formData,
      type,
      baseUrl: selectedType?.defaultBaseUrl || formData.baseUrl,
      // 切换类型时清空模型列表
      availableModels: [],
      defaultModel: '',
    })
  }

  // 添加模型
  const handleAddModel = () => {
    const modelName = newModelInput.trim()
    if (!modelName) {
      addToast('请输入模型名称', 'warning')
      return
    }
    if (formData.availableModels.includes(modelName)) {
      addToast('该模型已存在', 'warning')
      return
    }
    setFormData({
      ...formData,
      availableModels: [...formData.availableModels, modelName],
      // 如果是第一个模型，自动设为默认
      defaultModel: formData.defaultModel || modelName,
    })
    setNewModelInput('')
  }

  // 删除模型
  const handleRemoveModel = (model: string) => {
    const newModels = formData.availableModels.filter(m => m !== model)
    setFormData({
      ...formData,
      availableModels: newModels,
      // 如果删除的是默认模型，清空默认模型
      defaultModel: formData.defaultModel === model ? (newModels[0] || '') : formData.defaultModel,
    })
  }

  // 添加推荐模型
  const handleAddPopularModel = (model: string) => {
    if (formData.availableModels.includes(model)) {
      addToast('该模型已存在', 'warning')
      return
    }
    setFormData({
      ...formData,
      availableModels: [...formData.availableModels, model],
      defaultModel: formData.defaultModel || model,
    })
  }

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const handleSubmit = () => {
    // 验证提供商名称
    if (!formData.name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入提供商名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 验证 Base URL
    if (!formData.baseUrl.trim()) {
      setInvalidFields(new Set(['baseUrl']))
      addToast('请输入 Base URL', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }
    if (!isValidUrl(formData.baseUrl)) {
      setInvalidFields(new Set(['baseUrl']))
      addToast('请输入有效的 URL 格式', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 验证 API Key
    if (!formData.apiKey.trim()) {
      setInvalidFields(new Set(['apiKey']))
      addToast('请输入 API Key', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 验证至少有一个模型
    if (formData.availableModels.length === 0) {
      addToast('请至少添加一个模型', 'warning')
      return
    }

    // 清除验证失败状态
    setInvalidFields(new Set())

    onSave({
      name: formData.name.trim(),
      type: formData.type,
      baseUrl: formData.baseUrl.trim(),
      apiKey: formData.apiKey.trim(),
      defaultModel: formData.defaultModel,
      availableModels: formData.availableModels,
      modelParams: formData.modelParams,
    })

    addToast(provider ? '更新成功' : '创建成功', 'success')
  }

  const handleClose = (skipConfirm = false) => {
    // 如果不是跳过确认，且有修改，则显示确认弹窗
    if (!skipConfirm && hasChanges()) {
      setShowConfirm(true)
      return
    }

    setInvalidFields(new Set())
    onClose()
  }

  // 确认关闭
  const handleConfirmClose = () => {
    setShowConfirm(false)
    handleClose(true)
  }

  // 取消关闭
  const handleCancelClose = () => {
    setShowConfirm(false)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={provider ? '编辑 LLM 提供商' : '添加 LLM 提供商'}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => handleClose()}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmit}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
          {/* 提供商名称 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Type size={16} className="text-macos-text-secondary" />
              提供商名称
            </label>
            <Input
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value })
                if (invalidFields.has('name')) setInvalidFields(new Set())
              }}
              placeholder="例如：OpenAI GPT-4"
              invalid={invalidFields.has('name')}
              autoFocus
            />
          </div>

          {/* 提供商类型 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-2">
              <Cpu size={16} className="text-macos-text-secondary" />
              提供商类型
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PROVIDER_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleTypeChange(type.value)}
                  className={`
                    px-3 py-2 text-sm font-medium rounded-lg border transition-all
                    ${formData.type === type.value
                      ? 'border-gray-400 bg-gray-100 text-gray-800'
                      : 'border-macos-border hover:border-gray-300 hover:bg-gray-50 text-macos-text-secondary'
                    }
                  `}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Link size={16} className="text-macos-text-secondary" />
              Base URL
            </label>
            <Input
              value={formData.baseUrl}
              onChange={(e) => {
                setFormData({ ...formData, baseUrl: e.target.value })
                if (invalidFields.has('baseUrl')) setInvalidFields(new Set())
              }}
              placeholder="https://api.openai.com/v1"
              invalid={invalidFields.has('baseUrl')}
            />
          </div>

          {/* API Key */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Key size={16} className="text-macos-text-secondary" />
              API Key
            </label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={formData.apiKey}
                onChange={(e) => {
                  setFormData({ ...formData, apiKey: e.target.value })
                  if (invalidFields.has('apiKey')) setInvalidFields(new Set())
                }}
                placeholder="sk-..."
                invalid={invalidFields.has('apiKey')}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-macos-text-secondary hover:text-macos-text"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 默认模型 - 下拉选择 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Box size={16} className="text-macos-text-secondary" />
              默认模型
            </label>
            <div className="relative">
              <select
                value={formData.defaultModel}
                onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
                disabled={formData.availableModels.length === 0}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm
                           focus:outline-none focus:border-gray-400 focus:ring-0
                           disabled:opacity-50 disabled:cursor-not-allowed
                           appearance-none"
              >
                {formData.availableModels.length === 0 ? (
                  <option value="">请先添加模型</option>
                ) : (
                  formData.availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <p className="mt-1 text-xs text-macos-text-tertiary">
              从已添加的模型中选择默认使用的模型
            </p>
          </div>

          {/* 可用模型列表 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-2">
              <Database size={16} className="text-macos-text-secondary" />
              可用模型列表
            </label>

            {/* 推荐模型快捷添加 */}
            {POPULAR_MODELS[formData.type]?.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="text-xs text-gray-500 self-center">推荐：</span>
                {POPULAR_MODELS[formData.type].map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => handleAddPopularModel(model)}
                    disabled={formData.availableModels.includes(model)}
                    className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded
                               disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    + {model}
                  </button>
                ))}
              </div>
            )}

            {/* 添加新模型 */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddModel())}
                placeholder="输入模型名称（如：gpt-4o）"
                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm
                           focus:outline-none focus:border-gray-400 focus:ring-0
                           placeholder:text-gray-400"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddModel}
                className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200"
              >
                <Plus size={16} />
                添加
              </Button>
            </div>

            {/* 已添加的模型列表 */}
            {formData.availableModels.length > 0 ? (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                {formData.availableModels.map((model) => (
                  <div
                    key={model}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-sm
                                ${model === formData.defaultModel
                                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                  : 'bg-white text-gray-700 border border-gray-200'
                                }`}
                  >
                    <span>{model}</span>
                    {model === formData.defaultModel && (
                      <span className="text-xs text-indigo-500 ml-1">(默认)</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveModel(model)}
                      className="ml-1 p-0.5 hover:bg-red-100 hover:text-red-600 rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
                <p className="text-sm text-gray-500">暂无模型,请添加至少一个模型</p>
              </div>
            )}
          </div>

          {/* 模型参数配置 */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
              className="w-full flex items-center justify-between text-sm font-medium text-macos-text mb-2 hover:text-gray-700 transition-colors"
            >
              <label className="flex items-center gap-2">
                <Settings size={16} className="text-macos-text-secondary" />
                模型参数配置
              </label>
              {showAdvancedParams ? (
                <ChevronUp size={16} className="text-macos-text-secondary" />
              ) : (
                <ChevronDown size={16} className="text-macos-text-secondary" />
              )}
            </button>

            {showAdvancedParams && (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                {/* Temperature */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-macos-text">Temperature (温度)</label>
                    <span className="text-xs text-macos-text-secondary font-mono">
                      {formData.modelParams.temperature?.toFixed(2) || '0.70'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={formData.modelParams.temperature || 0.7}
                    onChange={(e) => setFormData({
                      ...formData,
                      modelParams: {
                        ...formData.modelParams,
                        temperature: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <div className="flex justify-between text-xs text-macos-text-tertiary mt-1">
                    <span>精确 (0)</span>
                    <span>创造 (1)</span>
                  </div>
                </div>

                {/* Max Tokens */}
                <div>
                  <label className="block text-sm text-macos-text mb-1.5">Max Tokens (最大输出)</label>
                  <Input
                    type="number"
                    value={formData.modelParams.maxTokens || 4096}
                    onChange={(e) => setFormData({
                      ...formData,
                      modelParams: {
                        ...formData.modelParams,
                        maxTokens: parseInt(e.target.value) || 4096
                      }
                    })}
                    placeholder="4096"
                    min={1}
                    max={1000000}
                  />
                  <p className="mt-1 text-xs text-macos-text-tertiary">
                    模型返回的最大 token 数量,建议 4096-8192
                  </p>
                </div>

                {/* Top P */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-macos-text">Top P (核采样)</label>
                    <span className="text-xs text-macos-text-secondary font-mono">
                      {formData.modelParams.topP?.toFixed(2) || '未设置'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={formData.modelParams.topP || 1}
                    onChange={(e) => setFormData({
                      ...formData,
                      modelParams: {
                        ...formData.modelParams,
                        topP: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <p className="mt-1 text-xs text-macos-text-tertiary">
                    可选参数,建议使用 temperature 或 top_p 其中之一
                  </p>
                </div>

                {/* Frequency Penalty */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-macos-text">Frequency Penalty (频率惩罚)</label>
                    <span className="text-xs text-macos-text-secondary font-mono">
                      {formData.modelParams.frequencyPenalty?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={formData.modelParams.frequencyPenalty || 0}
                    onChange={(e) => setFormData({
                      ...formData,
                      modelParams: {
                        ...formData.modelParams,
                        frequencyPenalty: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <p className="mt-1 text-xs text-macos-text-tertiary">
                    降低重复相同内容的概率 (0-2)
                  </p>
                </div>

                {/* Presence Penalty */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-macos-text">Presence Penalty (存在惩罚)</label>
                    <span className="text-xs text-macos-text-secondary font-mono">
                      {formData.modelParams.presencePenalty?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={formData.modelParams.presencePenalty || 0}
                    onChange={(e) => setFormData({
                      ...formData,
                      modelParams: {
                        ...formData.modelParams,
                        presencePenalty: parseFloat(e.target.value)
                      }
                    })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <p className="mt-1 text-xs text-macos-text-tertiary">
                    降低重复谈论相同主题的概率 (0-2)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 确认关闭弹窗 */}
      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要退出吗？"
        confirmText="退出"
        cancelText="继续编辑"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
      />
    </>
  )
}
