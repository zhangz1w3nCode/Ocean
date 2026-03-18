#!/usr/bin/env node

/**
 * 测试新的工作流目录结构
 */

const path = require('path')
const fs = require('fs')

// 测试数据
const testWorkflow = {
  id: 'wf-test-001',
  name: '测试新结构工作流',
  description: '测试新的目录结构'
}

const testNodes = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 100, y: 100 },
    data: { label: '开始' }
  },
  {
    id: 'end-1',
    type: 'end',
    position: { x: 300, y: 100 },
    data: { label: '结束' }
  }
]

const testEdges = [
  {
    id: 'e-1',
    source: 'start-1',
    target: 'end-1',
    type: 'smoothstep'
  }
]

// 生成 WORKFLOW.md
function generateWorkflowMd(workflow) {
  return `---
type: workflow
id: ${workflow.id}
name: ${workflow.name}
description: ${workflow.description}
---

# ${workflow.name}

## 描述
- ${workflow.description}

## 流程

### 第一阶段：开始
- 工作流开始执行

### 第二阶段：结束
- 工作流执行完毕
`
}

// 生成 flow-data.json
function generateFlowData(nodes, edges) {
  return JSON.stringify({ nodes, edges }, null, 2)
}

// 测试保存
const testDir = path.join(__dirname, '../.claude/workflows', testWorkflow.name)
const workflowMdPath = path.join(testDir, 'WORKFLOW.md')
const metaDir = path.join(testDir, 'meta')
const flowDataPath = path.join(metaDir, 'flow-data.json')
const nodesDir = path.join(testDir, 'nodes')

console.log('测试新的工作流目录结构')
console.log('========================\n')

// 创建目录结构
console.log('1. 创建目录结构...')
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true })
  console.log(`   ✓ 创建工作流目录: ${testDir}`)
}

if (!fs.existsSync(metaDir)) {
  fs.mkdirSync(metaDir, { recursive: true })
  console.log(`   ✓ 创建 meta 目录: ${metaDir}`)
}

if (!fs.existsSync(nodesDir)) {
  fs.mkdirSync(nodesDir, { recursive: true })
  console.log(`   ✓ 创建 nodes 目录: ${nodesDir}`)
}

// 保存 WORKFLOW.md
console.log('\n2. 保存 WORKFLOW.md...')
const workflowMd = generateWorkflowMd(testWorkflow)
fs.writeFileSync(workflowMdPath, workflowMd, 'utf-8')
console.log(`   ✓ 保存成功: ${workflowMdPath}`)

// 保存 flow-data.json
console.log('\n3. 保存 flow-data.json...')
const flowDataJson = generateFlowData(testNodes, testEdges)
fs.writeFileSync(flowDataPath, flowDataJson, 'utf-8')
console.log(`   ✓ 保存成功: ${flowDataPath}`)

// 验证结果
console.log('\n4. 验证目录结构...')
const files = fs.readdirSync(testDir, { withFileTypes: true })
console.log(`   目录内容:`)
files.forEach(file => {
  if (file.isDirectory()) {
    const subFiles = fs.readdirSync(path.join(testDir, file.name))
    console.log(`   - ${file.name}/`)
    subFiles.forEach(subFile => {
      console.log(`     - ${subFile}`)
    })
  } else {
    console.log(`   - ${file.name}`)
  }
})

// 读取并验证内容
console.log('\n5. 验证文件内容...')
const savedMd = fs.readFileSync(workflowMdPath, 'utf-8')
const savedFlowData = fs.readFileSync(flowDataPath, 'utf-8')

console.log(`   WORKFLOW.md 前100字符: ${savedMd.substring(0, 100)}...`)
console.log(`   flow-data.json 节点数: ${JSON.parse(savedFlowData).nodes.length}`)

console.log('\n✅ 测试完成!')