// Electron 本地存储工具

import type { AppConfig, KnowledgeGraphConfig, AgenticConfig, AgenticToolConfig, Usage, AgentLoopEvent } from '../types'
import { generateWorkflowMdContent } from './workflow-generator'

// 重新导出工作流生成器函数
export { generateWorkflowMdContent }

// 知识库文件夹树节点
export interface KnowledgeFolder {
  name: string
  path: string
  children: KnowledgeFolder[]
}

// 声明全局 window.electronAPI
declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>
      // 工作流文件相关（Markdown 格式，以名称命名文件）
      saveWorkflowFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadWorkflowFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      deleteWorkflowFile: (name: string) => Promise<{ success: boolean; error?: string }>
      loadAllWorkflowFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>
      // 工作流文件夹操作（新版文件夹结构）
      createWorkflowFolder: (name: string) => Promise<{ success: boolean; folderPath?: string; error?: string }>
      loadWorkflowMd: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      saveWorkflowMd: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadWorkflowFlowJson: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      saveWorkflowFlowJson: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadAllWorkflowFolders: () => Promise<{ success: boolean; folders?: string[]; error?: string }>
      deleteWorkflowFolder: (name: string) => Promise<{ success: boolean; error?: string }>
      renameWorkflowFolder: (oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>
      // 节点文件相关（Markdown 格式，以名称命名文件）
      saveNodeFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadNodeFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      deleteNodeFile: (name: string) => Promise<{ success: boolean; error?: string }>
      loadAllNodeFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>
      // 局部节点文件相关（存储在工作流的nodes目录下）
      saveLocalNode: (workflowName: string, nodeName: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadLocalNode: (workflowName: string, nodeName: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      loadAllLocalNodes: (workflowName: string) => Promise<{ success: boolean; files?: string[]; error?: string }>
      deleteLocalNode: (workflowName: string, nodeName: string) => Promise<{ success: boolean; error?: string }>
      // 资源文件相关（Markdown 格式，以名称命名文件）
      saveResourceFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadResourceFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      deleteResourceFile: (name: string) => Promise<{ success: boolean; error?: string }>
      loadAllResourceFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>
      // 智能体文件相关（Markdown 格式，存储在 agents 目录）
      saveAgentFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadAgentFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      deleteAgentFile: (name: string) => Promise<{ success: boolean; error?: string }>
      loadAllAgentFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>
      // 知识库文件相关（Markdown 格式，存储在 knowledges 目录）
      saveKnowledgeFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadKnowledgeFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      deleteKnowledgeFile: (name: string) => Promise<{ success: boolean; error?: string }>
      loadAllKnowledgeFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>
      listKnowledgeFolders: () => Promise<{ success: boolean; folders?: KnowledgeFolder[]; error?: string }>
      // 技能文件相关（目录结构，存储在 skills 目录）
      createSkillDirectory: (name: string, input: any) => Promise<{ success: boolean; error?: string }>
      saveSkillFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadSkillFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
      deleteSkillDirectory: (name: string) => Promise<{ success: boolean; error?: string }>
      loadAllSkillDirectories: () => Promise<{ success: boolean; directories?: string[]; error?: string }>
      // 技能资源文件操作
      saveSkillResource: (skillName: string, resourceType: string, fileName: string, content: string) => Promise<{ success: boolean; error?: string }>
      loadSkillResource: (skillName: string, resourceType: string, fileName: string) => Promise<{ success: boolean; content: string | null; error?: string }>
      deleteSkillResource: (skillName: string, resourceType: string, fileName: string) => Promise<{ success: boolean; error?: string }>
      listSkillResources: (skillName: string, resourceType: string) => Promise<{ success: boolean; files?: string[]; error?: string }>
      // 项目相关 API
      openFolderDialog: () => Promise<{ success: boolean; path: string | null; error?: string }>
      loadAppConfig: () => Promise<{ success: boolean; config: AppConfig; error?: string }>
      saveAppConfig: (config: AppConfig) => Promise<{ success: boolean; error?: string }>
      initProjectDir: (projectPath: string) => Promise<{ success: boolean; projectId?: string; projectName?: string; error?: string }>
      setProjectPath: (projectPath: string) => Promise<{ success: boolean; projectId?: string; projectName?: string; error?: string }>
      // 知识图谱配置 API（存储在 .ocean 目录）
      loadKnowledgeGraphConfig: () => Promise<{ success: boolean; config: KnowledgeGraphConfig | null; error?: string }>
      saveKnowledgeGraphConfig: (config: KnowledgeGraphConfig) => Promise<{ success: boolean; error?: string }>
      // 设置模块 API
      testLLMConnection: (provider: any) => Promise<{ success: boolean; status?: number; statusText?: string; body?: string; json?: any; usage?: Usage; error?: string }>
      testExecutablePath: (filePath: string) => Promise<{ success: boolean; exists?: boolean; isExecutable?: boolean; path?: string; error?: string }>
      // LLM 调用 API (使用 pi-mono SDK)
      callLLMApi: (provider: any, prompt: string, model?: string) => Promise<{ success: boolean; content?: string; usage?: Usage; error?: string }>
      // LLM 配置文件 API
      saveLLMConfig: (config: any) => Promise<{ success: boolean; error?: string }>
      loadLLMConfig: () => Promise<{ success: boolean; config: any; error?: string }>
      // Agentic 配置文件 API
      saveAgenticConfig: (config: any) => Promise<{ success: boolean; error?: string }>
      loadAgenticConfig: () => Promise<{ success: boolean; config: any; error?: string }>
      // Agentic 工具执行 API（使用 @mariozechner/pi-coding-agent）
      executeAgenticTool: (params: {
        type: 'read' | 'write' | 'edit' | 'ls' | 'grep' | 'find' | 'bash'
        cwd?: string
        path?: string
        content?: string
        offset?: number
        limit?: number
        oldText?: string
        newText?: string
        pattern?: string
        glob?: string
        ignoreCase?: boolean
        command?: string
        timeout?: number
      }) => Promise<{ success: boolean; output?: string; error?: string }>
      // Agent Loop API（真正的 LLM 驱动工具调用）
      runAgentLoop: (config: {
        provider: any
        model: string
        tools: AgenticToolConfig[]
        maxIterations: number
        timeout: number
        projectPath: string
        task: string
      }) => Promise<{
        success: boolean
        result?: string
        error?: string
        totalTurns?: number
        totalToolCalls?: number
        duration?: number
      }>
      abortAgentLoop: () => Promise<{ success: boolean; message?: string }>
      // Agent Loop 事件监听
      onAgentLoopEvent: (callback: (event: AgentLoopEvent) => void) => () => void
      // 技能模块模板文件 API
      saveSkillTemplateFile: (templateType: 'llm-create' | 'agentic-create' | 'llm-optimize', content: string) => Promise<{ success: boolean; error?: string }>
      loadSkillTemplateFile: (templateType: 'llm-create' | 'agentic-create' | 'llm-optimize') => Promise<{ success: boolean; content: string | null; error?: string }>
      // 知识模块模板文件 API
      saveKnowledgeTemplateFile: (templateType: 'agentic-create', content: string) => Promise<{ success: boolean; error?: string }>
      loadKnowledgeTemplateFile: (templateType: 'agentic-create') => Promise<{ success: boolean; content: string | null; error?: string }>
      // Claude Code CLI API
      runClaudeCode: (config: import('../types').ClaudeCodeExecuteConfig) => Promise<import('../types').ClaudeCodeExecuteResult>
      abortClaudeCode: () => Promise<{ success: boolean; error?: string }>
      onClaudeCodeEvent: (callback: (event: import('../types').ClaudeCodeEvent) => void) => () => void
    }
  }
}

// 检查是否在 Electron 环境中
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronAPI
}

// ===== 工作流文件存储方法（Markdown 格式）=====

/**
 * 中文数字转阿拉伯数字
 */
const chineseToNumber = (str: string): number => {
  const chineseNumbers: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  }
  if (chineseNumbers[str]) {
    return chineseNumbers[str]
  }
  return parseInt(str, 10) || 1
}

/**
 * 生成工作流 Markdown 内容
 */
export const generateWorkflowMd = (workflow: any, nodes: any[], edges: any[]): string => {
  const lines: string[] = []

  // 清理 edges 中可能存在的循环引用（如 selected 属性）
  const cleanEdges = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    label: edge.label,
    data: edge.data,
  }))

  // 清理 nodes 中可能存在的循环引用
  const cleanNodes = nodes.map(node => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  }))

  // 构建 flowData JSON
  const flowData = JSON.stringify({ nodes: cleanNodes, edges: cleanEdges })

  // Frontmatter
  lines.push('---')
  lines.push(`type: workflow`)
  lines.push(`name: ${workflow.name}`)
  if (workflow.description) {
    lines.push(`description: ${workflow.description}`)
  }
  // 添加 flowData 字段，使用 JSON 字符串格式
  lines.push(`flowData: '${flowData}'`)
  lines.push('---')
  lines.push('')

  // 标题
  lines.push(`# ${workflow.name}`)
  lines.push('')

  // 描述
  if (workflow.description) {
    lines.push('## 描述')
    lines.push(`- ${workflow.description}`)
    lines.push('')
  }

  // 输入物料
  if (workflow.inputs && workflow.inputs.length > 0) {
    lines.push('## 输入物料')
    workflow.inputs.forEach((input: string) => {
      lines.push(`- ${input}`)
    })
    lines.push('')
  }

  // 输出产物
  if (workflow.outputs && workflow.outputs.length > 0) {
    lines.push('## 输出产物')
    workflow.outputs.forEach((output: string) => {
      lines.push(`- ${output}`)
    })
    lines.push('')
  }

  // 流程
  lines.push('## 流程')
  lines.push('')

  // 辅助函数：递归输出分支信息（新格式）
  // endStepCounter 用于计算结束节点应该显示的 Step 编号
  const writeBranches = (branches: any[], endStepCounter: number, indent: string = '') => {
    branches.forEach((branch: any) => {
      // 使用 ##### 作为分支标题
      lines.push(`${indent}##### ${branch.label}`)

      // 输出分支描述
      if (branch.description) {
        lines.push(`${indent}- ${branch.description}`)
      }

      // 如果是处理节点有内容，直接输出；否则引用节点文件
      if (branch.nodeContent && branch.nodeContent.content) {
        lines.push(`${indent}- 执行 \`${branch.nodeContent.content}\` 任务`)
      } else if (branch.nodeRef) {
        // 新格式：直接输出执行引用，不再带阶段号
        lines.push(`${indent}- 执行 \`${branch.nodeRef}\` 完成该阶段的任务`)
      } else if (branch.isEnd) {
        // 分支直接连接到结束节点，使用实际的 Step 编号
        lines.push(`${indent}- 直接进入 \`Step${endStepCounter}\``)
      } else if (branch.isDecision && branch.subBranches) {
        // 嵌套判断节点：输出子分支
        lines.push(`${indent}- 进入子判断：`)
        lines.push('')
        branch.subBranches.forEach((subBranch: any) => {
          // 嵌套分支也使用 ##### 作为标题
          lines.push(`${indent}##### ${subBranch.label}`)
          // 子分支也支持节点内容和结束节点
          if (subBranch.nodeContent && subBranch.nodeContent.content) {
            lines.push(`${indent}- 执行 \`${subBranch.nodeContent.content}\` 任务`)
          } else if (subBranch.nodeRef) {
            lines.push(`${indent}- 执行 \`${subBranch.nodeRef}\` 完成该阶段的任务`)
          } else if (subBranch.isEnd) {
            lines.push(`${indent}- 直接进入 \`Step${endStepCounter}\``)
          }
          lines.push('')
        })
        return // 已经添加了空行，跳过下面的空行
      }

      lines.push('')
    })
  }

  // 构建阶段列表
  const stages = buildWorkflowStages(nodes, edges, workflow.name)
  let stepCounter = 0 // 用于跟踪实际的 Step 编号

  stages.forEach((stage) => {
    stepCounter++

    // 使用新的 Step 格式
    // 判断节点的名称需要特殊处理
    let stageName = stage.name
    if (stage.condition) {
      // 判断节点
      stageName = '分支节点'
    } else if (stage.name === '开始') {
      stageName = '开始节点'
    } else if (stage.name === '结束') {
      stageName = '结束节点'
    }

    lines.push(`### Step${stepCounter}:${stageName}`)

    // 分支节点：判断内容和分支条件在同一个 Step 内
    if (stage.condition) {
      lines.push(`#### 判断内容：`)
      lines.push(`- ${stage.condition}`)
      lines.push('')
      lines.push(`#### 分支条件:`)

      // 计算结束节点的 Step 编号
      // 简单计算：当前分支节点 + 1 = 结束节点（或其他后续节点）
      const endStepCounter = stepCounter + 1

      // 处理分支
      if (stage.branches && stage.branches.length > 0) {
        writeBranches(stage.branches, endStepCounter)
      }
      return // 跳过后面的处理，因为分支节点已经特殊处理了
    }

    if (stage.description) {
      lines.push(`- ${stage.description}`)
    }

    // 如果是处理节点有内容，直接输出；否则引用节点文件
    if (stage.nodeContent && stage.nodeContent.content) {
      // 处理节点：直接输出节点内容
      lines.push(`- 执行 \`${stage.nodeContent.content}\` 任务`)
    } else if (stage.nodeRef) {
      // 引用节点定义文件（新格式）
      lines.push(`- 执行 \`${stage.nodeRef}\` 完成该阶段的任务`)
    }

    // 处理分支（非判断节点的情况，理论上不应该有）
    if (stage.branches && stage.branches.length > 0) {
      lines.push('')
      writeBranches(stage.branches, stepCounter + 1)
    } else {
      lines.push('')
    }
  })

  // 强制同时必须要做的事
  if (workflow.requiredActions && workflow.requiredActions.length > 0) {
    lines.push('## 强制同时必须要做的事')
    workflow.requiredActions.forEach((action: string) => {
      lines.push(`- ${action}`)
    })
    lines.push('')
  }

  // 禁止同时严禁不能做的事
  if (workflow.forbiddenActions && workflow.forbiddenActions.length > 0) {
    lines.push('## 禁止同时严禁不能做的事')
    workflow.forbiddenActions.forEach((action: string) => {
      lines.push(`- ${action}`)
    })
    lines.push('')
  }

  // 自定义字段（如验收标准等）
  if (workflow.customFields && workflow.customFields.length > 0) {
    workflow.customFields.forEach((field: any) => {
      lines.push(`## ${field.name}`)
      lines.push(field.value)
      lines.push('')
    })
  }

  return lines.join('\n')
}

