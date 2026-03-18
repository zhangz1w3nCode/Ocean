import type { FC } from 'react'
import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'
import { CLIAgentCard } from './CLIAgentCard'
import { CLIAgentModal } from './CLIAgentModal'
import type { CLIAgent } from '../../types'

export const CLIAgentSettings: FC = () => {
  const { cliAgents, addCLIAgent, updateCLIAgent, deleteCLIAgent, setDefaultCLIAgent, testCLIAgent } = useSettingsStore()
  const { addToast } = useToastStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<CLIAgent | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const handleCreate = () => {
    setEditingAgent(null)
    setIsModalOpen(true)
  }

  const handleEdit = (agent: CLIAgent) => {
    setEditingAgent(agent)
    setIsModalOpen(true)
  }

  const handleDelete = (id: string) => {
    deleteCLIAgent(id)
    addToast('删除成功', 'success')
  }

  const handleTest = async (id: string) => {
    const success = await testCLIAgent(id)
    if (success) {
      addToast('可执行文件验证成功', 'success')
    } else {
      addToast('可执行文件验证失败', 'error')
    }
  }

  const handleSetDefault = (id: string) => {
    setDefaultCLIAgent(id)
    addToast('已设置为默认 Agent', 'success')
  }

  const handleToggleEnabled = (id: string, enabled: boolean) => {
    updateCLIAgent(id, { isEnabled: enabled })
    addToast(enabled ? '已启用' : '已禁用', 'success')
  }

  const handleSave = (agentData: Partial<CLIAgent>) => {
    if (editingAgent) {
      // 编辑模式
      updateCLIAgent(editingAgent.id, agentData)
      addToast('更新成功', 'success')
    } else {
      // 创建模式
      const newAgent: CLIAgent = {
        id: `agent-${Date.now()}`,
        name: agentData.name || '',
        type: agentData.type || 'claude-cli',
        executablePath: agentData.executablePath || '',
        description: agentData.description || '',
        isDefault: agentData.isDefault || false,
        isEnabled: agentData.isEnabled !== undefined ? agentData.isEnabled : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      addCLIAgent(newAgent)
      addToast('创建成功', 'success')
    }
    setIsModalOpen(false)
    setEditingAgent(null)
  }

  // 过滤 Agent
  const filteredAgents = cliAgents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.executablePath.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
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
            添加 Agent
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-base mb-2">暂无 CLI Agent 配置</p>
            <p className="text-sm text-gray-400">点击右上角"添加 Agent"按钮创建配置</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <CLIAgentCard
                key={agent.id}
                agent={agent}
                onEdit={() => handleEdit(agent)}
                onDelete={() => handleDelete(agent.id)}
                onTest={() => handleTest(agent.id)}
                onSetDefault={() => handleSetDefault(agent.id)}
                onToggleEnabled={(enabled) => handleToggleEnabled(agent.id, enabled)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑弹窗 */}
      <CLIAgentModal
        isOpen={isModalOpen}
        agent={editingAgent}
        onSave={handleSave}
        onClose={() => {
          setIsModalOpen(false)
          setEditingAgent(null)
        }}
      />
    </div>
  )
}