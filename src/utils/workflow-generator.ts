/**
 * 工作流 WORKFLOW.md 生成器
 * 使用 mermaid 流程图语法展示工作流
 */

export const generateWorkflowMdContent = (workflow: any, nodes: any[], edges: any[]): string => {
  // 构建节点和边的映射关系
  const nodeMap = new Map<string, any>()
  const outgoingEdges = new Map<string, any[]>()

  nodes.forEach(node => {
    nodeMap.set(node.id, node)
    outgoingEdges.set(node.id, [])
  })

  edges.forEach(edge => {
    const outList = outgoingEdges.get(edge.source) || []
    outList.push(edge)
    outgoingEdges.set(edge.source, outList)
  })

  // 获取节点mermaid ID（可路由的名称）
  // 注意：避免使用 mermaid 保留字如 'end'
  const getMermaidNodeId = (node: any): string => {
    if (!node) return ''
    if (node.type === 'start') return 'start_node'
    if (node.type === 'end') return 'end_node'
    if (node.type === 'business') {
      return node.data?.nodeDefName || node.data?.label || node.id
    }
    if (node.type === 'local') {
      return node.data?.localNodeName || node.data?.label || node.id
    }
    if (node.type === 'process') {
      return `process_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`
    }
    if (node.type === 'decision') {
      const label = node.data?.label || 'decision'
      // 保留中文字符，替换特殊字符
      return `decision_${label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 20)}`
    }
    return node.id.replace(/[^a-zA-Z0-9]/g, '_')
  }

  // 获取节点显示文本
  const getNodeDisplayText = (node: any): string => {
    if (!node) return ''
    if (node.type === 'start') return '开始'
    if (node.type === 'end') return '结束'
    if (node.type === 'business') {
      return node.data?.nodeDefName || node.data?.label || node.id
    }
    if (node.type === 'local') {
      return node.data?.localNodeName || node.data?.label || node.id
    }
    if (node.type === 'process') {
      return node.data?.label || node.data?.content?.slice(0, 20) || '处理'
    }
    if (node.type === 'decision') {
      const label = node.data?.label || '判断'
      const condition = node.data?.condition
      // 如果有判断内容，换行显示 "判断内容: xxx" 格式，判断内容限制30字
      if (condition) {
        const truncatedCondition = condition.length > 30 ? condition.slice(0, 30) + '...' : condition
        return `${label}<br/>判断内容: ${truncatedCondition}`
      }
      return label
    }
    return node.id
  }

  // 获取节点mermaid形状
  const getNodeShape = (node: any): { prefix: string, suffix: string } => {
    if (!node) return { prefix: '', suffix: '' }
    if (node.type === 'start' || node.type === 'end') {
      return { prefix: '([', suffix: '])' } // 圆角矩形/体育场
    }
    if (node.type === 'decision') {
      return { prefix: '{', suffix: '}' } // 菱形
    }
    return { prefix: '[', suffix: ']' } // 矩形
  }

  // 生成mermaid流程图
  const generateMermaidFlowchart = (): string => {
    const mermaidLines: string[] = []
    mermaidLines.push('```mermaid')
    mermaidLines.push('flowchart TD')
    mermaidLines.push('')

    // 收集所有节点定义
    const definedNodes = new Set<string>()
    const nodeDefinitions: string[] = []
    const connectionLines: string[] = []

    // 为每个节点生成定义
    nodes.forEach(node => {
      const nodeId = getMermaidNodeId(node)
      if (definedNodes.has(nodeId)) return
      definedNodes.add(nodeId)

      const displayText = getNodeDisplayText(node)
      const shape = getNodeShape(node)
      nodeDefinitions.push(`    ${nodeId}${shape.prefix}"${displayText}"${shape.suffix}`)
    })

    // 收集判断节点的分支标签
    const decisionBranches = new Map<string, Map<string, string>>()
    nodes.forEach(node => {
      if (node.type === 'decision' && node.data?.branches) {
        const branchMap = new Map<string, string>()
        node.data.branches.forEach((branch: any) => {
          branchMap.set(branch.id, branch.name || '默认')
        })
        decisionBranches.set(node.id, branchMap)
      }
    })

    // 为每条边生成连接
    edges.forEach(edge => {
      const sourceNode = nodeMap.get(edge.source)
      const targetNode = nodeMap.get(edge.target)
      if (!sourceNode || !targetNode) return

      const sourceId = getMermaidNodeId(sourceNode)
      const targetId = getMermaidNodeId(targetNode)

      // 判断是否有分支标签
      let label = ''
      if (edge.branchId && sourceNode.type === 'decision') {
        const branchMap = decisionBranches.get(sourceNode.id)
        if (branchMap && branchMap.has(edge.branchId)) {
          label = `|${branchMap.get(edge.branchId)}|`
        } else if (edge.branchDescription) {
          label = `|${edge.branchDescription.substring(0, 10)}|`
        }
      }

      if (label) {
        connectionLines.push(`    ${sourceId} -->${label} ${targetId}`)
      } else {
        connectionLines.push(`    ${sourceId} --> ${targetId}`)
      }
    })

    // 添加注释分隔
    mermaidLines.push('    %% 节点定义')
    nodeDefinitions.forEach(line => mermaidLines.push(line))
    mermaidLines.push('')
    mermaidLines.push('    %% 流程连接')
    connectionLines.forEach(line => mermaidLines.push(line))
    mermaidLines.push('```')

    return mermaidLines.join('\n')
  }

  // 获取节点的执行文件路径
  const getNodeFilePath = (node: any): string => {
    if (!node) return ''
    if (node.type === 'business') {
      const nodeName = node.data?.nodeDefName || node.data?.label || node.id
      return `.claude/nodes/${nodeName}.md`
    } else if (node.type === 'local') {
      const nodeName = node.data?.localNodeName || node.data?.label || node.id
      return `.claude/workflows/${workflow.name}/nodes/${nodeName}.md`
    } else if (node.type === 'process') {
      return node.data?.content || ''
    }
    return ''
  }

  // 获取节点名称
  const getNodeName = (node: any): string => {
    if (!node) return ''
    return node.data?.label || node.data?.nodeDefName || node.data?.localNodeName || node.id
  }

  const lines: string[] = []

  // Frontmatter
  lines.push('---')
  lines.push(`type: workflow`)
  lines.push(`name: ${workflow.name}`)
  if (workflow.description) {
    lines.push(`description: ${workflow.description}`)
  }
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
  lines.push(generateMermaidFlowchart())
  lines.push('')

  // 节点索引表
  const executableNodes = nodes.filter((n: any) =>
    n.type === 'business' || n.type === 'local' || n.type === 'process'
  )

  if (executableNodes.length > 0) {
    lines.push('## 节点')
    lines.push('')
    lines.push('| 节点名称 | 执行内容 |')
    lines.push('|----------|----------|')

    executableNodes.forEach((node: any) => {
      const name = getNodeName(node)
      const path = getNodeFilePath(node)
      lines.push(`| ${name} | \`${path}\` |`)
    })
    lines.push('')
  }

  // 注意事项
  lines.push('## 注意事项')
  lines.push('- 强制先查看和理解`流程`整体内容然后根据`流程`进行规划后续')
  lines.push('- 强制使用`TodoWrite`工具创建一个`TodoList`列表来跟踪整个`流程`')
  lines.push('- 强制严格按照`流程`执行 禁止跳过任何`流程`中的阶段')
  lines.push('- 禁止编造/假设/伪造/杜撰/猜测/说谎一切信息')
  lines.push('- 优先按照`流程`的进行 读取对应的`节点`的具体`执行内容`对应的文件详情')
  lines.push('- `执行内容`中如果有文件路径代表这是该节点需要执行的任务 必须强制读取和完成')

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
