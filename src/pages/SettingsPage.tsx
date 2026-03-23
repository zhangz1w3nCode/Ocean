import type { FC } from 'react'
import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { SettingsSidebar } from '../components/settings/SettingsSidebar'
import { LLMSettings } from './LLMSettings'
import { AgenticSettings } from '../components/settings/AgenticSettings'
import { AbilitySettings } from '../components/settings/AbilitySettings'
import { SkillSettings } from '../components/settings/SkillSettings'

export const SettingsPage: FC = () => {
  const { currentCategory, loadLLMProviders, loadAgenticConfig, loadAbilityConfig } = useSettingsStore()

  // 页面加载时加载设置数据
  useEffect(() => {
    loadLLMProviders()
    loadAgenticConfig()
    loadAbilityConfig()
  }, [loadLLMProviders, loadAgenticConfig, loadAbilityConfig])

  // 根据当前选中的分类渲染不同的设置内容
  const renderSettingsContent = () => {
    switch (currentCategory) {
      case 'llm':
        return <LLMSettings />
      case 'agentic':
        return <AgenticSettings />
      case 'ability':
        return <AbilitySettings />
      case 'skill':
        return <SkillSettings />
      default:
        return <LLMSettings />
    }
  }

  return (
    <div className="h-full pl-2 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex overflow-hidden">
        {/* 左侧设置项列表 */}
        <div className="w-52 pt-4 pb-4 pl-2">
          <SettingsSidebar />
        </div>

        {/* 右侧配置详情区域 */}
        <div className="flex-1 pl-2 pt-4 pb-4 pr-4 overflow-y-auto">
          {renderSettingsContent()}
        </div>
      </div>
    </div>
  )
}