/**
 * 构建工作流阶段列表
 */
const buildWorkflowStages = (nodes: any[], edges: any[], workflowName: string): any[] => {
  const nodeMap = new Map<string, any>()
  const outgoingEdges = new Map<string, any[]>()
  const incomingEdges = new Map<string, any[]>()

  // 初始化
  let startNode: any = null

  // 构建节点映射
  nodes.forEach(node => {
    nodeMap.set(node.id, node)
    outgoingEdges.set(node.id, [])
    incomingEdges.set(node.id, [])
    if (node.type === 'start') startNode = node
  })

  // 构建边映射
  edges.forEach(edge => {
    const outList = outgoingEdges.get(edge.source) || []
    outList.push(edge)
    outgoingEdges.set(edge.source, outList)

    const inList = incomingEdges.get(edge.target) || []
    inList.push(edge)
    incomingEdges.set(edge.target, inList)
  })

  if (!startNode) {
    return []
  }

  // 计算每个节点的阶段号
  const nodeOrders = new Map<string, number>()
  const visited = new Set<string>()

  // BFS 计算阶段号（排除结束节点，单独处理）
  const calcOrder = (nodeId: string, order: number) => {
    const node = nodeMap.get(nodeId)
    if (!node) return

    // 结束节点单独处理，不在这里计算
    if (node.type === 'end') return

    if (visited.has(nodeId)) {
      // 汇聚点：取最大值
      const existing = nodeOrders.get(nodeId) || 0
      nodeOrders.set(nodeId, Math.max(existing, order))
      return
    }

    visited.add(nodeId)
    nodeOrders.set(nodeId, order)

    const outEdges = outgoingEdges.get(nodeId) || []

    if (node.type === 'decision') {
      // 判断节点：分支目标节点阶段号相同
      outEdges.forEach(edge => {
        calcOrder(edge.target, order + 1)
      })
    } else {
      // 其他节点：后继节点阶段号 +1
      outEdges.forEach(edge => {
        calcOrder(edge.target, order + 1)
      })
    }
  }

  calcOrder(startNode.id, 1)

  // 单独计算结束节点的阶段号：作为最终汇聚点，阶段号比所有前驱节点都大
  nodeMap.forEach((node, nodeId) => {
    if (node.type === 'end') {
      const inEdges = incomingEdges.get(nodeId) || []
      let maxPredOrder = 0
      inEdges.forEach(edge => {
        const predOrder = nodeOrders.get(edge.source) || 0
        maxPredOrder = Math.max(maxPredOrder, predOrder)
      })
      // 结束节点的阶段号 = 最大前驱阶段号 + 1
      // 如果没有前驱（异常情况），使用默认值
      nodeOrders.set(nodeId, maxPredOrder > 0 ? maxPredOrder + 1 : 1)
    }
  })

  // 递归构建分支信息
  const buildBranchInfo = (targetNode: any, parentOrder: number): any => {
    const targetOrder = nodeOrders.get(targetNode.id) || (parentOrder + 1)
    const branch: any = {
      label: '',
      priority: 1,
      stageOrder: targetOrder,
    }

    if (targetNode.type === 'business') {
      // 业务节点：始终引用节点文件路径（使用相对路径）
      branch.nodeRef = `.claude/nodes/${targetNode.data?.nodeDefName || targetNode.data?.label}.md`
      branch.nodeName = targetNode.data?.nodeDefName || targetNode.data?.label
    } else if (targetNode.type === 'local') {
      // 局部节点：引用工作流nodes目录下的文件（使用相对路径）
      const localNodeName = targetNode.data?.localNodeName || targetNode.data?.label
      branch.nodeRef = `.claude/workflows/${workflowName}/nodes/${localNodeName}.md`
      branch.nodeName = localNodeName
    } else if (targetNode.type === 'process') {
      // 处理节点：直接存储节点内容（不引用节点文件）
      branch.nodeContent = {
        content: targetNode.data?.content || '',
      }
    } else if (targetNode.type === 'decision') {
      // 嵌套判断节点：递归构建子分支
      const subBranches = buildDecisionBranches(targetNode.id, nodeOrders, outgoingEdges, nodeMap)
      branch.subBranches = subBranches
      branch.isDecision = true
    } else if (targetNode.type === 'end') {
      branch.isEnd = true
      // 结束节点作为分支目标时，使用结束节点的实际阶段号
      // 这样输出"直接进入第X阶段"，X是结束节点的阶段号
      branch.stageOrder = targetOrder
    }

    return branch
  }

  // 构建判断节点的分支列表
  const buildDecisionBranches = (
    decisionId: string,
    orders: Map<string, number>,
    outEdges: Map<string, any[]>,
    nodes: Map<string, any>
  ): any[] => {
    const branches: any[] = []
    const edges = outEdges.get(decisionId) || []
    const decisionNode = nodes.get(decisionId)
    const branchesConfig = decisionNode?.data?.branches || []

    edges.forEach((edge, index) => {
      const targetNode = nodes.get(edge.target)
      if (targetNode) {
        const branch = buildBranchInfo(targetNode, orders.get(decisionId) || 1)

        // 直接使用判断节点的 branches 配置，按顺序对应
        if (branchesConfig.length > 0 && index < branchesConfig.length) {
          const matchedBranch = branchesConfig[index]
          branch.label = matchedBranch.name
          branch.description = matchedBranch.description || ''
        } else {
          // 兜底：使用默认值
          branch.label = `分支${index + 1}`
        }

        branch.priority = index + 1
        branches.push(branch)
      }
    })

    return branches
  }

  // 生成阶段列表（排除分支目标节点）
  const stages: any[] = []
  const stageGenerated = new Set<string>()

  const generateStage = (nodeId: string) => {
    if (stageGenerated.has(nodeId)) return
    stageGenerated.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return

    // 检查是否是分支目标节点
    const inEdges = incomingEdges.get(nodeId) || []
    const isBranchTarget = inEdges.some(edge => {
      const sourceNode = nodeMap.get(edge.source)
      return sourceNode?.type === 'decision'
    })

    // 结束节点作为最终汇聚点，始终单独输出为阶段
    const isEndNode = node.type === 'end'

    // 分支目标节点不单独生成阶段（已在其父判断节点的分支中描述）
    // 但结束节点例外，需要单独输出
    // 但需要继续处理其后继节点
    if (isBranchTarget && !isEndNode) {
      // 对于判断节点作为分支目标的情况，需要记录其分支信息
      // 但不单独输出阶段
      const outEdges = outgoingEdges.get(nodeId) || []
      outEdges.forEach(edge => {
        generateStage(edge.target)
      })
      return
    }

    const order = nodeOrders.get(nodeId) || 1

    const stage: any = {
      order,
      name: node.data?.label || '未命名阶段',
    }

    if (node.type === 'start') {
      stage.description = '工作流开始执行'
    } else if (node.type === 'end') {
      stage.description = '工作流执行完毕'
    } else if (node.type === 'decision') {
      stage.branches = buildDecisionBranches(nodeId, nodeOrders, outgoingEdges, nodeMap)
      // 存储判断节点的条件
      stage.condition = node.data?.condition
    } else if (node.type === 'business') {
      // 业务节点：始终引用节点文件路径（使用相对路径）
      stage.nodeRef = `.claude/nodes/${node.data?.nodeDefName || node.data?.label}.md`
      stage.nodeName = node.data?.nodeDefName || node.data?.label
    } else if (node.type === 'local') {
      // 局部节点：引用工作流nodes目录下的文件（使用相对路径）
      const localNodeName = node.data?.localNodeName || node.data?.label
      stage.nodeRef = `.claude/workflows/${workflowName}/nodes/${localNodeName}.md`
      stage.nodeName = localNodeName
    } else if (node.type === 'process') {
      // 处理节点：直接存储节点内容（不引用节点文件）
      stage.nodeContent = {
        content: node.data?.content || '',
      }
    }

    stages.push(stage)

    // 继续处理后继节点（所有节点类型都要处理，包括判断节点）
    // 对于判断节点，分支目标节点会在 generateStage 中被跳过生成阶段
    // 但其后继节点仍会被递归处理
    const outEdges = outgoingEdges.get(nodeId) || []
    outEdges.forEach(edge => {
      generateStage(edge.target)
    })
  }

  generateStage(startNode.id)

  // 按order排序
  stages.sort((a, b) => a.order - b.order)

  return stages
}

/**
 * 解析工作流 Markdown 内容
 */
export const parseWorkflowMd = (content: string, fileName?: string): any => {
  const { metadata, body } = parseFrontmatter(content)
  const sections = parseWorkflowSections(body)

  const name = metadata.name || (fileName ? fileName.replace('.md', '') : `workflow-${Date.now()}`)

  // 解析 flowData 字段（优先使用）
  let flowData: { nodes: any[]; edges: any[] } | null = null
  if (metadata.flowData) {
    try {
      // flowData 可能是用单引号包裹的 JSON 字符串
      let flowDataStr = metadata.flowData
      if (flowDataStr.startsWith("'") && flowDataStr.endsWith("'")) {
        flowDataStr = flowDataStr.slice(1, -1)
      }
      flowData = JSON.parse(flowDataStr)
    } catch (e) {
      console.warn('解析 flowData 失败，将使用正文构建:', e)
    }
  }

  return {
    id: metadata.id || name, // 使用 name 作为 id，保证唯一性
    name,
    description: metadata.description || '',
    ...sections,
    // 如果有 flowData，则添加到返回结果中
    flowData,
  }
}

/**
 * 解析工作流 Markdown 各个部分
 */
