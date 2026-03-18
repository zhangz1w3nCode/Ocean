import type { FC } from 'react'
import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { useToastStore } from '../stores/toastStore'
import { Button, ConfirmModal } from '../components/ui'
import { LLMProviderCard } from '../components/settings/LLMProviderCard'
import { LLMProviderModal } from '../components/settings/LLMProviderModal'
import type { LLMProvider } from '../types'

export const LLMSettings: FC = () => {
  const { llmProviders, addLLMProvider, updateLLMProvider, deleteLLMProvider, testLLMProvider } = useSettingsStore()
  const { addToast } = useToastStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null)

  const handleCreate = () => {
    setEditingProvider(null)
    setIsModalOpen(true)
  }

  const handleEdit = (provider: LLMProvider) => {
    setEditingProvider(provider)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (id: string) => {
    setDeletingProviderId(id)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = () => {
    if (deletingProviderId) {
      deleteLLMProvider(deletingProviderId)
      addToast('删除成功', 'success')
    }
    setDeleteConfirmOpen(false)
    setDeletingProviderId(null)
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingProviderId(null)
  }

  const handleTest = async (id: string) => {
    const success = await testLLMProvider(id)
    if (success) {
      addToast('配置验证通过', 'success')
    } else {
      addToast('配置不完整，请检查 Base URL 和 API Key', 'warning')
    }
  }

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    updateLLMProvider(id, { isEnabled: enabled })
    addToast(enabled ? '已启用' : '已禁用', 'success')
  }

  const handleSave = (providerData: Partial<LLMProvider>) => {
    if (editingProvider) {
      // 编辑模式
      updateLLMProvider(editingProvider.id, providerData)
    } else {
      // 创建模式 - 默认不启用
      const newProvider: LLMProvider = {
        id: `provider-${Date.now()}`,
        name: providerData.name || '',
        type: providerData.type || 'openai',
        baseUrl: providerData.baseUrl || '',
        apiKey: providerData.apiKey || '',
        defaultModel: providerData.defaultModel || '',
        availableModels: providerData.availableModels || [],
        isEnabled: false, // 默认不启用
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      addLLMProvider(newProvider)
    }
    setIsModalOpen(false)
    setEditingProvider(null)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingProvider(null)
  }

  // 过滤提供商
  const filteredProviders = llmProviders.filter(
    (provider) =>
      provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      provider.baseUrl.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col">
      {/* 页面头部 */}
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary"
            />
            <input
              type="text"
              placeholder=""
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-56 text-sm bg-white border border-gray-200 rounded-lg
                         placeholder:text-macos-text-tertiary focus:outline-none
                         hover:border-gray-300 focus:border-gray-400
                         focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                         transition-[border-color,box-shadow] duration-200"
            />
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCreate}
            className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
          >
            <Plus size={16} />
            添加提供商
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {filteredProviders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-base mb-2">暂无 LLM 提供商配置</p>
            <p className="text-sm text-gray-400">点击右上角"添加提供商"按钮创建配置</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProviders.map((provider) => (
              <LLMProviderCard
                key={provider.id}
                provider={provider}
                onEdit={() => handleEdit(provider)}
                onDelete={() => handleDeleteClick(provider.id)}
                onTest={() => handleTest(provider.id)}
                onToggleEnabled={(enabled) => handleToggleEnabled(provider.id, enabled)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      <LLMProviderModal
        isOpen={isModalOpen}
        provider={editingProvider}
        onSave={handleSave}
        onClose={handleModalClose}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个 LLM 提供商吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  )
}
