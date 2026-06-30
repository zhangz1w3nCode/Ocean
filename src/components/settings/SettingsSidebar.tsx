import type { FC } from 'react'
import { Cpu, Bot, Wand2, BookOpen, LucideIcon } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import type { SettingsCategory } from '../../types'

interface SettingsItemProps {
  id: SettingsCategory
  label: string
  icon: LucideIcon
  isActive: boolean
  onClick: () => void
}

const SettingsItem: FC<SettingsItemProps> = ({ id: label, icon: Icon, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`
        relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
        text-sm font-medium transition-colors duration-200
        ${isActive
          ? 'bg-[#E5E7EB] text-gray-900 border border-gray-300'
          : 'text-gray-700 hover:bg-gray-100'
        }
      `}
    >
      {/* 选中状态左侧黑色竖线 */}
      {isActive && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-black rounded-full" />
      )}

      {/* 占位符，保持图标位置对齐 */}
      {isActive && <div className="w-1" />}

      <Icon size={20} strokeWidth={1.5} className={isActive ? 'text-gray-700' : 'text-gray-500'} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  )
}

export const SettingsSidebar: FC = () => {
  const { currentCategory, setCurrentCategory } = useSettingsStore()

  const settingsItems = [
    {
      id: 'llm' as SettingsCategory,
      label: 'LLM',
      icon: Cpu,
    },
    {
      id: 'agentic' as SettingsCategory,
      label: 'Agentic',
      icon: Bot,
    },
    {
      id: 'skill' as SettingsCategory,
      label: '技能',
      icon: Wand2,
    },
    {
      id: 'knowledge' as SettingsCategory,
      label: '知识',
      icon: BookOpen,
    }
  ]

  return (
    <div className="flex flex-col gap-1">
      {settingsItems.map((item) => (
        <SettingsItem
          key={item.id}
          {...item}
          isActive={currentCategory === item.id}
          onClick={() => setCurrentCategory(item.id)}
        />
      ))}
    </div>
  )
}