const parseWorkflowSections = (body: string): Record<string, any> => {
  const lines = body.split('\n')
  const result: Record<string, any> = {
    inputs: [],
    outputs: [],
    stages: [],
    requiredActions: [],
    forbiddenActions: [],
    customFields: [],
  }

  let currentSection = ''
  let currentStage: any = null
  let currentBranch: any = null
  let isConditionBranchNode = false // 标记是否在条件分支节点中

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 识别章节标题
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim()
      continue
    }

    // 识别阶段标题 - 新格式（### StepX:xxx）
    const newStageMatch = line.match(/^### Step(\d+):(.+)$/)
    if (newStageMatch) {
      // 保存上一个阶段
      if (currentStage) {
        result.stages.push(currentStage)
      }
      const stageName = newStageMatch[2].trim()
      // 判断是否是条件分支节点
      isConditionBranchNode = stageName === '条件分支节点'
      currentStage = {
        order: parseInt(newStageMatch[1], 10),
        name: stageName,
        branches: [],
        isConditionBranchNode,
      }
      currentBranch = null
      continue
    }

    // 识别阶段标题 - 旧格式（### 第X阶段：xxx）向后兼容
    const oldStageMatch = line.match(/^### 第([一二三四五六七八九十\d]+)阶段：(.+)$/)
    if (oldStageMatch) {
      // 保存上一个阶段
      if (currentStage) {
        result.stages.push(currentStage)
      }
      isConditionBranchNode = false
      currentStage = {
        order: chineseToNumber(oldStageMatch[1]),
        name: oldStageMatch[2].trim(),
        branches: [],
      }
      currentBranch = null
      continue
    }

    // 识别分支标题 - 新格式（#### ConditionX：xxx 或 #### Other：其他）
    const newBranchMatch = line.match(/^#### (Condition\d+|Other)：(.+)$/)
    if (newBranchMatch && currentStage) {
      const prefix = newBranchMatch[1]
      const label = newBranchMatch[2].trim()
      let priority = 1
      if (prefix === 'Other') {
        // Other 分支通常是最后一个
        priority = (currentStage.branches?.length || 0) + 1
      } else {
        const numMatch = prefix.match(/Condition(\d+)/)
        if (numMatch) {
          priority = parseInt(numMatch[1], 10)
        }
      }
      currentBranch = {
        label,
        priority,
      }
      if (!currentStage.branches) {
        currentStage.branches = []
      }
      currentStage.branches.push(currentBranch)
      continue
    }

    // 识别分支标题 - 旧格式（#### 情况X：xxx）向后兼容
    const oldBranchMatch = line.match(/^#### 情况([一二三四五六七八九十\d]+)：(.+)$/)
    if (oldBranchMatch && currentStage) {
      currentBranch = {
        label: oldBranchMatch[2].trim(),
        priority: chineseToNumber(oldBranchMatch[1]),
      }
      if (!currentStage.branches) {
        currentStage.branches = []
      }
      currentStage.branches.push(currentBranch)
      continue
    }

    // 解析内容
    if (line.startsWith('- ')) {
      const content = line.slice(2).trim()

      // 提取节点引用
      const nodeRefMatch = content.match(/`([^`]+)`/)
      const nodeRef = nodeRefMatch ? nodeRefMatch[1] : null

      switch (currentSection) {
        case '描述':
          result.description = content
          break
        case '输入物料':
          result.inputs.push(content)
          break
        case '输出产物':
          result.outputs.push(content)
          break
        case '流程':
          if (currentBranch) {
            if (nodeRef) {
              currentBranch.nodeRef = nodeRef
            }
          } else if (currentStage) {
            if (nodeRef) {
              currentStage.nodeRef = nodeRef
            } else if (!currentStage.description) {
              currentStage.description = content
            }
          }
          break
        case '强制同时必须要做的事':
          result.requiredActions.push(content)
          break
        case '禁止同时严禁不能做的事':
          result.forbiddenActions.push(content)
          break
        default:
          // 自定义字段
          if (currentSection && !result[currentSection]) {
            result.customFields.push({
              name: currentSection,
              value: content,
            })
          }
      }
    }
  }

  // 保存最后一个阶段
  if (currentStage) {
    result.stages.push(currentStage)
  }

  return result
}

/**
 * 从工作流数据构建 React Flow 节点和边
 */
export const buildNodesAndEdgesFromWorkflow = (workflow: any): { nodes: any[]; edges: any[] } => {
  const nodes: any[] = []
  const edges: any[] = []

  let yOffset = 100
  const xSpacing = 280
  const ySpacing = 150

  // 创建开始节点
  nodes.push({
    id: 'start-1',
    type: 'start',
    position: { x: 0, y: yOffset },
    data: { label: '开始' },
  })

  let prevNodeId = 'start-1'

  workflow.stages?.forEach((stage: any, index: number) => {
    const x = (index + 1) * xSpacing

    if (stage.branches && stage.branches.length > 0) {
      // 创建判断节点
      const decisionId = `decision-${index + 1}`
      nodes.push({
        id: decisionId,
        type: 'decision',
        position: { x, y: yOffset },
        data: {
          label: stage.name,
          routeConfig: {
            variableName: 'result',
            variableType: 'boolean',
            rules: stage.branches.map((branch: any, idx: number) => ({
              id: `rule-${Date.now()}-${idx}`,
              label: branch.label,
              condition: branch.label === '是' ? 'true' : 'false',
              conditionType: 'boolean',
              priority: idx + 1,
              color: branch.label === '是' ? '#34C759' : '#FF3B30',
            })),
          },
        },
      })

      // 连接到上一个节点
      edges.push({
        id: `e-${prevNodeId}-${decisionId}`,
        source: prevNodeId,
        target: decisionId,
        type: 'default',
      })

      // 创建分支节点
      stage.branches.forEach((branch: any, branchIdx: number) => {
        if (branch.nodeRef) {
          const nodeName = branch.nodeRef.replace('nodes/', '').replace('.md', '')
          const businessId = `business-${index + 1}-${branchIdx + 1}`
          const branchY = yOffset + (branchIdx - (stage.branches!.length - 1) / 2) * ySpacing

          nodes.push({
            id: businessId,
            type: 'business',
            position: { x: x + xSpacing, y: branchY },
            data: {
              label: nodeName,
              nodeDefName: nodeName,
            },
          })

          edges.push({
            id: `e-${decisionId}-${businessId}`,
            source: decisionId,
            target: businessId,
            label: branch.label,
            type: 'default',
          })
        }
      })

      prevNodeId = decisionId
    } else if (stage.nodeRef) {
      // 创建业务节点
      const nodeName = stage.nodeRef.replace('nodes/', '').replace('.md', '')
      const businessId = `business-${index + 1}`

      nodes.push({
        id: businessId,
        type: 'business',
        position: { x, y: yOffset },
        data: {
          label: nodeName,
          nodeDefName: nodeName,
          task: stage.description,
        },
      })

      edges.push({
        id: `e-${prevNodeId}-${businessId}`,
        source: prevNodeId,
        target: businessId,
        type: 'default',
      })

      prevNodeId = businessId
    }
  })

  // 创建结束节点
  const lastX = ((workflow.stages?.length || 0) + 1) * xSpacing
  nodes.push({
    id: 'end-1',
    type: 'end',
    position: { x: lastX, y: yOffset },
    data: { label: '结束' },
  })

  // 连接最后一个业务节点到结束节点
  const businessNodes = nodes.filter(n => n.type === 'business')
  businessNodes.forEach(node => {
    const hasOutEdge = edges.some(e => e.source === node.id)
    if (!hasOutEdge) {
      edges.push({
        id: `e-${node.id}-end-1`,
        source: node.id,
        target: 'end-1',
        type: 'default',
      })
    }
  })

  // 如果没有业务节点，连接开始到结束
  if (businessNodes.length === 0) {
    edges.push({
      id: 'e-start-1-end-1',
      source: 'start-1',
      target: 'end-1',
      type: 'default',
    })
  }

  return { nodes, edges }
}

// 保存单个工作流文件
export const saveWorkflowFileToLocal = async (workflow: any, nodes: any[], edges: any[]): Promise<boolean> => {
  // 清理孤立的边：过滤掉 source 或 target 引用不存在节点的边
  const nodeIds = new Set(nodes.map(n => n.id))
  const validEdges = edges.filter(edge =>
    nodeIds.has(edge.source) && nodeIds.has(edge.target)
  )

  // 如果有边被过滤掉，打印警告
  if (validEdges.length !== edges.length) {
    const orphanedEdges = edges.filter(edge =>
      !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    )
    console.warn(`清理了 ${orphanedEdges.length} 条孤立边:`, orphanedEdges.map(e => e.id))
  }

  if (!isElectron()) {
    // 浏览器环境：使用 localStorage
    try {
      const mdContent = generateWorkflowMd(workflow, nodes, validEdges)
      localStorage.setItem(`flow-editor-workflow-${workflow.name}`, JSON.stringify({
        workflow,
        nodes,
        edges: validEdges,
        mdContent,
      }))
      return true
    } catch (error) {
      console.error('保存工作流文件到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存为 Markdown 文件
  try {
    const mdContent = generateWorkflowMd(workflow, nodes, validEdges)
    const result = await window.electronAPI!.saveWorkflowFile(workflow.name, mdContent)
    return result.success
  } catch (error) {
    console.error('保存工作流文件失败:', error)
    return false
  }
}

// ===== 工作流文件夹操作方法（新版文件夹结构）=====

/**
 * 生成工作流 flow.json 内容
 * 仅包含节点、边位置等可视化数据，给编辑器渲染使用
 *
 * 优化：业务节点(business)只存储引用路径，不存储完整内容，加载时动态读取
 */
export const generateFlowJson = (nodes: any[], edges: any[]): string => {
  // 清理 edges 中可能存在的循环引用
  const cleanEdges = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle, // 保存分支节点的 Handle ID
    targetHandle: edge.targetHandle,
    type: edge.type,
    label: edge.label,
    data: edge.data,
    branchId: edge.branchId, // 保存分支 ID
    branchDescription: edge.branchDescription, // 保存分支描述
  }))

  // 清理 nodes 中可能存在的循环引用
  // 优化：业务节点只存储引用路径，不存储完整content
  const cleanNodes = nodes.map(node => {
    const cleanNode: any = {
      id: node.id,
      type: node.type,
      position: node.position,
      data: { ...node.data },
    }

    // 如果是业务节点(business)且有nodeDefName，只存储引用路径
    if (node.type === 'business' && node.data.nodeDefName && !node.data.isLocal) {
      // 删除content字段，改为引用路径
      delete cleanNode.data.content
      // 添加节点引用路径
      cleanNode.data.nodeRefPath = `.claude/nodes/${node.data.nodeDefName}.md`
    }

    return cleanNode
  })

  const flowData = {
    nodes: cleanNodes,
    edges: cleanEdges,
  }

  return JSON.stringify(flowData, null, 2)
}

/**
 * 保存工作流到文件夹结构
 */
export const saveWorkflowToFolder = async (workflow: any, nodes: any[], edges: any[]): Promise<boolean> => {
  // 清理孤立的边
  const nodeIds = new Set(nodes.map(n => n.id))
  const validEdges = edges.filter(edge =>
    nodeIds.has(edge.source) && nodeIds.has(edge.target)
  )

  if (!isElectron()) {
    // 浏览器环境：使用 localStorage 模拟文件夹结构
    try {
      const mdContent = generateWorkflowMdContent(workflow, nodes, validEdges)
      const flowJsonContent = generateFlowJson(nodes, validEdges)

      localStorage.setItem(`workflow-folder-${workflow.name}-workflow-md`, mdContent)
      localStorage.setItem(`workflow-folder-${workflow.name}-flow-json`, flowJsonContent)
      localStorage.setItem(`workflow-folder-${workflow.name}-meta`, JSON.stringify({
        workflow,
        nodes,
        edges: validEdges,
        updatedAt: new Date().toISOString(),
      }))

      // 4. 保存局部节点
      const localNodes = nodes.filter(n => n.type === 'local' && n.data.isLocal)
      for (const localNode of localNodes) {
        await saveLocalNodeToWorkflow(workflow.name, localNode)
      }

      return true
    } catch (error) {
      console.error('保存工作流文件夹到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存到文件夹结构
  try {
    // 1. 创建工作流文件夹
    const createResult = await window.electronAPI!.createWorkflowFolder(workflow.name)
    if (!createResult.success) {
      console.error('创建工作流文件夹失败:', createResult.error)
      return false
    }

    // 2. 保存 WORKFLOW.md
    const mdContent = generateWorkflowMdContent(workflow, nodes, validEdges)
    const mdResult = await window.electronAPI!.saveWorkflowMd(workflow.name, mdContent)
    if (!mdResult.success) {
      console.error('保存 WORKFLOW.md 失败:', mdResult.error)
      return false
    }

    // 3. 保存 flow.json
    const flowJsonContent = generateFlowJson(nodes, validEdges)
    const flowResult = await window.electronAPI!.saveWorkflowFlowJson(workflow.name, flowJsonContent)
    if (!flowResult.success) {
      console.error('保存 flow.json 失败:', flowResult.error)
      return false
    }

    // 4. 保存局部节点
    const localNodes = nodes.filter(n => n.type === 'local' && n.data.isLocal)
    for (const localNode of localNodes) {
      await saveLocalNodeToWorkflow(workflow.name, localNode)
    }

    return true
  } catch (error) {
    console.error('保存工作流文件夹失败:', error)
    return false
  }
}

/**
 * 从文件夹结构加载工作流
 */
export const loadWorkflowFromFolder = async (name: string): Promise<any | null> => {
  if (!isElectron()) {
    // 浏览器环境：从 localStorage 加载
    try {
      const metaData = localStorage.getItem(`workflow-folder-${name}-meta`)
      if (!metaData) return null

      const data = JSON.parse(metaData)
      return {
        id: data.workflow.id,
        name: data.workflow.name,
        description: data.workflow.description,
        nodes: data.nodes || [],
        edges: data.edges || [],
        createdAt: data.workflow.createdAt,
        updatedAt: data.updatedAt,
        nodeCount: data.nodes?.length || 0,
        hasMetadata: true,
      }
    } catch (error) {
      console.error('从 localStorage 加载工作流失败:', error)
      return null
    }
  }

  // Electron 环境：从文件夹加载
  try {
    // 1. 加载 WORKFLOW.md
    const mdResult = await window.electronAPI!.loadWorkflowMd(name)
    if (!mdResult.success || !mdResult.content) {
      console.error('加载 WORKFLOW.md 失败:', mdResult.error)
      return null
    }

    // 2. 加载 flow.json
    const flowResult = await window.electronAPI!.loadWorkflowFlowJson(name)
    let nodes: any[] = []
    let edges: any[] = []

    if (flowResult.success && flowResult.content) {
      try {
        const flowData = JSON.parse(flowResult.content)
        nodes = flowData.nodes || []
        edges = flowData.edges || []

        // 优化：动态加载业务节点的内容
        for (const node of nodes) {
          // 如果是业务节点(business)且有引用路径,动态加载节点内容
          if (node.type === 'business' && node.data.nodeRefPath && !node.data.isLocal) {
            try {
              // 从引用路径中提取节点名称
              const nodeName = node.data.nodeDefName || node.data.nodeRefPath.split('/').pop()?.replace('.md', '')

              if (nodeName) {
                const nodeFileResult = await window.electronAPI!.loadNodeFile(nodeName)

                if (nodeFileResult.success && nodeFileResult.content) {
                  // 解析节点文件内容
                  const nodeDef = parseNodeMarkdown(nodeFileResult.content, `${nodeName}.md`)

                  // 更新节点的content字段
                  node.data.content = nodeDef.content
                }
              }
            } catch (loadError) {
              console.warn(`加载节点内容失败: ${node.data.nodeRefPath}`, loadError)
              // 失败时使用空内容,保持节点可用
              node.data.content = ''
            }
          }
        }
      } catch (parseError) {
        console.error('解析 flow.json 失败:', parseError)
      }
    }

    // 3. 解析 WORKFLOW.md 的 frontmatter
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/
    const match = mdResult.content.match(frontmatterRegex)
    let workflowId = `wf-${Date.now()}`
    let workflowName = name
    let workflowDescription = ''

    if (match) {
      const frontmatterText = match[1]
      const lines = frontmatterText.split('\n')
      lines.forEach(line => {
        if (line.startsWith('id:')) {
          workflowId = line.substring(3).trim()
        } else if (line.startsWith('name:')) {
          workflowName = line.substring(5).trim()
        } else if (line.startsWith('description:')) {
          workflowDescription = line.substring(12).trim()
        }
      })
    }

    return {
      id: workflowId,
      name: workflowName,
      description: workflowDescription,
      nodes,
      edges,
      createdAt: mdResult.mtime || new Date().toISOString(),
      updatedAt: mdResult.mtime || new Date().toISOString(),
      nodeCount: nodes.length,
      hasMetadata: true,
    }
  } catch (error) {
    console.error('从文件夹加载工作流失败:', error)
    return null
  }
}

/**
 * 加载所有工作流文件夹列表
 */
export const loadAllWorkflowFolders = async (): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境：从 localStorage 加载
    try {
      const workflows: any[] = []
      const keys = Object.keys(localStorage).filter(key => key.startsWith('workflow-folder-') && key.endsWith('-meta'))

      for (const key of keys) {
        const metaData = localStorage.getItem(key)
        if (metaData) {
          const data = JSON.parse(metaData)
          workflows.push({
            id: data.workflow.id,
            name: data.workflow.name,
            description: data.workflow.description,
            nodes: data.nodes || [],
            edges: data.edges || [],
            createdAt: data.workflow.createdAt,
            updatedAt: data.updatedAt,
            nodeCount: data.nodes?.length || 0,
            hasMetadata: true,
          })
        }
      }

      return workflows
    } catch (error) {
      console.error('从 localStorage 加载工作流列表失败:', error)
      return []
    }
  }

  // Electron 环境：从文件夹列表加载
  try {
    const result = await window.electronAPI!.loadAllWorkflowFolders()
    if (!result.success || !result.folders) {
      return []
    }

    const workflows: any[] = []
    for (const folderName of result.folders) {
      const workflow = await loadWorkflowFromFolder(folderName)
      if (workflow) {
        workflows.push(workflow)
      }
    }

    return workflows
  } catch (error) {
    console.error('加载工作流文件夹列表失败:', error)
    return []
  }
}

/**
 * 删除工作流文件夹
 */
export const deleteWorkflowFolder = async (name: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：从 localStorage 删除
    try {
      localStorage.removeItem(`workflow-folder-${name}-workflow-md`)
      localStorage.removeItem(`workflow-folder-${name}-flow-json`)
      localStorage.removeItem(`workflow-folder-${name}-meta`)
      return true
    } catch (error) {
      console.error('从 localStorage 删除工作流失败:', error)
      return false
    }
  }

  // Electron 环境：删除文件夹
  try {
    const result = await window.electronAPI!.deleteWorkflowFolder(name)
    return result.success
  } catch (error) {
    console.error('删除工作流文件夹失败:', error)
    return false
  }
}

/**
 * 重命名工作流文件夹
 */
export const renameWorkflowFolder = async (oldName: string, newName: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：从 localStorage 重命名
    try {
      const metaData = localStorage.getItem(`workflow-folder-${oldName}-meta`)
      const mdData = localStorage.getItem(`workflow-folder-${oldName}-workflow-md`)
      const flowData = localStorage.getItem(`workflow-folder-${oldName}-flow-json`)

      if (metaData) {
        const data = JSON.parse(metaData)
        data.workflow.name = newName
        localStorage.setItem(`workflow-folder-${newName}-meta`, JSON.stringify(data))
        localStorage.removeItem(`workflow-folder-${oldName}-meta`)
      }

      if (mdData) {
        localStorage.setItem(`workflow-folder-${newName}-workflow-md`, mdData)
        localStorage.removeItem(`workflow-folder-${oldName}-workflow-md`)
      }

      if (flowData) {
        localStorage.setItem(`workflow-folder-${newName}-flow-json`, flowData)
        localStorage.removeItem(`workflow-folder-${oldName}-flow-json`)
      }

      return true
    } catch (error) {
      console.error('从 localStorage 重命名工作流失败:', error)
      return false
    }
  }

  // Electron 环境：重命名文件夹
  try {
    const result = await window.electronAPI!.renameWorkflowFolder(oldName, newName)
    return result.success
  } catch (error) {
    console.error('重命名工作流文件夹失败:', error)
    return false
  }
}

// 加载工作流文件列表
export const loadWorkflowFilesFromLocal = async (): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const workflows: any[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('flow-editor-workflow-') && !key.includes('nodes')) {
          const data = localStorage.getItem(key)
          if (data) {
            const parsed = JSON.parse(data)
            workflows.push({
              ...parsed.workflow,
              nodes: parsed.nodes || [],
              edges: parsed.edges || [],
              mdContent: parsed.mdContent,
            })
          }
        }
      }
      return workflows
    } catch (error) {
      console.error('从 localStorage 加载工作流文件失败:', error)
      return []
    }
  }

  // Electron环境：从 workflows 目录的 Markdown 文件加载
  try {
    const result = await window.electronAPI!.loadAllWorkflowFiles()

    if (result.success && result.files) {
      const workflows: any[] = []

      for (const fileName of result.files) {
        const workflowName = fileName.replace(/\.md$/, '')
        const contentResult = await window.electronAPI!.loadWorkflowFile(workflowName)
        if (contentResult.success && contentResult.content) {
          const workflow = parseWorkflowMd(contentResult.content, fileName)

          // 优先使用 flowData 中的 nodes/edges，降级使用正文构建
          let nodes: any[]
          let edges: any[]

          if (workflow.flowData && workflow.flowData.nodes && workflow.flowData.edges) {
            // 从 flowData 恢复完整的节点和边数据
            nodes = workflow.flowData.nodes
            edges = workflow.flowData.edges
          } else {
            // 降级：从正文构建（兼容旧文件）
            const built = buildNodesAndEdgesFromWorkflow(workflow)
            nodes = built.nodes
            edges = built.edges
          }

          workflows.push({
            ...workflow,
            nodes,
            edges,
            nodeCount: nodes.length,
            createdAt: contentResult.mtime || new Date().toISOString(),
            updatedAt: contentResult.mtime || new Date().toISOString(),
          })
        }
      }

      return workflows
    }
    return []
  } catch (error) {
    console.error('加载工作流文件失败:', error)
    return []
  }
}

// 删除单个工作流文件
export const deleteWorkflowFileFromLocal = async (name: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      localStorage.removeItem(`flow-editor-workflow-${name}`)
      return true
    } catch (error) {
      console.error('从 localStorage 删除工作流文件失败:', error)
      return false
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.deleteWorkflowFile(name)
    return result.success
  } catch (error) {
    console.error('删除工作流文件失败:', error)
    return false
  }
}

// ===== 节点文件存储方法（Markdown 格式）=====
const NODE_FILES_KEY = 'flow-editor-node-files'

/**
 * 生成节点 Markdown 内容（简化格式：name, type, description + 内容）
 */
const generateNodeMarkdown = (node: any): string => {
  const metadata: Record<string, any> = {
    name: node.name,
    type: node.type || 'business',
  }
  if (node.description) {
    metadata.description = node.description
  }

  return generateMarkdownWithFrontmatter(metadata, node.content || '')
}

/**
 * 解析节点 Markdown 内容（简化格式）
 */
const parseNodeMarkdown = (content: string, fileName?: string): any => {
  const { metadata, body } = parseFrontmatter(content)
  const name = metadata.name || (fileName ? fileName.replace('.md', '') : `node-${Date.now()}`)

  return {
    id: metadata.id || `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    type: metadata.type || 'business',
    description: metadata.description || '',
    content: body,
  }
}

// 保存节点文件列表（每个节点保存为独立的 Markdown 文件）
export const saveNodeFilesToLocal = async (nodes: any[]): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage 存储
    try {
      localStorage.setItem(NODE_FILES_KEY, JSON.stringify(nodes))
      return true
    } catch (error) {
      console.error('保存节点文件到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存为 Markdown 文件
  try {
    // 获取现有文件列表，用于删除不再需要的文件
    const existingResult = await window.electronAPI!.loadAllNodeFiles()
    const existingFiles = existingResult.success ? existingResult.files || [] : []
    const currentNames = nodes.map(n => n.name)

    // 删除不再需要的文件
    for (const fileName of existingFiles) {
      const nodeName = fileName.replace('.md$', '')
      if (!currentNames.includes(nodeName)) {
        await window.electronAPI!.deleteNodeFile(nodeName)
      }
    }

    // 保存每个节点的 Markdown 文件（排除系统节点）
    for (const node of nodes) {
      // 排除系统节点
      if (node.type === 'start' || node.type === 'end' || node.type === 'decision') {
        continue
      }

      const mdContent = generateNodeMarkdown(node)
      const saveResult = await window.electronAPI!.saveNodeFile(node.name, mdContent)
      if (!saveResult.success) {
        console.error(`保存节点文件 ${node.name} 失败:`, saveResult.error)
      }
    }

    return true
  } catch (error) {
    console.error('保存节点文件失败:', error)
    return false
  }
}

// 加载节点文件列表
export const loadNodeFilesFromLocal = async (): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const data = localStorage.getItem(NODE_FILES_KEY)
      if (!data) return []
      return JSON.parse(data)
    } catch (error) {
      console.error('从 localStorage 加载节点文件失败:', error)
      return []
    }
  }

  // Electron环境：从 nodes 目录的 Markdown 文件加载
  try {
    const result = await window.electronAPI!.loadAllNodeFiles()

    if (result.success && result.files) {
      const nodes: any[] = []

      for (const fileName of result.files) {
        const nodeName = fileName.replace(/\.md$/, '')
        const contentResult = await window.electronAPI!.loadNodeFile(nodeName)
        if (contentResult.success && contentResult.content) {
          const node = parseNodeMarkdown(contentResult.content, fileName)
          nodes.push({
            ...node,
            createdAt: contentResult.mtime || new Date().toISOString(),
            updatedAt: contentResult.mtime || new Date().toISOString(),
          })
        }
      }

      return nodes
    }
    return []
  } catch (error) {
    console.error('加载节点文件失败:', error)
    return []
  }
}

