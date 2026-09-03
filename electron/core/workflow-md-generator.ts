/**
 * 工作流 WORKFLOW.md 生成器（从 src/utils/workflow-generator.ts 移植）
 * 纯字符串操作，无 React 依赖
 * 输入：workflow 对象 + nodes 数组 + edges 数组
 * 输出：WORKFLOW.md 全文字符串
 */

export function generateWorkflowMd(workflow: any, nodes: any[], edges: any[]): string {
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
      return `decision_${label.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 20)}`
    }
    return node.id.replace(/[^a-zA-Z0-9]/g, '_')
  }

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
      if (condition) {
        const truncatedCondition = condition.length > 30 ? condition.slice(0, 30) + '...' : condition
        return `${label}<br/>判断内容: ${truncatedCondition}`
      }
      return label
    }
    return node.id
  }

  const getNodeShape = (node: any): { prefix: string, suffix: string } => {
    if (!node) return { prefix: '', suffix: '' }
    if (node.type === 'start' || node.type === 'end') {
      return { prefix: '([', suffix: '])' }
    }
    if (node.type === 'decision') {
      return { prefix: '{', suffix: '}' }
    }
    return { prefix: '[', suffix: ']' }
  }

  const generateMermaidFlowchart = (): string => {
    const mermaidLines: string[] = []
    mermaidLines.push('```mermaid')
    mermaidLines.push('flowchart TD')
    mermaidLines.push('')

    const definedNodes = new Set<string>()
    const nodeDefinitions: string[] = []
    const connectionLines: string[] = []

    nodes.forEach(node => {
      const nodeId = getMermaidNodeId(node)
      if (definedNodes.has(nodeId)) return
      definedNodes.add(nodeId)

      const displayText = getNodeDisplayText(node)
      const shape = getNodeShape(node)
      nodeDefinitions.push(`    ${nodeId}${shape.prefix}"${displayText}"${shape.suffix}`)
    })

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

    edges.forEach(edge => {
      const sourceNode = nodeMap.get(edge.source)
      const targetNode = nodeMap.get(edge.target)
      if (!sourceNode || !targetNode) return

      const sourceId = getMermaidNodeId(sourceNode)
      const targetId = getMermaidNodeId(targetNode)

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

    mermaidLines.push('    %% 节点定义')
    nodeDefinitions.forEach(line => mermaidLines.push(line))
    mermaidLines.push('')
    mermaidLines.push('    %% 流程连接')
    connectionLines.forEach(line => mermaidLines.push(line))
    mermaidLines.push('```')

    return mermaidLines.join('\n')
  }

  const getNodeFilePath = (node: any): string => {
    if (!node) return ''
    if (node.type === 'business') {
      const nodeName = node.data?.nodeDefName || node.data?.label || node.id
      return `.nodes/${nodeName}.md`
    } else if (node.type === 'local') {
      const nodeName = node.data?.localNodeName || node.data?.label || node.id
      return `.workflows/${workflow.name}/nodes/${nodeName}.md`
    } else if (node.type === 'process') {
      return node.data?.content || ''
    }
    return ''
  }

  const getNodeName = (node: any): string => {
    if (!node) return ''
    return node.data?.label || node.data?.nodeDefName || node.data?.localNodeName || node.id
  }

  const lines: string[] = []

  lines.push('---')
  lines.push(`type: workflow`)
  lines.push(`name: ${workflow.name}`)
  if (workflow.description) {
    lines.push(`description: ${workflow.description}`)
  }
  lines.push('---')
  lines.push('')

  lines.push(`# ${workflow.name}`)
  lines.push('')

  if (workflow.description) {
    lines.push('## 描述')
    lines.push(`- ${workflow.description}`)
    lines.push('')
  }

  if (workflow.inputs && workflow.inputs.length > 0) {
    lines.push('## 输入物料')
    workflow.inputs.forEach((input: string) => {
      lines.push(`- ${input}`)
    })
    lines.push('')
  }

  if (workflow.outputs && workflow.outputs.length > 0) {
    lines.push('## 输出产物')
    workflow.outputs.forEach((output: string) => {
      lines.push(`- ${output}`)
    })
    lines.push('')
  }

  lines.push('## 流程')
  lines.push('')
  lines.push(generateMermaidFlowchart())
  lines.push('')

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

  lines.push('## 强制事项')
  lines.push('- 强制创建一个`TodoList`列表来跟踪整个`流程`')
  lines.push('- 强制严格按照`流程`执行 禁止跳过任何`流程`中的阶段')
  lines.push('- `执行内容`中如果有文件路径代表这是该节点需要执行的任务 必须强制读取和完成')
  lines.push('- 强制遵循`渐进式加载节点文件详情原则` 先查看并且理解`流程`整体内容 等你执行到某个节点之后才去查看`节点`中对应的具体内容`执行内容`')
  lines.push('- 强制节点重试：如果执行某个节点没有达到预期那么尝试重试2次再进行下一个节点')

  lines.push('## 禁止事项')
  lines.push('- 禁止直接读取`执行内容`的文件')
  lines.push('- 禁止编造/假设/伪造/杜撰/猜测/说谎一切信息')

  lines.push('## 最佳实践')
  lines.push('### 执行流程')
  lines.push('- 1.查看WORKFLOW.md文件')
  lines.push('- 2.理解`流程`整体内容 不查看节点具体文件')
  lines.push('- 3.创建`TodoList`')
  lines.push('- 4.按照`流程`中的节点执行')
  lines.push('- 5.查看到`xxx`节点名称')
  lines.push('- 6.通过`节点`中的节点名称映射到具体执行内容文件或者任务描述')
  lines.push('- 7.读取并且节点的执行内容')
  lines.push('- 8.如果执行成功更新`TodoList`任务状态 执行下一个节点 如果执行不成功执行重试')
  lines.push('- 9.执行下一个节点 循环`读取节点`->`查看节点任务详情`->`执行节点`-`更新任务状态`执行到结束节点结束流程')

  if (workflow.customFields && workflow.customFields.length > 0) {
    workflow.customFields.forEach((field: any) => {
      lines.push(`## ${field.name}`)
      lines.push(field.value)
      lines.push('')
    })
  }

  return lines.join('\n')
}
