import type { FC } from 'react'
import { useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainContent } from './components/layout/MainContent'
import { Toast } from './components/ui'
import { ProjectSelectionPage } from './pages/ProjectSelectionPage'
import { useNodeStore } from './stores/nodeStore'
import { useWorkflowStore } from './stores/workflowStore'
import { useProjectStore } from './stores/projectStore'
import { useAppStore } from './stores/appStore'
import { useResourceStore } from './stores/resourceStore'
import { useAgentStore } from './stores/agentStore'
import { useKnowledgeStore } from './stores/knowledgeStore'
import { useSkillStore } from './stores/skillStore'

const App: FC = () => {
  const { loadNodeDefinitions } = useNodeStore()
  const { loadWorkflows } = useWorkflowStore()
  const { loadResourceFiles } = useResourceStore()
  const { loadAgentFiles } = useAgentStore()
  const { loadKnowledgeFiles } = useKnowledgeStore()
  const { loadSkillFiles } = useSkillStore()
  const { isProjectLoaded, loadAppConfigOnStart, currentProject, setCurrentProject } = useProjectStore()
  const { isSwitchingProject, finishSwitchingProject } = useAppStore()

  // 应用启动时加载应用配置
  useEffect(() => {
    loadAppConfigOnStart()
  }, [loadAppConfigOnStart])

  // 项目加载后加载数据
  useEffect(() => {
    if (isProjectLoaded && currentProject) {
      loadNodeDefinitions()
      loadWorkflows()
      loadResourceFiles()
      loadAgentFiles()
      loadKnowledgeFiles()
      loadSkillFiles()
      finishSwitchingProject()
    }
  }, [isProjectLoaded, currentProject, loadNodeDefinitions, loadWorkflows, loadResourceFiles, loadAgentFiles, loadKnowledgeFiles, loadSkillFiles, finishSwitchingProject])

  // 切换项目时的处理
  useEffect(() => {
    if (isSwitchingProject) {
      setCurrentProject(null)
    }
  }, [isSwitchingProject, setCurrentProject])

  // 显示项目选择页面
  if (!isProjectLoaded) {
    return (
      <>
        <ProjectSelectionPage />
        <Toast />
      </>
    )
  }

  return (
    <>
      {/* 窗口拖动区域 - 用于 macOS hiddenInset 标题栏 */}
      <div className="fixed top-0 left-0 right-0 h-8 drag-region z-50" />

      <div className="h-screen w-full flex bg-macos-bg overflow-hidden pt-8">
        <Sidebar />
        <MainContent />
      </div>
      <Toast />
    </>
  )
}

export default App