// 保存单个节点文件
export const saveSingleNodeFileToLocal = async (node: any): Promise<boolean> => {
  if (!isElectron()) {
    return true
  }

  try {
    const mdContent = generateNodeMarkdown(node)
    const result = await window.electronAPI!.saveNodeFile(node.name, mdContent)
    return result.success
  } catch (error) {
    console.error('保存单个节点文件失败:', error)
    return false
  }
}

// 删除单个节点文件
export const deleteNodeFileFromLocal = async (name: string): Promise<boolean> => {
  if (!isElectron()) {
    return true
  }

  try {
    const result = await window.electronAPI!.deleteNodeFile(name)
    return result.success
  } catch (error) {
    console.error('删除节点文件失败:', error)
    return false
  }
}

// ===== 资源文件存储方法 =====
const RESOURCE_FILES_KEY = 'flow-editor-resource-files'

// 解析 Markdown 文件的 frontmatter
const parseFrontmatter = (content: string): { metadata: Record<string, any>; body: string } => {
  // 兼容不同换行符
  const normalizedContent = content.replace(/\r\n/g, '\n')
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = normalizedContent.match(frontmatterRegex)

  if (match) {
    const frontmatterLines = match[1].split('\n')
    const metadata: Record<string, any> = {}

    for (const line of frontmatterLines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        metadata[key] = value
      }
    }

    return { metadata, body: match[2] }
  }

  return { metadata: {}, body: content }
}

// 生成带 frontmatter 的 Markdown 内容
const generateMarkdownWithFrontmatter = (
  metadata: Record<string, any>,
  content: string
): string => {
  const frontmatterLines = Object.entries(metadata)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${value}`)

  if (frontmatterLines.length === 0) {
    return content
  }

  return `---\n${frontmatterLines.join('\n')}\n---\n${content}`
}

// 保存资源文件列表（每个资源保存为独立的 Markdown 文件）
export const saveResourceFilesToLocal = async (resources: any[]): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage 存储
    try {
      localStorage.setItem(RESOURCE_FILES_KEY, JSON.stringify(resources))
      return true
    } catch (error) {
      console.error('保存资源文件到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存为 Markdown 文件
  try {
    // 获取现有文件列表，用于删除不再需要的文件
    const existingResult = await window.electronAPI!.loadAllResourceFiles()
    const existingFiles = existingResult.success ? existingResult.files || [] : []
    const currentNames = resources.map(r => r.name)

    // 删除不再需要的文件
    for (const fileName of existingFiles) {
      // fileName 格式为 "rule.md"，去掉后缀后比较
      const resourceName = fileName.replace(/\.md$/, '')
      if (!currentNames.includes(resourceName)) {
        await window.electronAPI!.deleteResourceFile(resourceName)
      }
    }

    // 保存每个资源的 Markdown 文件
    for (const resource of resources) {
      const metadata = {
        id: resource.id,
        type: resource.type,
        description: resource.description,
      }
      const mdContent = generateMarkdownWithFrontmatter(metadata, resource.content || '')

      const saveResult = await window.electronAPI!.saveResourceFile(
        resource.name,
        mdContent
      )
      if (!saveResult.success) {
        console.error(`保存资源文件 ${resource.name} 失败:`, saveResult.error)
      }
    }

    return true
  } catch (error) {
    console.error('保存资源文件失败:', error)
    return false
  }
}

// 加载资源文件列表
export const loadResourceFilesFromLocal = async (): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const data = localStorage.getItem(RESOURCE_FILES_KEY)
      if (!data) return []
      return JSON.parse(data)
    } catch (error) {
      console.error('从 localStorage 加载资源文件失败:', error)
      return []
    }
  }

  // Electron环境：从 Markdown 文件加载
  try {
    const result = await window.electronAPI!.loadAllResourceFiles()

    if (result.success && result.files) {
      const resources: any[] = []

      for (const fileName of result.files) {
        // fileName 格式为 "rule.md"，需要去掉 .md 后缀作为资源名称
        const resourceName = fileName.replace(/\.md$/, '')
        const contentResult = await window.electronAPI!.loadResourceFile(resourceName)
        if (contentResult.success && contentResult.content) {
          const { metadata, body } = parseFrontmatter(contentResult.content)

          resources.push({
            id: metadata.id || `resource-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: resourceName,
            type: metadata.type || 'rule',
            description: metadata.description || '',
            content: body,
            createdAt: contentResult.mtime || new Date().toISOString(),
            updatedAt: contentResult.mtime || new Date().toISOString(),
          })
        }
      }

      return resources
    }
    return []
  } catch (error) {
    console.error('加载资源文件失败:', error)
    return []
  }
}

// ===== 智能体文件存储方法 =====
const AGENT_FILES_KEY = 'flow-editor-agent-files'

