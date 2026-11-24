import { useMemo } from 'react'
import type { ReferenceItem, ReferenceCategory } from '../types'
import { useAgentStore } from '../stores/agentStore'
import { useNodeStore } from '../stores/nodeStore'
import { useWorkflowStore } from '../stores/workflowStore'
import { useResourceStore } from '../stores/resourceStore'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { useSkillStore } from '../stores/skillStore'
import { useCodebaseStore } from '../stores/codebaseStore'

interface UseReferenceItemsOptions {
  excludePath?: string  // 排除特定路径（如 ".ocean/agents/xxx.md"）
}

// 库引用配置（subDir 为 .ocean 资产源区下的相对子目录）
const libraryConfig: { category: ReferenceCategory; name: string; subDir: string }[] = [
  { category: 'agents', name: '智能体库', subDir: 'agents/' },
  { category: 'nodes', name: '节点库', subDir: 'nodes/' },
  { category: 'workflows', name: '工作流库', subDir: 'workflows/' },
  { category: 'resources', name: '资源文件库', subDir: 'resources/' },
  { category: 'skills', name: '技能库', subDir: 'skills/' },
  { category: 'knowledges', name: '知识库', subDir: 'knowledges/' },
  { category: 'codebases', name: '代码库', subDir: 'codebases/' },
]

export function useReferenceItems(options: UseReferenceItemsOptions = {}): ReferenceItem[] {
  const { excludePath } = options

  const agentFiles = useAgentStore((state) => state.agentFiles)
  const nodeDefinitions = useNodeStore((state) => state.nodeDefinitions)
  const workflows = useWorkflowStore((state) => state.workflows)
  const resourceFiles = useResourceStore((state) => state.resourceFiles)
  const skillFiles = useSkillStore((state) => state.skillFiles)
  const knowledgeFiles = useKnowledgeStore((state) => state.knowledgeFiles)
  const codebases = useCodebaseStore((state) => state.codebases)

  return useMemo(() => {
    const items: ReferenceItem[] = []

    // 智能体 - 先添加库引用，再添加具体文件
    const agentLibrary = libraryConfig.find(c => c.category === 'agents')!
    if (`.ocean/${agentLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-agents',
        name: agentLibrary.name,
        category: 'agents',
        path: `.ocean/${agentLibrary.subDir}`,
        isLibrary: true,
      })
    }
    agentFiles.forEach((agent) => {
      const path = `.ocean/agents/${agent.name}.md`
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

    // 节点 - 先添加库引用，再添加具体文件（节点存储在 .ocean/nodes）
    const nodeLibrary = libraryConfig.find(c => c.category === 'nodes')!
    if (`.ocean/nodes/` !== excludePath) {
      items.push({
        id: 'library-nodes',
        name: nodeLibrary.name,
        category: 'nodes',
        path: '.ocean/nodes/',
        isLibrary: true,
      })
    }
    nodeDefinitions.forEach((node) => {
      const path = `.ocean/nodes/${node.name}.md`
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
    // 工作流存储在 .ocean/workflows
    const workflowLibrary = libraryConfig.find(c => c.category === 'workflows')!
    if (`.ocean/workflows/` !== excludePath) {
      items.push({
        id: 'library-workflows',
        name: workflowLibrary.name,
        category: 'workflows',
        path: '.ocean/workflows/',
        isLibrary: true,
      })
    }
    workflows.forEach((workflow) => {
      // 工作流引用只拼接 workflow 名称，不拼接相对路径（CLI/主进程按名称寻址 .ocean/workflows/{name}/）
      const path = workflow.name
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

    // 资源文件 - 先添加库引用，再添加具体文件（存储在 .ocean/resources）
    const resourceLibrary = libraryConfig.find(c => c.category === 'resources')!
    if (`.ocean/resources/` !== excludePath) {
      items.push({
        id: 'library-resources',
        name: resourceLibrary.name,
        category: 'resources',
        path: '.ocean/resources/',
        isLibrary: true,
      })
    }
    resourceFiles.forEach((resource) => {
      const path = `.ocean/resources/${resource.name}.md`
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

    // 技能 - 先添加库引用，再添加具体文件（存储在 .ocean/skills）
    // 技能引用只拼接 skill 名称，不拼接相对路径
    const skillLibrary = libraryConfig.find(c => c.category === 'skills')!
    if (`.ocean/${skillLibrary.subDir}` !== excludePath) {
      items.push({
        id: 'library-skills',
        name: skillLibrary.name,
        category: 'skills',
        path: `.ocean/${skillLibrary.subDir}`,
        isLibrary: true,
      })
    }
    skillFiles.forEach((skill) => {
      const path = skill.name
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

    // 知识库 - 先添加库引用，再添加具体文件（存储在 .ocean/knowledges）
    const knowledgeLibrary = libraryConfig.find(c => c.category === 'knowledges')!
    if (`.ocean/knowledges/` !== excludePath) {
      items.push({
        id: 'library-knowledges',
        name: knowledgeLibrary.name,
        category: 'knowledges',
        path: '.ocean/knowledges/',
        isLibrary: true,
      })
    }
    knowledgeFiles.filter((k) => k.reviewStatus === 'validated').forEach((knowledge) => {
      const knowledgePath = knowledge.filepath || (knowledge.category ? `${knowledge.category}/${knowledge.name}` : knowledge.name)
      const path = `.ocean/knowledges/${knowledgePath}.md`
      if (path !== excludePath) {
        items.push({
          id: knowledge.id,
          name: knowledge.name,
          category: 'knowledges',
          path,
          description: knowledge.summary,
        })
      }
    })

    // 代码库 - 先添加库引用，再添加具体代码库（存储在 .ocean/codebases）
    const codebaseLibrary = libraryConfig.find(c => c.category === 'codebases')!
    if (`.ocean/codebases/` !== excludePath) {
      items.push({
        id: 'library-codebases',
        name: codebaseLibrary.name,
        category: 'codebases',
        path: '.ocean/codebases/',
        isLibrary: true,
      })
    }
    codebases.forEach((codebase) => {
      const path = `.ocean/codebases/${codebase.name}/`
      if (path !== excludePath) {
        items.push({
          id: `codebase-${codebase.name}`,
          name: codebase.name,
          category: 'codebases',
          path,
          description: codebase.preview,
        })
      }
    })

    return items
  }, [excludePath, agentFiles, nodeDefinitions, workflows, resourceFiles, skillFiles, knowledgeFiles, codebases])
}