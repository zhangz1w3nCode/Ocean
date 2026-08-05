import { useMemo } from 'react'
import type { ReferenceItem, ReferenceCategory } from '../types'
import { useAgentStore } from '../stores/agentStore'
import { useNodeStore } from '../stores/nodeStore'
import { useWorkflowStore } from '../stores/workflowStore'
import { useResourceStore } from '../stores/resourceStore'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useSkillStore } from '../stores/skillStore'
import { useSettingsStore } from '../stores/settingsStore'

interface UseReferenceItemsOptions {
  excludePath?: string  // 排除特定路径（如 ".claude/agents/xxx.md" 或 ".pi/agents/xxx.md"）
}

// 库引用配置（subDir 为资产根目录下的相对子目录）
const libraryConfig: { category: ReferenceCategory; name: string; subDir: string }[] = [
  { category: 'agents', name: '智能体库', subDir: 'agents/' },
  { category: 'nodes', name: '节点库', subDir: 'nodes/' },
  { category: 'workflows', name: '工作流库', subDir: 'workflows/' },
  { category: 'resources', name: '资源文件库', subDir: 'resources/' },
  { category: 'skills', name: '技能库', subDir: 'skills/' },
  { category: 'knowledges', name: '知识库', subDir: 'knowledges/' },
]

export function useReferenceItems(options: UseReferenceItemsOptions = {}): ReferenceItem[] {
  const { excludePath } = options
  const assetRoot = useSettingsStore((state) => state.assetRoot)
  const assetDir = assetRoot === 'pi' ? '.pi' : '.claude'

  const agentFiles = useAgentStore((state) => state.agentFiles)
  const nodeDefinitions = useNodeStore((state) => state.nodeDefinitions)
  const workflows = useWorkflowStore((state) => state.workflows)
  const resourceFiles = useResourceStore((state) => state.resourceFiles)
  const skillFiles = useSkillStore((state) => state.skillFiles)
  const knowledgeFiles = useKnowledgeStore((state) => state.knowledgeFiles)

  return useMemo(() => {
    const items: ReferenceItem[] = []

    // 智能体 - 先添加库引用，再添加具体文件
    const agentLibrary = libraryConfig.find(c => c.category === 'agents')!
    if (`${assetDir}/${agentLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-agents',
        name: agentLibrary.name,
        category: 'agents',
        path: `${assetDir}/${agentLibrary.subDir}`,
        isLibrary: true,
      })
    }
    agentFiles.forEach((agent) => {
      const path = `${assetDir}/agents/${agent.name}.md`
      if (path !== excludePath) {
        items.push({
          id: agent.id,
          name: agent.name,
          category: 'agents',
          path,
          description: agent.description,
        })
      }
    })

    // 节点 - 先添加库引用，再添加具体文件
    const nodeLibrary = libraryConfig.find(c => c.category === 'nodes')!
    if (`${assetDir}/${nodeLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-nodes',
        name: nodeLibrary.name,
        category: 'nodes',
        path: `${assetDir}/${nodeLibrary.subDir}`,
        isLibrary: true,
      })
    }
    nodeDefinitions.forEach((node) => {
      const path = `${assetDir}/nodes/${node.name}.md`
      if (path !== excludePath) {
        items.push({
          id: node.id,
          name: node.name,
          category: 'nodes',
          path,
          description: node.description,
        })
      }
    })

    // 工作流 - 先添加库引用，再添加具体文件
    // 注意：工作流已使用新的文件夹结构，路径为 .claude/workflows/{name}/WORKFLOW.md
    const workflowLibrary = libraryConfig.find(c => c.category === 'workflows')!
    if (`${assetDir}/${workflowLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-workflows',
        name: workflowLibrary.name,
        category: 'workflows',
        path: `${assetDir}/${workflowLibrary.subDir}`,
        isLibrary: true,
      })
    }
    workflows.forEach((workflow) => {
      // 工作流使用新的文件夹结构，路径为 .claude/workflows/{name}/WORKFLOW.md
      const path = `${assetDir}/workflows/${workflow.name}/WORKFLOW.md`
      if (path !== excludePath) {
        items.push({
          id: workflow.id,
          name: workflow.name,
          category: 'workflows',
          path,
          description: workflow.description,
        })
      }
    })

    // 资源文件 - 先添加库引用，再添加具体文件
    const resourceLibrary = libraryConfig.find(c => c.category === 'resources')!
    if (`${assetDir}/${resourceLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-resources',
        name: resourceLibrary.name,
        category: 'resources',
        path: `${assetDir}/${resourceLibrary.subDir}`,
        isLibrary: true,
      })
    }
    resourceFiles.forEach((resource) => {
      const path = `${assetDir}/resources/${resource.name}.md`
      if (path !== excludePath) {
        items.push({
          id: resource.id,
          name: resource.name,
          category: 'resources',
          path,
          description: resource.description,
        })
      }
    })

    // 技能 - 先添加库引用，再添加具体文件
    // 注意：技能使用文件夹结构，路径为 .claude/skills/{name}/SKILL.md
    const skillLibrary = libraryConfig.find(c => c.category === 'skills')!
    if (`${assetDir}/${skillLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-skills',
        name: skillLibrary.name,
        category: 'skills',
        path: `${assetDir}/${skillLibrary.subDir}`,
        isLibrary: true,
      })
    }
    skillFiles.forEach((skill) => {
      // 技能使用文件夹结构，路径为 .claude/skills/{name}/SKILL.md
      const path = `${assetDir}/skills/${skill.name}/SKILL.md`
      if (path !== excludePath) {
        items.push({
          id: skill.id,
          name: skill.name,
          category: 'skills',
          path,
          description: skill.description,
        })
      }
    })

    // 知识库 - 先添加库引用，再添加具体文件
    const knowledgeLibrary = libraryConfig.find(c => c.category === 'knowledges')!
    if (`${assetDir}/${knowledgeLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-knowledges',
        name: knowledgeLibrary.name,
        category: 'knowledges',
        path: `${assetDir}/${knowledgeLibrary.subDir}`,
        isLibrary: true,
      })
    }
    knowledgeFiles.forEach((knowledge) => {
      const knowledgePath = knowledge.filepath || (knowledge.category ? `${knowledge.category}/${knowledge.name}` : knowledge.name)
      const path = `${assetDir}/knowledges/${knowledgePath}.md`
      if (path !== excludePath) {
        items.push({
          id: knowledge.id,
          name: knowledge.name,
          category: 'knowledges',
          path,
          description: knowledge.description,
        })
      }
    })

    return items
  }, [excludePath, assetRoot, agentFiles, nodeDefinitions, workflows, resourceFiles, skillFiles, knowledgeFiles])
}