// 解析 sub-agent 特殊的 frontmatter（包含 name, description, model, color）
const parseSubAgentFrontmatter = (content: string): { metadata: Record<string, any>; body: string } => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (match) {
    const frontmatterLines = match[1].split('\n')
    const metadata: Record<string, any> = {}

    for (const line of frontmatterLines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        metadata[key] = value
      }
    }

    return { metadata, body: match[2] }
  }

  return { metadata: {}, body: content }
}

// 生成 sub-agent 格式的 Markdown
const generateSubAgentMarkdown = (
  metadata: { name: string; description: string; model: string; color: string },
  content: string
): string => {
  return `---
name: ${metadata.name}
description: ${metadata.description}
model: ${metadata.model}
color: ${metadata.color}
---
${content}`
}

// 保存智能体文件列表（每个智能体保存为独立的 Markdown 文件）
export const saveAgentFilesToLocal = async (agents: any[]): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage 存储
    try {
      localStorage.setItem(AGENT_FILES_KEY, JSON.stringify(agents))
      return true
    } catch (error) {
      console.error('保存智能体文件到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存为 Markdown 文件到 agents 目录
  try {
    // 获取现有文件列表，用于删除不再需要的文件
    const existingResult = await window.electronAPI!.loadAllAgentFiles()
    const existingFiles = existingResult.success ? existingResult.files || [] : []
    const currentNames = agents.map(t => t.name)

    // 删除不再需要的文件
    for (const fileName of existingFiles) {
      const agentName = fileName.replace(/\.md$/, '')
      if (!currentNames.includes(agentName)) {
        await window.electronAPI!.deleteAgentFile(agentName)
      }
    }

    // 保存每个智能体的 Markdown 文件
    for (const agent of agents) {
      const metadata = {
        name: agent.name,
        description: agent.description || '',
        model: agent.model || 'haiku',
        color: agent.color || 'blue',
      }
      const mdContent = generateSubAgentMarkdown(metadata, agent.content || '')

      const saveResult = await window.electronAPI!.saveAgentFile(agent.name, mdContent)
      if (!saveResult.success) {
        console.error(`保存智能体文件 ${agent.name} 失败:`, saveResult.error)
      }
    }

    return true
  } catch (error) {
    console.error('保存智能体文件失败:', error)
    return false
  }
}

// 加载智能体文件列表
export const loadAgentFilesFromLocal = async (): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const data = localStorage.getItem(AGENT_FILES_KEY)
      if (!data) return []
      return JSON.parse(data)
    } catch (error) {
      console.error('从 localStorage 加载智能体文件失败:', error)
      return []
    }
  }

  // Electron环境：从 agents 目录的 Markdown 文件加载
  try {
    const result = await window.electronAPI!.loadAllAgentFiles()

    if (result.success && result.files) {
      const agents: any[] = []

      for (const fileName of result.files) {
        const agentName = fileName.replace(/\.md$/, '')
        const contentResult = await window.electronAPI!.loadAgentFile(agentName)
        if (contentResult.success && contentResult.content) {
          const { metadata, body } = parseSubAgentFrontmatter(contentResult.content)

          agents.push({
            id: `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: metadata.name || agentName,
            type: 'sub-agent',
            description: metadata.description || '',
            model: metadata.model || 'haiku',
            color: metadata.color || 'blue',
            content: body,
            createdAt: contentResult.mtime || new Date().toISOString(),
            updatedAt: contentResult.mtime || new Date().toISOString(),
          })
        }
      }

      return agents
    }
    return []
  } catch (error) {
    console.error('加载智能体文件失败:', error)
    return []
  }
}

// 删除单个智能体文件
export const deleteAgentFileFromLocal = async (name: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：由 store 处理
    return true
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.deleteAgentFile(name)
    return result.success
  } catch (error) {
    console.error('删除智能体文件失败:', error)
    return false
  }
}

// ===== 知识库文件存储方法 =====
const KNOWLEDGE_FILES_KEY = 'flow-editor-knowledge-files'

// 解析知识库 frontmatter（包含 name, description, tags）
const parseKnowledgeFrontmatter = (content: string): { metadata: Record<string, any>; body: string } => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (match) {
    const frontmatterLines = match[1].split('\n')
    const metadata: Record<string, any> = {}

    for (const line of frontmatterLines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        // 解析数组格式 [tag1, tag2]
        if (value.startsWith('[') && value.endsWith(']')) {
          metadata[key] = value
            .slice(1, -1)
            .split(',')
            .map((item: string) => item.trim())
            .filter((item: string) => item)
        } else {
          metadata[key] = value
        }
      }
    }

    return { metadata, body: match[2] }
  }

  return { metadata: {}, body: content }
}

// 生成知识库格式的 Markdown
const generateKnowledgeMarkdown = (
  metadata: { name: string; description: string; tags: string[]; category?: string },
  content: string
): string => {
  const tagsStr = metadata.tags && metadata.tags.length > 0
    ? `tags: [${metadata.tags.join(', ')}]`
    : ''
  const categoryStr = metadata.category ? `category: ${metadata.category}` : ''

  return `---
name: ${metadata.name}
description: ${metadata.description}${tagsStr ? `\n${tagsStr}` : ''}${categoryStr ? `\n${categoryStr}` : ''}
---
${content}`
}

// 保存知识库文件列表（每个知识库保存为独立的 Markdown 文件，支持子目录）
export const saveKnowledgeFilesToLocal = async (knowledges: any[]): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage 存储
    try {
      localStorage.setItem(KNOWLEDGE_FILES_KEY, JSON.stringify(knowledges))
      return true
    } catch (error) {
      console.error('保存知识库文件到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存为 Markdown 文件到 knowledges 目录
  try {
    // 获取现有文件列表，用于删除不再需要的文件
    const existingResult = await window.electronAPI!.loadAllKnowledgeFiles()
    const existingFiles = existingResult.success ? existingResult.files || [] : []
    // 当前文件的完整路径列表（含子目录）
    const currentPaths = knowledges.map(k =>
      k.category ? `${k.category}/${k.name}` : k.name
    )

    // 删除不再需要的文件
    for (const fileName of existingFiles) {
      const knowledgePath = fileName.replace(/\.md$/, '')
      if (!currentPaths.includes(knowledgePath)) {
        await window.electronAPI!.deleteKnowledgeFile(knowledgePath)
      }
    }

    // 保存每个知识库的 Markdown 文件
    for (const knowledge of knowledges) {
      const metadata = {
        name: knowledge.name,
        description: knowledge.description || '',
        tags: knowledge.tags || [],
        category: knowledge.category || '',
      }
      const mdContent = generateKnowledgeMarkdown(metadata, knowledge.content || '')

      // 根据是否有 category 决定存储路径
      const savePath = knowledge.category
        ? `${knowledge.category}/${knowledge.name}`
        : knowledge.name

      const saveResult = await window.electronAPI!.saveKnowledgeFile(savePath, mdContent)
      if (!saveResult.success) {
        console.error(`保存知识库文件 ${savePath} 失败:`, saveResult.error)
      }
    }

    return true
  } catch (error) {
    console.error('保存知识库文件失败:', error)
    return false
  }
}

// 保存单个知识库文件到本地（避免全量保存）
export const saveSingleKnowledgeFileToLocal = async (knowledge: any): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：仍使用全量方式保存到 localStorage
    const stored = localStorage.getItem(KNOWLEDGE_FILES_KEY)
    const knowledges = stored ? JSON.parse(stored) : []
    const idx = knowledges.findIndex((k: any) => k.id === knowledge.id)
    if (idx >= 0) {
      knowledges[idx] = knowledge
    } else {
      knowledges.unshift(knowledge)
    }
    localStorage.setItem(KNOWLEDGE_FILES_KEY, JSON.stringify(knowledges))
    return true
  }

  // Electron 环境：仅保存该文件
  try {
    const metadata = {
      name: knowledge.name,
      description: knowledge.description || '',
      tags: knowledge.tags || [],
      category: knowledge.category || '',
    }
    const mdContent = generateKnowledgeMarkdown(metadata, knowledge.content || '')
    const savePath = knowledge.category
      ? `${knowledge.category}/${knowledge.name}`
      : knowledge.name
    const saveResult = await window.electronAPI!.saveKnowledgeFile(savePath, mdContent)
    if (!saveResult.success) {
      console.error(`保存知识库文件 ${savePath} 失败:`, saveResult.error)
      return false
    }
    return true
  } catch (error) {
    console.error('保存知识库文件失败:', error)
    return false
  }
}

// 加载知识库文件列表（递归扫描子目录）
export const loadKnowledgeFilesFromLocal = async (): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const data = localStorage.getItem(KNOWLEDGE_FILES_KEY)
      if (!data) return []
      return JSON.parse(data)
    } catch (error) {
      console.error('从 localStorage 加载知识库文件失败:', error)
      return []
    }
  }

  // Electron环境：从 knowledges 目录的 Markdown 文件加载（含子目录）
  try {
    const result = await window.electronAPI!.loadAllKnowledgeFiles()

    if (result.success && result.files) {
      const knowledges: any[] = []

      for (const fileName of result.files) {
        // 跳过 INDEX.md 文件（全局索引，不在知识列表中展示）
        if (fileName.toLowerCase() === 'index.md') continue

        // 文件路径不含 .md 后缀（如 "backend/api" 或 "root-doc"）
        const knowledgePath = fileName.replace(/\.md$/, '')
        const contentResult = await window.electronAPI!.loadKnowledgeFile(knowledgePath)
        if (contentResult.success && contentResult.content) {
          const { metadata, body } = parseKnowledgeFrontmatter(contentResult.content)

          // 从文件路径中提取 category（子目录路径）
          // 如 "backend/api" -> category: "backend", name 文件名部分 "api"
          // 如 "root-doc" -> category: "", name: "root-doc"
          const lastSlashIndex = knowledgePath.lastIndexOf('/')
          const category = lastSlashIndex > 0 ? knowledgePath.substring(0, lastSlashIndex) : ''

          knowledges.push({
            id: `knowledge-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: metadata.name || knowledgePath.substring(lastSlashIndex + 1),
            type: 'knowledge',
            description: metadata.description || '',
            content: body,
            tags: metadata.tags || [],
            category: category,
            filepath: knowledgePath,
            createdAt: contentResult.mtime || new Date().toISOString(),
            updatedAt: contentResult.mtime || new Date().toISOString(),
          })
        }
      }

      return knowledges
    }
    return []
  } catch (error) {
    console.error('加载知识库文件失败:', error)
    return []
  }
}

// 树形节点结构
interface TreeNode {
  name: string
  children: Map<string, TreeNode>
  files: string[]
}

/**
 * 根据知识库文件列表动态生成树形目录 markdown 内容
 * 根据 category 路径递归构建嵌套树，用 box-drawing 字符渲染
 */
export const generateIndexContent = (knowledgeFiles: { name: string; category?: string }[]): string => {
  // 构建树形结构
  const root: TreeNode = { name: '', children: new Map(), files: [] }

  for (const file of knowledgeFiles) {
    const category = file.category || ''
    if (!category) {
      root.files.push(file.name)
    } else {
      const parts = category.split('/')
      let current = root
      for (const part of parts) {
        if (!current.children.has(part)) {
          current.children.set(part, { name: part, children: new Map(), files: [] })
        }
        current = current.children.get(part)!
      }
      current.files.push(file.name)
    }
  }

  // 移除与子目录同名且无自定义内容的文件
  // 仅当同名文件是目录的自动概览（无 description/content）时才移除
  // 有实际内容的同名文件（如 zoloz/zoloz.md）应保留展示
  const removeDuplicateFiles = (node: TreeNode) => {
    for (const child of node.children.values()) {
      removeDuplicateFiles(child)
    }
  }
  removeDuplicateFiles(root)

  const lines: string[] = []

  const renderNode = (node: TreeNode, prefix: string, isRoot: boolean) => {
    const sortedChildren = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b))
    const sortedFiles = [...node.files].sort()

    // 统一排列：先文件后文件夹
    const items: Array<{ type: 'file'; name: string } | { type: 'dir'; name: string; node: TreeNode }> = []
    for (const fileName of sortedFiles) {
      items.push({ type: 'file', name: `${fileName}.md` })
    }
    for (const [childName, childNode] of sortedChildren) {
      items.push({ type: 'dir', name: childName, node: childNode })
    }

    for (let i = 0; i < items.length; i++) {
      const itemIsLast = i === items.length - 1
      const item = items[i]

      if (isRoot) {
        lines.push(`${item.name}`)
        if (item.type === 'dir') {
          renderNode(item.node, '', false)
        }
      } else {
        const connector = itemIsLast ? '└── ' : '├── '
        lines.push(`${prefix}${connector}${item.name}`)
        if (item.type === 'dir') {
          const childPrefix = prefix + (itemIsLast ? '    ' : '│   ')
          renderNode(item.node, childPrefix, false)
        }
      }
    }
  }

  renderNode(root, '', true)

  // 树形内容放到代码块中，保证 MarkdownRenderer 渲染时保留格式
  let result = '```\n'
  result += lines.join('\n')
  result += '\n```'

  return result
}

// 删除单个知识库文件（支持子目录路径）
export const deleteKnowledgeFileFromLocal = async (filepath: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：由 store 处理
    return true
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.deleteKnowledgeFile(filepath)
    return result.success
  } catch (error) {
    console.error('删除知识库文件失败:', error)
    return false
  }
}

// ===== 应用配置存储方法 =====
const APP_CONFIG_KEY = 'flow-editor-app-config'

// 默认应用配置
const DEFAULT_APP_CONFIG: AppConfig = {
  recentProjects: [],
  lastProjectPath: null,
  maxRecentProjects: 10,
  sidebarNavOrder: ['agents', 'knowledges', 'workflows', 'nodes', 'resources'],
}

