import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  saveAgentFile,
  readAgentFile,
  deleteAgentFile,
  listAgentFiles,
} from '../../core/common'
import {
  listAgents,
  readAgent,
  createAgent,
  updateAgent,
  delAgent,
} from '../../source/cli/agent'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-agent-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const agentPath = (name: string): string =>
  path.join(root, '.claude', 'agents', `${name}.md`)

const read = (name: string): string => fs.readFileSync(agentPath(name), 'utf-8')

describe('GUI 语义组（launch.cjs agent IPC 契约复刻）', () => {
  it('listAgentFiles：目录不存在返回空数组，且创建 .claude/agents 目录（getAgentsDir 副作用）', () => {
    expect(listAgentFiles(root)).toEqual({ success: true, files: [] })
    expect(fs.existsSync(path.join(root, '.claude', 'agents'))).toBe(true)
  })

  it('saveAgentFile 是无条件覆写（upsert），content 原样写盘', () => {
    saveAgentFile(root, 'a1', '---\nname: a1\n---\nbody1')
    expect(saveAgentFile(root, 'a1', '---\nname: a1\n---\nbody2')).toEqual({ success: true })
    expect(readAgentFile(root, 'a1').content).toBe('---\nname: a1\n---\nbody2')
  })

  it('readAgentFile 文件不存在返回 content:null 而非失败', () => {
    const res = readAgentFile(root, 'ghost')
    expect(res.success).toBe(true)
    expect(res.content).toBeNull()
    expect(res.mtime).toBeNull()
  })

  it('readAgentFile 存在返回原文与 mtime', () => {
    saveAgentFile(root, 'a1', '# 提示词')
    const res = readAgentFile(root, 'a1')
    expect(res.success).toBe(true)
    expect(res.content).toBe('# 提示词')
    expect(typeof res.mtime).toBe('string')
  })

  it('listAgentFiles 返回完整 .md 文件名（不剥后缀、不排序，按 readdirSync 原始顺序）', () => {
    saveAgentFile(root, 'zeta', 'a')
    saveAgentFile(root, 'alpha', 'b')
    const res = listAgentFiles(root)
    expect(res).toEqual({ success: true, files: ['alpha.md', 'zeta.md'] })
  })

  it('deleteAgentFile 文件不存在静默成功', () => {
    expect(deleteAgentFile(root, 'ghost')).toEqual({ success: true })
  })
})

describe('CLI 语义组（core/agent.ts 行为零变更）', () => {
  it('listAgents 目录不存在返回空，且不创建目录（与 GUI 组副作用区分）', () => {
    expect(listAgents(root)).toEqual([])
    expect(fs.existsSync(path.join(root, '.claude', 'agents'))).toBe(false)
  })

  it('createAgent 默认（.claude）：model haiku、color blue、systemPromptMode inherit，字段顺序与尾换行', () => {
    createAgent(root, '检索器', '你是检索智能体', {
      description: '负责检索',
      tools: 'grep,find',
      inheritProjectContext: true,
      inheritSkills: true,
    })
    expect(read('检索器')).toBe(`---
name: 检索器
description: 负责检索
model: haiku
color: blue
tools: grep,find
systemPromptMode: inherit
inheritProjectContext: true
inheritSkills: true
---

你是检索智能体
`)
  })

  it('createAgent 无 description 时不写 description 行；显式 color 覆盖默认', () => {
    createAgent(root, '带色', 'x', { color: 'green' })
    expect(read('带色')).toBe(`---
name: 带色
model: haiku
color: green
systemPromptMode: inherit
---

x
`)
  })

  it('createAgent create-only：重名抛错（exit 1 语义）', () => {
    createAgent(root, 'a1', 'x')
    expect(() => createAgent(root, 'a1', 'y')).toThrow(/智能体已存在: a1/)
  })

  it('createAgent assetRoot=pi 时落 .pi/agents 且不写 color', () => {
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), JSON.stringify({ assetRoot: 'pi' }))
    createAgent(root, 'pi智能体', 'x')
    expect(fs.existsSync(path.join(root, '.pi', 'agents', 'pi智能体.md'))).toBe(true)
    expect(fs.readFileSync(path.join(root, '.pi', 'agents', 'pi智能体.md'), 'utf-8')).toBe(`---
name: pi智能体
model: haiku
systemPromptMode: inherit
---

x
`)
  })

  it('readAgent 返回原文（含 frontmatter）；ghost 抛 ENOENT 原文', () => {
    createAgent(root, 'a1', '正文')
    expect(readAgent(root, 'a1')).toMatch(/^---\nname: a1\n/)
    expect(() => readAgent(root, 'ghost')).toThrow(/ENOENT.*\.claude\/agents\/ghost\.md/)
  })

  it('updateAgent 增量更新：未提供字段与未知字段保留，仅覆盖提供的字段', () => {
    createAgent(root, 'a1', '你是检索智能体', { description: '负责检索', tools: 'grep' })
    updateAgent(root, 'a1', '你是升级后的检索智能体', { model: 'sonnet' })
    expect(read('a1')).toBe(`---
name: a1
description: 负责检索
model: sonnet
color: blue
tools: grep
systemPromptMode: inherit
---

你是升级后的检索智能体
`)
  })

  it('updateAgent ghost 抛错', () => {
    expect(() => updateAgent(root, 'ghost', 'x')).toThrow(/智能体不存在: ghost/)
  })

  it('delAgent ghost 静默成功且不创建目录', () => {
    expect(() => delAgent(root, 'ghost')).not.toThrow()
    expect(fs.existsSync(path.join(root, '.claude', 'agents'))).toBe(false)
  })

  it('listAgents 剥后缀并排序', () => {
    createAgent(root, 'zeta', 'a')
    createAgent(root, 'alpha', 'b')
    expect(listAgents(root)).toEqual(['alpha', 'zeta'])
  })
})
