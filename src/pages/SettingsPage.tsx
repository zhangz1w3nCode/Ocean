import type { FC } from 'react'
import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'
import { SettingsSidebar } from '../components/settings/SettingsSidebar'
import { LLMSettings } from './LLMSettings'
import { AgenticSettings } from '../components/settings/AgenticSettings'
import { SkillSettings } from '../components/settings/SkillSettings'
import { KnowledgeSettings } from '../components/settings/KnowledgeSettings'

export const SettingsPage: FC = () => {
  const { currentCategory, loadLLMProviders, loadAgenticConfig } = useSettingsStore()

  // 页面加载时加载设置数据
  useEffect(() => {
    loadLLMProviders()
    loadAgenticConfig()
  }, [loadLLMProviders, loadAgenticConfig])

  // 根据当前选中的分类渲染不同的设置内容
  const renderSettingsContent = () => {
    switch (currentCategory) {
      case 'llm':
        return <LLMSettings />
      case 'agentic':
        return <AgenticSettings />
      case 'skill':
        return <SkillSettings />
      case 'knowledge':
        return <KnowledgeSettings />
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