// 加载应用配置
export const loadAppConfig = async (): Promise<AppConfig> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage
    try {
      const data = localStorage.getItem(APP_CONFIG_KEY)
      if (!data) return DEFAULT_APP_CONFIG
      return JSON.parse(data)
    } catch (error) {
      console.error('从 localStorage 加载应用配置失败:', error)
      return DEFAULT_APP_CONFIG
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.loadAppConfig()
    if (result.success) {
      return result.config
    }
    return DEFAULT_APP_CONFIG
  } catch (error) {
    console.error('加载应用配置失败:', error)
    return DEFAULT_APP_CONFIG
  }
}

// 保存应用配置
export const saveAppConfig = async (config: AppConfig): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage
    try {
      localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(config))
      return true
    } catch (error) {
      console.error('保存应用配置到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.saveAppConfig(config)
    return result.success
  } catch (error) {
    console.error('保存应用配置失败:', error)
    return false
  }
}

// 打开文件夹选择对话框
export const openFolderDialog = async (): Promise<string | null> => {
  if (!isElectron()) {
    // 浏览器环境不支持
    console.warn('浏览器环境不支持文件夹选择对话框')
    return null
  }

  try {
    const result = await window.electronAPI!.openFolderDialog()
    if (result.success) {
      return result.path
    }
    return null
  } catch (error) {
    console.error('打开文件夹对话框失败:', error)
    return null
  }
}

// 初始化项目目录
export const initProjectDir = async (projectPath: string): Promise<{ success: boolean; projectId?: string; projectName?: string }> => {
  if (!isElectron()) {
    // 浏览器环境不支持
    console.warn('浏览器环境不支持初始化项目目录')
    return { success: false }
  }

  try {
    const result = await window.electronAPI!.initProjectDir(projectPath)
    if (result.success) {
      return {
        success: true,
        projectId: result.projectId,
        projectName: result.projectName,
      }
    }
    return { success: false }
  } catch (error) {
    console.error('初始化项目目录失败:', error)
    return { success: false }
  }
}

// 设置项目路径（切换项目时使用）
export const setProjectPath = async (projectPath: string): Promise<{ success: boolean; projectId?: string; projectName?: string }> => {
  if (!isElectron()) {
    // 浏览器环境不支持
    console.warn('浏览器环境不支持设置项目路径')
    return { success: false }
  }

  try {
    const result = await window.electronAPI!.setProjectPath(projectPath)
    if (result.success) {
      return {
        success: true,
        projectId: result.projectId,
        projectName: result.projectName,
      }
    }
    return { success: false }
  } catch (error) {
    console.error('设置项目路径失败:', error)
    return { success: false }
  }
}

// ===== 知识图谱配置存储方法（存储在 .ocean 目录）=====

// 知识图谱配置在 localStorage 中的 key（浏览器环境）
const KNOWLEDGE_GRAPH_CONFIG_KEY = 'ocean-knowledge-graph-config'

// 默认知识图谱配置
export const DEFAULT_KNOWLEDGE_GRAPH_CONFIG: KnowledgeGraphConfig = {
  nodeSize: 5,
  linkDistance: 80,
  linkWidth: 1,
  labelSize: 10,
  relationLabelSize: 5,
  showRelationLabel: true,
  centerForce: 0.05, // 增强向心力，让节点有被困在球里的聚簇感
  linkStrength: 0.5,
  chargeStrength: -50,
}

// 加载知识图谱配置
export const loadKnowledgeGraphConfig = async (): Promise<KnowledgeGraphConfig> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage
    try {
      const data = localStorage.getItem(KNOWLEDGE_GRAPH_CONFIG_KEY)
      if (!data) return DEFAULT_KNOWLEDGE_GRAPH_CONFIG
      return JSON.parse(data)
    } catch (error) {
      console.error('从 localStorage 加载知识图谱配置失败:', error)
      return DEFAULT_KNOWLEDGE_GRAPH_CONFIG
    }
  }

  // Electron 环境：从 .ocean 目录加载
  try {
    const result = await window.electronAPI!.loadKnowledgeGraphConfig()
    if (result.success && result.config) {
      return result.config
    }
    return DEFAULT_KNOWLEDGE_GRAPH_CONFIG
  } catch (error) {
    console.error('加载知识图谱配置失败:', error)
    return DEFAULT_KNOWLEDGE_GRAPH_CONFIG
  }
}

// 保存知识图谱配置
export const saveKnowledgeGraphConfig = async (config: KnowledgeGraphConfig): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage
    try {
      localStorage.setItem(KNOWLEDGE_GRAPH_CONFIG_KEY, JSON.stringify(config))
      return true
    } catch (error) {
      console.error('保存知识图谱配置到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存到 .ocean 目录
  try {
    const result = await window.electronAPI!.saveKnowledgeGraphConfig(config)
    return result.success
  } catch (error) {
    console.error('保存知识图谱配置失败:', error)
    return false
  }
}

// ===== 局部节点存储方法 =====

/**
 * 生成局部节点Markdown内容（带结构格式）
 */
export const generateLocalNodeMd = (node: any): string => {
  const lines: string[] = []

  // Frontmatter
  lines.push('---')
  lines.push(`name: ${node.data.label}`)
  lines.push(`type: local`)
  if (node.data.description) {
    lines.push(`description: ${node.data.description}`)
  }
  lines.push('---')
  lines.push('')

  // 节点名称
  lines.push('# 节点名称')
  lines.push(`- ${node.data.label}`)
  lines.push('')

  // 节点描述
  lines.push('# 节点描述')
  lines.push(`- ${node.data.description || '暂无描述'}`)
  lines.push('')

  // 节点内容
  lines.push('# 节点内容')
  const content = node.data.content || '暂无内容'
  // 将内容按行分割，每行添加 - 前缀
  content.split('\n').forEach((line: string) => {
    if (line.trim()) {
      lines.push(`- ${line.trim()}`)
    }
  })

  return lines.join('\n')
}

/**
 * 解析局部节点Markdown内容（带结构格式）
 */
export const parseLocalNodeMd = (content: string, fileName?: string): any => {
  const { metadata, body } = parseFrontmatter(content)
  const name = metadata.name || (fileName ? fileName.replace('.md', '') : `local-node-${Date.now()}`)

  // 解析结构化的 Markdown 内容
  const lines = body.split('\n')
  let currentSection = ''
  let description = ''
  let nodeContent = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '# 节点名称') {
      currentSection = 'name'
    } else if (trimmed === '# 节点描述') {
      currentSection = 'description'
    } else if (trimmed === '# 节点内容') {
      currentSection = 'content'
    } else if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2)
      if (currentSection === 'description') {
        description = description ? `${description}\n${value}` : value
      } else if (currentSection === 'content') {
        nodeContent = nodeContent ? `${nodeContent}\n${value}` : value
      }
    }
  }

  return {
    name,
    type: 'local',
    description: metadata.description || description,
    content: nodeContent,
  }
}

/**
 * 保存局部节点到工作流nodes目录
 */
export const saveLocalNodeToWorkflow = async (workflowName: string, node: any): Promise<boolean> => {
  const nodeName = node.data.localNodeName || node.data.label
  const content = generateLocalNodeMd(node)

  if (!isElectron()) {
    // 浏览器环境：使用 localStorage
    try {
      const key = `local-node-${workflowName}-${nodeName}`
      localStorage.setItem(key, content)
      // 记录该工作流的局部节点列表
      const listKey = `local-nodes-${workflowName}`
      const nodeList = JSON.parse(localStorage.getItem(listKey) || '[]')
      if (!nodeList.includes(nodeName)) {
        nodeList.push(nodeName)
        localStorage.setItem(listKey, JSON.stringify(nodeList))
      }
      return true
    } catch (error) {
      console.error('保存局部节点到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.saveLocalNode(workflowName, nodeName, content)
    return result.success
  } catch (error) {
    console.error('保存局部节点失败:', error)
    return false
  }
}

/**
 * 加载工作流的所有局部节点
 */
export const loadAllLocalNodesFromWorkflow = async (workflowName: string): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const listKey = `local-nodes-${workflowName}`
      const nodeList = JSON.parse(localStorage.getItem(listKey) || '[]')
      const nodes: any[] = []

      for (const nodeName of nodeList) {
        const key = `local-node-${workflowName}-${nodeName}`
        const content = localStorage.getItem(key)
        if (content) {
          const nodeData = parseLocalNodeMd(content, nodeName)
          nodes.push({
            ...nodeData,
            id: `local-${nodeName}-${Date.now()}`,
          })
        }
      }

      return nodes
    } catch (error) {
      console.error('从 localStorage 加载局部节点失败:', error)
      return []
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.loadAllLocalNodes(workflowName)
    if (!result.success || !result.files) {
      return []
    }

    const nodes: any[] = []
    for (const fileName of result.files) {
      const nodeName = fileName.replace('.md', '')
      const nodeResult = await window.electronAPI!.loadLocalNode(workflowName, nodeName)
      if (nodeResult.success && nodeResult.content) {
        const nodeData = parseLocalNodeMd(nodeResult.content, nodeName)
        nodes.push({
          ...nodeData,
          id: `local-${nodeName}-${Date.now()}`,
        })
      }
    }

    return nodes
  } catch (error) {
    console.error('加载局部节点失败:', error)
    return []
  }
}

/**
 * 删除工作流的局部节点
 */
export const deleteLocalNodeFromWorkflow = async (workflowName: string, nodeName: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const key = `local-node-${workflowName}-${nodeName}`
      localStorage.removeItem(key)
      // 更新节点列表
      const listKey = `local-nodes-${workflowName}`
      const nodeList = JSON.parse(localStorage.getItem(listKey) || '[]')
      const index = nodeList.indexOf(nodeName)
      if (index > -1) {
        nodeList.splice(index, 1)
        localStorage.setItem(listKey, JSON.stringify(nodeList))
      }
      return true
    } catch (error) {
      console.error('从 localStorage 删除局部节点失败:', error)
      return false
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.deleteLocalNode(workflowName, nodeName)
    return result.success
  } catch (error) {
    console.error('删除局部节点失败:', error)
    return false
  }
}

// ===== 设置模块存储方法 =====

import type { LLMProvider, CLIAgent } from '../types'

/**
 * 保存 LLM 提供商配置 - 直接保存到配置文件 (全量保存,用于特殊情况)
 */
export const saveLLMProviders = async (providers: LLMProvider[]): Promise<void> => {
  const config = { providers }
  if (isElectron() && window.electronAPI?.saveLLMConfig) {
    await window.electronAPI.saveLLMConfig(config)
  }
}

/**
 * 加载 LLM 提供商配置 - 直接从配置文件读取
 */
export const loadLLMProviders = async (): Promise<LLMProvider[]> => {
  return await loadLLMProvidersFromFile()
}

/**
 * 保存 CLI Agent 配置
 */
export const saveCLIAgents = async (agents: CLIAgent[]): Promise<void> => {
  if (!isElectron()) {
    // 浏览器环境:保存到 localStorage
    try {
      localStorage.setItem('cli-agents', JSON.stringify(agents))
    } catch (error) {
      console.error('保存 CLI Agent 配置到 localStorage 失败:', error)
    }
    return
  }

  // Electron 环境:保存到 .ocean/settings/cli-agents.json
  try {
    const settings = { agents }
    const content = JSON.stringify(settings, null, 2)
    // 暂时使用 localStorage,后续实现 Electron IPC 通道
    localStorage.setItem('cli-agents', content)
  } catch (error) {
    console.error('保存 CLI Agent 配置失败:', error)
  }
}

/**
 * 加载 CLI Agent 配置
 */
export const loadCLIAgents = async (): Promise<CLIAgent[]> => {
  if (!isElectron()) {
    // 浏览器环境:从 localStorage 读取
    try {
      const stored = localStorage.getItem('cli-agents')
      if (!stored) return []
      const data = JSON.parse(stored)
      return Array.isArray(data) ? data : (data.agents || [])
    } catch (error) {
      console.error('从 localStorage 加载 CLI Agent 配置失败:', error)
      return []
    }
  }

  // Electron 环境:从 .ocean/settings/cli-agents.json 加载
  try {
    const stored = localStorage.getItem('cli-agents')
    if (!stored) return []
    const data = JSON.parse(stored)
    return Array.isArray(data) ? data : (data.agents || [])
  } catch (error) {
    console.error('加载 CLI Agent 配置失败:', error)
    return []
  }
}

/**
 * 测试 LLM 连接
 */
