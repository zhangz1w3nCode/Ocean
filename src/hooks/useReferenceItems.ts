import { useMemo } from 'react'
import type { ReferenceItem, ReferenceCategory } from '../types'
import { useAgentStore } from '../stores/agentStore'
import { useNodeStore } from '../stores/nodeStore'
import { useWorkflowStore } from '../stores/workflowStore'
import { useResourceStore } from '../stores/resourceStore'
import { useCommandStore } from '../stores/commandStore'
import { useAbilityStore } from '../stores/abilityStore'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useSkillStore } from '../stores/skillStore'

interface UseReferenceItemsOptions {
  excludePath?: string  // 排除特定路径（如 ".claude/agents/xxx.md"）
}

// 库引用配置
const libraryConfig: { category: ReferenceCategory; name: string; path: string }[] = [
  { category: 'agents', name: '智能体库', path: '.claude/agents/' },
  { category: 'nodes', name: '节点库', path: '.claude/nodes/' },
  { category: 'workflows', name: '工作流库', path: '.claude/workflows/' },
  { category: 'resources', name: '资源文件库', path: '.claude/resources/' },
  { category: 'commands', name: '命令库', path: '.claude/commands/' },
  { category: 'abilities', name: '能力库', path: '.claude/abilities/' },
  { category: 'skills', name: '技能库', path: '.claude/skills/' },
  { category: 'knowledges', name: '知识库', path: '.claude/knowledges/' },
]

export function useReferenceItems(options: UseReferenceItemsOptions = {}): ReferenceItem[] {
  const { excludePath } = options

  const agentFiles = useAgentStore((state) => state.agentFiles)
  const nodeDefinitions = useNodeStore((state) => state.nodeDefinitions)
  const workflows = useWorkflowStore((state) => state.workflows)
  const resourceFiles = useResourceStore((state) => state.resourceFiles)
  const commandFiles = useCommandStore((state) => state.commandFiles)
  const abilityFiles = useAbilityStore((state) => state.abilityFiles)
  const skillFiles = useSkillStore((state) => state.skillFiles)
  const knowledgeFiles = useKnowledgeStore((state) => state.knowledgeFiles)

  return useMemo(() => {
    const items: ReferenceItem[] = []

    // 智能体 - 先添加库引用，再添加具体文件
    const agentLibrary = libraryConfig.find(c => c.category === 'agents')!
    if (agentLibrary.path !== excludePath) {
      items.push({
        id: 'library-agents',
        name: agentLibrary.name,
        category: 'agents',
        path: agentLibrary.path,
        isLibrary: true,
      })
    }
    agentFiles.forEach((agent) => {
      const path = `.claude/agents/${agent.name}.md`
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
    if (nodeLibrary.path !== excludePath) {
      items.push({
        id: 'library-nodes',
        name: nodeLibrary.name,
        category: 'nodes',
        path: nodeLibrary.path,
        isLibrary: true,
      })
    }
    nodeDefinitions.forEach((node) => {
      const path = `.claude/nodes/${node.name}.md`
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
    if (workflowLibrary.path !== excludePath) {
      items.push({
        id: 'library-workflows',
        name: workflowLibrary.name,
        category: 'workflows',
        path: workflowLibrary.path,
        isLibrary: true,
      })
    }
    workflows.forEach((workflow) => {
      // 工作流使用新的文件夹结构，路径为 .claude/workflows/{name}/WORKFLOW.md
      const path = `.claude/workflows/${workflow.name}/WORKFLOW.md`
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
    if (resourceLibrary.path !== excludePath) {
      items.push({
        id: 'library-resources',
        name: resourceLibrary.name,
        category: 'resources',
        path: resourceLibrary.path,
        isLibrary: true,
      })
    }
    resourceFiles.forEach((resource) => {
      const path = `.claude/resources/${resource.name}.md`
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

    // 命令 - 先添加库引用，再添加具体文件
    const commandLibrary = libraryConfig.find(c => c.category === 'commands')!
    if (commandLibrary.path !== excludePath) {
      items.push({
        id: 'library-commands',
        name: commandLibrary.name,
        category: 'commands',
        path: commandLibrary.path,
        isLibrary: true,
      })
    }
    commandFiles.forEach((command) => {
      const path = `.claude/commands/${command.name}.md`
      if (path !== excludePath) {
        items.push({
          id: command.id,
          name: command.name,
          category: 'commands',
          path,
          description: command.description,
        })
      }
    })

    // 能力 - 先添加库引用，再添加具体文件
    const abilityLibrary = libraryConfig.find(c => c.category === 'abilities')!
    if (abilityLibrary.path !== excludePath) {
      items.push({
        id: 'library-abilities',
        name: abilityLibrary.name,
        category: 'abilities',
        path: abilityLibrary.path,
        isLibrary: true,
      })
    }
    abilityFiles.forEach((ability) => {
      const path = `.claude/abilities/${ability.name}.md`
      if (path !== excludePath) {
        items.push({
          id: ability.id,
          name: ability.name,
          category: 'abilities',
          path,
          description: ability.description,
        })
      }
    })

    // 技能 - 先添加库引用，再添加具体文件
    // 注意：技能使用文件夹结构，路径为 .claude/skills/{name}/SKILL.md
    const skillLibrary = libraryConfig.find(c => c.category === 'skills')!
    if (skillLibrary.path !== excludePath) {
      items.push({
        id: 'library-skills',
        name: skillLibrary.name,
        category: 'skills',
        path: skillLibrary.path,
        isLibrary: true,
      })
    }
    skillFiles.forEach((skill) => {
      // 技能使用文件夹结构，路径为 .claude/skills/{name}/SKILL.md
      const path = `.claude/skills/${skill.name}/SKILL.md`
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
    if (knowledgeLibrary.path !== excludePath) {
      items.push({
        id: 'library-knowledges',
        name: knowledgeLibrary.name,
        category: 'knowledges',
        path: knowledgeLibrary.path,
        isLibrary: true,
      })
    }
    knowledgeFiles.forEach((knowledge) => {
      const knowledgePath = knowledge.filepath || (knowledge.category ? `${knowledge.category}/${knowledge.name}` : knowledge.name)
      const path = `.claude/knowledges/${knowledgePath}.md`
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
  }, [excludePath, agentFiles, nodeDefinitions, workflows, resourceFiles, commandFiles, abilityFiles, skillFiles, knowledgeFiles])
}