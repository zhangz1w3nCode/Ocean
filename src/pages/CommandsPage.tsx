import type { FC } from 'react'
import { Plus, Search, Terminal } from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { CommandCard, CommandModal, CommandDetailModal } from '../components/command'
import { useCommandStore } from '../stores/commandStore'
import { useState, useEffect } from 'react'
import type { CommandFile } from '../types'

export const CommandsPage: FC = () => {
  const { commandFiles, addCommandFile, updateCommandFile, deleteCommandFile, loadCommandFiles } =
    useCommandStore()
  const [searchQuery, setSearchQuery] = useState('')

  // 详情弹窗状态
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingCommand, setViewingCommand] = useState<CommandFile | null>(null)

  // 编辑弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingCommand, setEditingCommand] = useState<CommandFile | undefined>()

  // 删除确认弹窗状态
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingCommandId, setDeletingCommandId] = useState<string | null>(null)

  // 首次加载时从本地读取命令数据
  useEffect(() => {
    loadCommandFiles()
  }, [loadCommandFiles])

  // 打开创建弹窗
  const handleCreateClick = () => {
    setModalMode('create')
    setEditingCommand(undefined)
    setIsModalOpen(true)
  }

  // 点击卡片 - 查看详情
  const handleCardClick = (command: CommandFile) => {
    setViewingCommand(command)
    setIsDetailOpen(true)
  }

  // 关闭详情弹窗
  const handleDetailClose = () => {
    setIsDetailOpen(false)
    setViewingCommand(null)
  }

  // 从详情弹窗进入编辑
  const handleEditFromDetail = () => {
    if (viewingCommand) {
      setIsDetailOpen(false)
      setModalMode('edit')
      setEditingCommand(viewingCommand)
      setIsModalOpen(true)
    }
  }

  // 打开编辑弹窗
  const handleEditClick = (command: CommandFile) => {
    setModalMode('edit')
    setEditingCommand(command)
    setIsModalOpen(true)
  }

  // 关闭编辑弹窗
  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingCommand(undefined)
  }

  // 确认创建/编辑
  const handleModalConfirm = (commandData: Omit<CommandFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => {
    const now = new Date().toISOString()

    if (modalMode === 'create') {
      // 创建新命令
      const newCommand: CommandFile = {
        ...commandData,
        id: `command-${Date.now()}`,
        type: 'command',
        createdAt: now,
        updatedAt: now,
      }
      addCommandFile(newCommand)
    } else if (modalMode === 'edit' && editingCommand) {
      // 更新命令
      updateCommandFile(editingCommand.id, {
        ...commandData,
        updatedAt: now,
      })
    }
  }

  // 点击删除
  const handleDeleteClick = (commandId: string) => {
    setDeletingCommandId(commandId)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    if (deletingCommandId) {
      deleteCommandFile(deletingCommandId)
    }
    setDeleteConfirmOpen(false)
    setDeletingCommandId(null)
  }

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setDeletingCommandId(null)
  }

  // 过滤命令文件
  const filteredCommands = commandFiles.filter((command) => {
    const matchesSearch =
      command.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      command.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      command.content?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  return (
    <div className="h-full pl-2 pr-4 pt-4 pb-4">
      {/* 白色圆角卡片容器 */}
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
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
                className="pl-9 pr-4 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg
                           placeholder:text-macos-text-tertiary focus:outline-none
                           hover:border-gray-300 focus:border-gray-400
                           focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                           transition-[border-color,box-shadow] duration-200"
              />
            </div>

            <Button
              variant="outline"
              onClick={handleCreateClick}
              className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
            >
              <Plus size={16} className="flex-shrink-0" />
              <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
                新建命令
              </span>
            </Button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredCommands.length > 0 ? (
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCommands.map((command) => (
                  <CommandCard
                    key={command.id}
                    command={command}
                    onClick={() => handleCardClick(command)}
                    onEdit={() => handleEditClick(command)}
                    onDelete={() => handleDeleteClick(command.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <Terminal size={32} className="text-macos-text-tertiary" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑命令弹窗 */}
      <CommandModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onConfirm={handleModalConfirm}
        mode={modalMode}
        initialData={editingCommand}
        existingNames={commandFiles.map((c) => c.name)}
      />

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message="确定要删除这个命令吗？此操作不可恢复。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 命令详情弹窗 */}
      <CommandDetailModal
        isOpen={isDetailOpen}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        command={viewingCommand}
      />
    </div>
  )
}