export const testLLMConnection = async (provider: LLMProvider): Promise<boolean> => {
  console.log('\n=== LLM 连接测试开始 ===')
  console.log('提供商:', provider.name)
  console.log('类型:', provider.type)

  // Electron 环境:使用主进程发送请求(绕过 CORS)
  if (isElectron() && window.electronAPI?.testLLMConnection) {
    console.log('使用 Electron 主进程发送请求...')
    try {
      const result = await window.electronAPI.testLLMConnection(provider)

      if (result.success) {
        console.log('✅ 连接测试成功')
        console.log('HTTP 状态:', result.status, result.statusText)
        console.log('=== LLM 连接测试结束 ===\n')
        return true
      } else {
        console.log('❌ 连接测试失败:', result.error || `HTTP ${result.status}`)
        console.log('=== LLM 连接测试结束 ===\n')
        return false
      }
    } catch (error) {
      console.error('❌ 测试出错:', error)
      console.log('=== LLM 连接测试结束 ===\n')
      return false
    }
  }

  // 浏览器环境:构建 API 端点和请求头
  const testEndpoint = provider.baseUrl.endsWith('/')
    ? `${provider.baseUrl}models`
    : `${provider.baseUrl}/models`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // 根据不同类型设置认证头
  if (provider.type === 'openai' || provider.type === 'custom') {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  } else if (provider.type === 'anthropic') {
    headers['x-api-key'] = provider.apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (provider.type === 'azure') {
    headers['api-key'] = provider.apiKey
  }

  console.log('测试端点:', testEndpoint)
  console.log('请求头:', headers)

  // 浏览器环境受 CORS 限制,尝试发送请求获取响应信息
  try {
    console.log('📤 正在发送请求...')
    const response = await fetch(testEndpoint, {
      method: 'GET',
      headers,
    })

    console.log('📥 收到响应')
    console.log('状态码:', response.status, response.statusText)
    console.log('响应头:', Object.fromEntries(response.headers.entries()))

    // 尝试读取响应体
    try {
      const responseText = await response.text()
      console.log('响应体(文本):', responseText)

      try {
        const responseJson = JSON.parse(responseText)
        console.log('响应体(JSON):', responseJson)
      } catch {
        console.log('响应体不是 JSON 格式')
      }
    } catch (error) {
      console.error('读取响应体失败:', error)
    }

    if (response.ok) {
      console.log('✅ 连接测试成功')
      console.log('=== LLM 连接测试结束 ===\n')
      return true
    } else {
      console.log('❌ 连接测试失败: HTTP', response.status)
      console.log('=== LLM 连接测试结束 ===\n')
      return false
    }
  } catch (error) {
    console.log('❌ 请求失败:', error instanceof Error ? error.message : error)

    console.log('\n💡 说明: 浏览器环境受 CORS(跨域资源共享)安全策略限制')
    console.log('💡 这是正常现象,不影响配置的使用')
    console.log('💡 建议: 使用 Electron 桌面模式启动(pnpm electron:dev)\n')

    console.log('=== LLM 连接测试结束 ===\n')

    // 浏览器环境下,如果配置完整,仍然返回 true
    const hasRequiredFields = provider.baseUrl && provider.apiKey
    if (hasRequiredFields) {
      console.log('✅ 配置完整性检查通过')
      console.log('   - Base URL: 已配置')
      console.log('   - API Key: 已配置')
      console.log('   - 配置有效,可以保存并使用\n')
      return true
    } else {
      console.log('❌ 配置完整性检查失败')
      if (!provider.baseUrl) console.log('   - Base URL: 未配置')
      if (!provider.apiKey) console.log('   - API Key: 未配置')
      console.log('   - 请完善配置信息\n')
      return false
    }
  }
}

/**
 * 测试可执行文件路径
 */
export const testExecutablePath = async (filePath: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境:简单验证路径格式
    console.log('浏览器环境:仅验证路径格式')
    return !!(filePath && filePath.length > 0)
  }

  // Electron 环境:使用主进程检查文件
  if (window.electronAPI?.testExecutablePath) {
    const result = await window.electronAPI.testExecutablePath(filePath)
    if (result.success) {
      console.log('✅ 可执行文件有效:', filePath)
      console.log('文件存在:', result.exists)
      console.log('可执行:', result.isExecutable)
      return true
    } else {
      console.log('❌ 可执行文件无效:', result.error)
      return false
    }
  }

  return true
}

// ===== 能力配置存储方法 =====

// 默认的能力LLM创建提示词模板
// 默认的 Agentic 创建能力提示词模板
const DEFAULT_ABENTIC_CREATE_PROMPT_TEMPLATE = `## 角色
你是一个专业的AI能力设计助手，请根据用户需求生成高质量的能力内容。

## 任务
根据用户描述，生成详细的能力内容。

## 注意事项
- 内容结构要清晰，使用 Markdown 格式
- 包含可衡量/量化的指标和验收维度
- 提供具体的使用场景和执行步骤

## 输出要求
直接输出能力的详细内容（Markdown格式），不需要包含名称和描述。

用户描述：{{userDescription}}`

// 默认的 Agentic 优化能力提示词模板
const DEFAULT_AGENTIC_OPTIMIZE_PROMPT_TEMPLATE = `请帮我优化现有的能力文档。

## 当前能力文档内容

文件路径：{{filePath}}

{{currentContent}}

## 优化目标

{{optimizeTarget}}

## 任务要求

1. 使用 read 工具读取当前能力文档
2. 读取 .claude/abilities/ 目录下的其他能力文档作为参考
3. 根据优化目标，改进能力文档的内容
4. 使用 edit 工具更新文件内容

## 优化原则

1. 保持原有核心功能和价值
2. 根据优化目标有针对性地改进
3. 结构清晰，表述准确
4. 符合项目其他能力文档的风格和格式

请直接优化并保存文件。`

/**
 * 获取默认 Agentic 创建能力提示词模板
 */
export const getDefaultAgenticCreatePromptTemplate = (): string => {
  return DEFAULT_ABENTIC_CREATE_PROMPT_TEMPLATE
}

/**
 * 获取默认 Agentic 优化能力提示词模板
 */
export const getDefaultAgenticOptimizePromptTemplate = (): string => {
  return DEFAULT_AGENTIC_OPTIMIZE_PROMPT_TEMPLATE
}

// ===== 技能模块模板存储方法 =====

// 默认的技能 LLM 创建提示词模板
const DEFAULT_SKILL_PROMPT_TEMPLATE = `## 角色
你是一个专业的技能设计助手。请根据用户提供的描述，生成高质量的技能内容。

## 工作流程
1. 深入理解用户的需求描述
2. 详细设计和构思技能内容
3. 直接输出技能详情

## 技能说明
技能是一个可复用的能力包，可能包含脚本、参考文档、示例等资源。技能内容应清晰描述技能用途、执行步骤、注意事项等。

## 注意事项
- 输出的技能内容必须详细、具体，不可泛泛而谈
- 内容结构要清晰，使用 Markdown 格式
- 包含具体的使用场景和执行步骤
- 如涉及脚本执行，应说明脚本的调用方式

## 输出要求
请直接输出技能的详细内容（Markdown格式），不需要包含名称和描述字段。输出内容应包括：
- 技能说明
- 使用场景
- 执行步骤
- 注意事项
- 相关资源（如有）

用户描述：{{userDescription}}`

// 默认的技能 Agentic 创建提示词模板
const DEFAULT_SKILL_AGENTIC_CREATE_PROMPT_TEMPLATE = `## 角色
你是一个专业的技能设计助手，请根据用户需求生成高质量的技能内容。

## 任务
根据用户描述，生成详细的技能内容。

## 注意事项
- 内容结构要清晰，使用 Markdown 格式
- 提供具体的使用场景和执行步骤
- 如涉及脚本执行，应说明脚本的调用方式

## 输出要求
直接输出技能的详细内容（Markdown格式），不需要包含名称和描述。

用户描述：{{userDescription}}`

// 默认的技能优化提示词模板
const DEFAULT_SKILL_OPTIMIZE_PROMPT_TEMPLATE = `你是一个专业的AI技能优化助手。请根据用户提供的优化目标，对现有的技能内容进行优化改进。

## 现有技能内容
{{currentContent}}

## 优化目标
{{optimizeTarget}}

## 输出要求
请直接输出优化后的技能内容（Markdown格式），不需要包含名称和描述字段。

## 优化原则
1. 保持原有核心功能和价值
2. 根据优化目标有针对性地改进
3. 结构清晰，表述准确
4. 如有必要，可补充使用场景或注意事项
5. 如涉及脚本执行，说明脚本的调用方式

请直接输出优化后的Markdown内容，不要包含代码块标记。`

/**
 * 加载技能模板文件
 * @param templateType 模板类型: 'llm-create' | 'agentic-create' | 'llm-optimize'
 * @returns 模板内容，如果文件不存在则返回默认模板
 */
export const loadSkillTemplateFile = async (templateType: 'llm-create' | 'agentic-create' | 'llm-optimize'): Promise<string> => {
  // 获取对应类型的默认模板
  const getDefaultTemplate = (type: string): string => {
    switch (type) {
      case 'llm-create':
        return DEFAULT_SKILL_PROMPT_TEMPLATE
      case 'agentic-create':
        return DEFAULT_SKILL_AGENTIC_CREATE_PROMPT_TEMPLATE
      case 'llm-optimize':
        return DEFAULT_SKILL_OPTIMIZE_PROMPT_TEMPLATE
      default:
        return DEFAULT_SKILL_PROMPT_TEMPLATE
    }
  }

  if (!isElectron()) {
    // 浏览器环境从 localStorage 读取
    const key = `skill-template-${templateType}`
    const stored = localStorage.getItem(key)
    if (stored) {
      return stored
    }
    // 返回默认模板
    return getDefaultTemplate(templateType)
  }

  try {
    const result = await window.electronAPI?.loadSkillTemplateFile?.(templateType)
    if (result && result.success && result.content) {
      return result.content
    }
    // 文件不存在，返回默认模板
    return getDefaultTemplate(templateType)
  } catch (error) {
    console.error(`加载技能模板文件失败 (${templateType}):`, error)
    // 出错时返回默认模板
    return getDefaultTemplate(templateType)
  }
}

/**
 * 保存技能模板到本地文件
 * @param templateType 模板类型: 'llm-create' | 'agentic-create' | 'llm-optimize'
 * @param content 模板内容
 */
export const saveSkillTemplateFile = async (templateType: 'llm-create' | 'agentic-create' | 'llm-optimize', content: string): Promise<void> => {
  if (!isElectron()) {
    // 浏览器环境使用 localStorage
    const key = `skill-template-${templateType}`
    localStorage.setItem(key, content)
    return
  }

  try {
    await window.electronAPI?.saveSkillTemplateFile?.(templateType, content)
  } catch (error) {
    console.error(`保存技能模板文件失败 (${templateType}):`, error)
    throw error
  }
}

/**
 * 获取默认技能创建提示词模板
 */
export const getDefaultSkillPromptTemplate = (): string => {
  return DEFAULT_SKILL_PROMPT_TEMPLATE
}

/**
 * 获取默认技能 Agentic 创建提示词模板
 */
export const getDefaultSkillAgenticCreatePromptTemplate = (): string => {
  return DEFAULT_SKILL_AGENTIC_CREATE_PROMPT_TEMPLATE
}

/**
 * 获取默认技能优化提示词模板
 */
export const getDefaultSkillOptimizePromptTemplate = (): string => {
  return DEFAULT_SKILL_OPTIMIZE_PROMPT_TEMPLATE
}

// ===== LLM 配置文件存储方法 =====

/**
 * 添加一个 LLM 提供商到配置文件
 */
export const addLLMProviderToFile = async (provider: LLMProvider): Promise<boolean> => {
  console.log('addLLMProviderToFile 被调用, provider:', provider.name)

  // 读取现有配置
  const providers = await loadLLMProvidersFromFile()

  // 添加新的提供商到开头
  const newProviders = [provider, ...providers]

  // 保存
  const config = { providers: newProviders }

  if (isElectron() && window.electronAPI?.saveLLMConfig) {
    const result = await window.electronAPI.saveLLMConfig(config)
    console.log('addLLMProviderToFile 结果:', result)
    return result.success
  }

  return false
}

/**
 * 更新配置文件中的一个 LLM 提供商
 */
export const updateLLMProviderInFile = async (id: string, updates: Partial<LLMProvider>): Promise<boolean> => {
  console.log('updateLLMProviderInFile 被调用, id:', id, 'updates:', Object.keys(updates))

  // 读取现有配置
  const providers = await loadLLMProvidersFromFile()

  // 更新对应的提供商
  const newProviders = providers.map((p) =>
    p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
  )

  // 保存
  const config = { providers: newProviders }

  if (isElectron() && window.electronAPI?.saveLLMConfig) {
    const result = await window.electronAPI.saveLLMConfig(config)
    console.log('updateLLMProviderInFile 结果:', result)
    return result.success
  }

  return false
}

/**
 * 从配置文件删除一个 LLM 提供商
 */
export const deleteLLMProviderFromFile = async (id: string): Promise<boolean> => {
  console.log('deleteLLMProviderFromFile 被调用, id:', id)

  // 读取现有配置
  const providers = await loadLLMProvidersFromFile()

  // 删除对应的提供商
  const newProviders = providers.filter((p) => p.id !== id)

  // 保存
  const config = { providers: newProviders }

  if (isElectron() && window.electronAPI?.saveLLMConfig) {
    const result = await window.electronAPI.saveLLMConfig(config)
    console.log('deleteLLMProviderFromFile 结果:', result)
    return result.success
  }

  return false
}

/**
 * 从文件加载 LLM 提供商列表
 */
export const loadLLMProvidersFromFile = async (): Promise<LLMProvider[]> => {
  console.log('loadLLMProvidersFromFile 被调用')

  // Electron 环境:从 .ocean/llm-config.json 加载
  if (isElectron() && window.electronAPI?.loadLLMConfig) {
    const result = await window.electronAPI.loadLLMConfig()
    if (result.success && result.config) {
      return result.config.providers || []
    }
  }

  return []
}

/**
 * 获取默认 LLM 提供商(从配置文件读取，返回第一个启用的提供商)
 */
export const getDefaultLLMProvider = async (): Promise<LLMProvider | null> => {
  const providers = await loadLLMProvidersFromFile()
  // 返回第一个启用的提供商
  return providers.find(p => p.isEnabled) || null
}

// ===== Agentic 配置存储方法 =====

// 默认 Agentic 工具配置 - 使用 @mariozechner/pi-coding-agent 提供的工具
const defaultAgenticTools: AgenticToolConfig[] = [
  { type: 'file-read', enabled: true, description: '读取文件内容，支持分段读取' },
  { type: 'file-write', enabled: true, description: '写入文件，自动创建目录' },
  { type: 'file-edit', enabled: true, description: '查找并替换文本' },
  { type: 'file-ls', enabled: true, description: '列出目录内容' },
  { type: 'file-grep', enabled: true, description: '搜索文件内容' },
  { type: 'file-find', enabled: true, description: '查找文件' },
  { type: 'bash-execute', enabled: false, description: '执行终端命令' }
]

/**
 * 保存 Agentic 配置到文件
 */
export const saveAgenticConfig = async (config: AgenticConfig): Promise<boolean> => {
  try {
    // Electron 环境：保存到 .ocean/agentic-config.json
    if (isElectron() && window.electronAPI?.saveAgenticConfig) {
      const result = await window.electronAPI.saveAgenticConfig(config)
      if (result.success) {
        return true
      } else {
        console.error('保存 Agentic 配置失败:', result.error)
        return false
      }
    }

    // 浏览器环境：使用 localStorage 作为回退
    localStorage.setItem('agentic-config', JSON.stringify(config))
    return true
  } catch (error) {
    console.error('保存 Agentic 配置失败:', error)
    return false
  }
}

/**
 * 加载 Agentic 配置
 */
export const loadAgenticConfig = async (): Promise<AgenticConfig> => {
  try {
    // Electron 环境：从 .ocean/agentic-config.json 加载
    if (isElectron() && window.electronAPI?.loadAgenticConfig) {
      const result = await window.electronAPI.loadAgenticConfig()
      if (result.success && result.config) {
        const parsed = result.config
        // 确保工具配置完整
        const storedTools = parsed.tools || []
        const mergedTools = defaultAgenticTools.map(defaultTool => {
          const storedTool = storedTools.find((t: AgenticToolConfig) => t.type === defaultTool.type)
          return storedTool || defaultTool
        })
        return {
          enabled: parsed.enabled ?? false,
          providerId: parsed.providerId,
          modelId: parsed.modelId,
          tools: mergedTools,
          maxIterations: parsed.maxIterations ?? 10,
          timeout: parsed.timeout ?? 60,
          updatedAt: parsed.updatedAt || new Date().toISOString()
        }
      }
      // 文件不存在或加载失败，返回默认配置
      return getDefaultAgenticConfig()
    }

    // 浏览器环境：从 localStorage 加载作为回退
    const stored = localStorage.getItem('agentic-config')
    if (!stored) {
      return getDefaultAgenticConfig()
    }
    const parsed = JSON.parse(stored)
    const storedTools = parsed.tools || []
    const mergedTools = defaultAgenticTools.map(defaultTool => {
      const storedTool = storedTools.find((t: AgenticToolConfig) => t.type === defaultTool.type)
      return storedTool || defaultTool
    })
    return {
      enabled: parsed.enabled ?? false,
      providerId: parsed.providerId,
      modelId: parsed.modelId,
      tools: mergedTools,
      maxIterations: parsed.maxIterations ?? 10,
      timeout: parsed.timeout ?? 60,
      updatedAt: parsed.updatedAt || new Date().toISOString()
    }
  } catch (error) {
    console.error('加载 Agentic 配置失败:', error)
    return getDefaultAgenticConfig()
  }
}

/**
 * 获取默认 Agentic 配置
 */
export const getDefaultAgenticConfig = (): AgenticConfig => {
  return {
    enabled: false,
    providerId: undefined,
    modelId: undefined,
    tools: defaultAgenticTools,
    maxIterations: 10,
    timeout: 60,
    updatedAt: new Date().toISOString()
  }
}

// ===== 技能文件存储方法 =====
const SKILL_FILES_KEY = 'flow-editor-skill-files'

// 解析技能 frontmatter（包含 name, description）
const parseSkillFrontmatter = (content: string): { metadata: Record<string, any>; body: string } => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (match) {
    const frontmatterLines = match[1].split('\n')
    const metadata: Record<string, any> = {}

    for (const line of frontmatterLines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        metadata[key] = value
      }
    }

    return { metadata, body: match[2] }
  }

  return { metadata: {}, body: content }
}

// 生成技能格式的 Markdown
const generateSkillMarkdown = (
  metadata: { name: string; description: string },
  content: string
): string => {
  return `---
name: ${metadata.name}
description: ${metadata.description}
---
${content}`
}

// 创建技能目录结构
export const createSkillDirectory = async (input: {
  name: string
  description?: string
  content: string
  scripts?: { name: string; content: string }[]
  references?: { name: string; content: string }[]
  examples?: { name: string; content: string }[]
}): Promise<any | null> => {
  if (!isElectron()) {
    // 浏览器环境：模拟创建
    const skill = {
      id: `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: input.name,
      type: 'skill' as const,
      description: input.description || '',
      content: input.content,
      scripts: input.scripts?.map(s => s.name) || [],
      references: input.references?.map(r => r.name) || [],
      examples: input.examples?.map(e => e.name) || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return skill
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.createSkillDirectory(input.name, input)
    if (result.success) {
      // 重新加载并返回新创建的技能
      const skills = await loadSkillFilesFromLocal()
      return skills.find(s => s.name === input.name) || null
    }
    return null
  } catch (error) {
    console.error('创建技能目录失败:', error)
    return null
  }
}

// 保存技能文件列表
export const saveSkillFilesToLocal = async (skills: any[]): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：使用 localStorage 存储
    try {
      localStorage.setItem(SKILL_FILES_KEY, JSON.stringify(skills))
      return true
    } catch (error) {
      console.error('保存技能文件到 localStorage 失败:', error)
      return false
    }
  }

  // Electron 环境：保存 SKILL.md 文件
  try {
    // 获取现有目录列表，用于删除不再需要的目录
    const existingResult = await window.electronAPI!.loadAllSkillDirectories()
    const existingDirs = existingResult.success ? existingResult.directories || [] : []
    const currentNames = skills.map(s => s.name)

    // 删除不再需要的目录
    for (const dirName of existingDirs) {
      if (!currentNames.includes(dirName)) {
        await window.electronAPI!.deleteSkillDirectory(dirName)
      }
    }

    // 保存每个技能的 SKILL.md 文件
    for (const skill of skills) {
      const metadata = {
        name: skill.name,
        description: skill.description || '',
      }
      const mdContent = generateSkillMarkdown(metadata, skill.content || '')

      const saveResult = await window.electronAPI!.saveSkillFile(skill.name, mdContent)
      if (!saveResult.success) {
        console.error(`保存技能文件 ${skill.name} 失败:`, saveResult.error)
      }
    }

    return true
  } catch (error) {
    console.error('保存技能文件失败:', error)
    return false
  }
}

// 加载技能文件列表
export const loadSkillFilesFromLocal = async (): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境
    try {
      const data = localStorage.getItem(SKILL_FILES_KEY)
      if (!data) return []
      return JSON.parse(data)
    } catch (error) {
      console.error('从 localStorage 加载技能文件失败:', error)
      return []
    }
  }

  // Electron环境：从 skills 目录加载
  try {
    const result = await window.electronAPI!.loadAllSkillDirectories()

    if (result.success && result.directories) {
      const skills: any[] = []

      for (const dirName of result.directories) {
        // 加载 SKILL.md
        const contentResult = await window.electronAPI!.loadSkillFile(dirName)
        if (contentResult.success && contentResult.content) {
          const { metadata, body } = parseSkillFrontmatter(contentResult.content)

          // 加载资源文件列表
          const scripts = await loadResourceList(dirName, 'scripts')
          const references = await loadResourceList(dirName, 'references')
          const examples = await loadResourceList(dirName, 'examples')

          skills.push({
            id: `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: metadata.name || dirName,
            type: 'skill',
            description: metadata.description || '',
            content: body,
            scripts,
            references,
            examples,
            createdAt: contentResult.mtime || new Date().toISOString(),
            updatedAt: contentResult.mtime || new Date().toISOString(),
          })
        }
      }

      return skills
    }
    return []
  } catch (error) {
    console.error('加载技能文件失败:', error)
    return []
  }
}

// 辅助函数：加载资源文件列表
const loadResourceList = async (skillName: string, resourceType: string): Promise<string[]> => {
  try {
    const result = await window.electronAPI!.listSkillResources(skillName, resourceType)
    return result.success ? result.files || [] : []
  } catch {
    return []
  }
}

// 删除单个技能目录
export const deleteSkillFromLocal = async (name: string): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：由 store 处理
    return true
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.deleteSkillDirectory(name)
    return result.success
  } catch (error) {
    console.error('删除技能目录失败:', error)
    return false
  }
}

// 加载技能资源文件
export const loadSkillResources = async (
  skillName: string,
  resourceType: 'scripts' | 'references' | 'examples'
): Promise<any[]> => {
  if (!isElectron()) {
    // 浏览器环境：从 localStorage 读取
    try {
      const data = localStorage.getItem(`skill-${skillName}-${resourceType}`)
      if (!data) return []
      return JSON.parse(data)
    } catch (error) {
      console.error('加载技能资源文件失败:', error)
      return []
    }
  }

  // Electron 环境
  try {
    const listResult = await window.electronAPI!.listSkillResources(skillName, resourceType)
    if (!listResult.success || !listResult.files) return []

    const resources: any[] = []
    for (const fileName of listResult.files) {
      const contentResult = await window.electronAPI!.loadSkillResource(skillName, resourceType, fileName)
      if (contentResult.success && contentResult.content) {
        resources.push({
          name: fileName,
          path: `${resourceType}/${fileName}`,
          type: resourceType,
          content: contentResult.content,
        })
      }
    }
    return resources
  } catch (error) {
    console.error('加载技能资源文件失败:', error)
    return []
  }
}

// 保存技能资源文件
export const saveSkillResource = async (
  skillName: string,
  resourceType: 'scripts' | 'references' | 'examples',
  fileName: string,
  content: string
): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：保存到 localStorage
    try {
      const key = `skill-${skillName}-${resourceType}`
      const data = localStorage.getItem(key)
      const resources = data ? JSON.parse(data) : []
      const existingIndex = resources.findIndex((r: any) => r.name === fileName)
      if (existingIndex >= 0) {
        resources[existingIndex].content = content
      } else {
        resources.push({ name: fileName, path: `${resourceType}/${fileName}`, type: resourceType, content })
      }
      localStorage.setItem(key, JSON.stringify(resources))
      return true
    } catch (error) {
      console.error('保存技能资源文件失败:', error)
      return false
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.saveSkillResource(skillName, resourceType, fileName, content)
    return result.success
  } catch (error) {
    console.error('保存技能资源文件失败:', error)
    return false
  }
}

// 删除技能资源文件
export const deleteSkillResource = async (
  skillName: string,
  resourceType: 'scripts' | 'references' | 'examples',
  fileName: string
): Promise<boolean> => {
  if (!isElectron()) {
    // 浏览器环境：从 localStorage 删除
    try {
      const key = `skill-${skillName}-${resourceType}`
      const data = localStorage.getItem(key)
      if (!data) return true
      const resources = JSON.parse(data)
      const filtered = resources.filter((r: any) => r.name !== fileName)
      localStorage.setItem(key, JSON.stringify(filtered))
      return true
    } catch (error) {
      console.error('删除技能资源文件失败:', error)
      return false
    }
  }

  // Electron 环境
  try {
    const result = await window.electronAPI!.deleteSkillResource(skillName, resourceType, fileName)
    return result.success
  } catch (error) {
    console.error('删除技能资源文件失败:', error)
    return false
  }
}

// ===== 知识模块模板存储方法 =====

// 默认的知识 Agentic 创建提示词模板
const DEFAULT_KNOWLEDGE_AGENTIC_CREATE_PROMPT_TEMPLATE = `## 角色
你是一个专业的知识库文档设计助手，请根据用户需求生成高质量的知识内容。

## 任务
根据用户描述，生成详细的知识文档内容。

## 注意事项
- 内容结构要清晰，使用 Markdown 格式
- 知识文档应包含清晰的分类和标签
- 提供具体的使用场景和相关参考资料
- 可以使用 [[文件名.md|关系]] 格式建立与其他文档的关联

## 输出要求
直接输出知识的详细内容（Markdown格式），不需要包含名称和描述字段。

用户描述：{{userDescription}}`

/**
 * 加载知识模板文件
 * @param templateType 模板类型: 'agentic-create'
 * @returns 模板内容，如果文件不存在则返回默认模板
 */
export const loadKnowledgeTemplateFile = async (templateType: 'agentic-create'): Promise<string> => {
  // 获取对应类型的默认模板
  const getDefaultTemplate = (type: string): string => {
    switch (type) {
      case 'agentic-create':
        return DEFAULT_KNOWLEDGE_AGENTIC_CREATE_PROMPT_TEMPLATE
      default:
        return DEFAULT_KNOWLEDGE_AGENTIC_CREATE_PROMPT_TEMPLATE
    }
  }

  if (!isElectron()) {
    // 浏览器环境从 localStorage 读取
    const key = `knowledge-template-${templateType}`
    const stored = localStorage.getItem(key)
    if (stored) {
      return stored
    }
    // 返回默认模板
    return getDefaultTemplate(templateType)
  }

  try {
    const result = await window.electronAPI?.loadKnowledgeTemplateFile?.(templateType)
    if (result && result.success && result.content) {
      return result.content
    }
    // 文件不存在，返回默认模板
    return getDefaultTemplate(templateType)
  } catch (error) {
    console.error(`加载知识模板文件失败 (${templateType}):`, error)
    // 出错时返回默认模板
    return getDefaultTemplate(templateType)
  }
}

/**
 * 保存知识模板到本地文件
 * @param templateType 模板类型: 'agentic-create'
 * @param content 模板内容
 */
export const saveKnowledgeTemplateFile = async (templateType: 'agentic-create', content: string): Promise<void> => {
  if (!isElectron()) {
    // 浏览器环境使用 localStorage
    const key = `knowledge-template-${templateType}`
    localStorage.setItem(key, content)
    return
  }

  try {
    await window.electronAPI?.saveKnowledgeTemplateFile?.(templateType, content)
  } catch (error) {
    console.error(`保存知识模板文件失败 (${templateType}):`, error)
    throw error
  }
}

/**
 * 获取默认知识 Agentic 创建提示词模板
 */
export const getDefaultKnowledgeAgenticCreatePromptTemplate = (): string => {
  return DEFAULT_KNOWLEDGE_AGENTIC_CREATE_PROMPT_TEMPLATE
}
