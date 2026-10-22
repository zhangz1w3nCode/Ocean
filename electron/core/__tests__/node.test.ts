import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  saveNodeFile,
  readNodeFile,
  deleteNodeFile,
  listNodeFiles,
  saveLocalNode,
  readLocalNode,
  deleteLocalNode,
  listLocalNodes,
} from '../../core/common'
import {
  listNodes,
  readNode,
  createNode,
  updateNode,
  delNode,
} from '../../source/cli/node'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-node-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const nd = (...seg: string[]): string => path.join(root, '.nodes', ...seg)
const nodeMd = (name: string): string => fs.readFileSync(nd(`${name}.md`), 'utf-8')
const localMd = (wf: string, name: string): string => fs.readFileSync(path.join(root, '.workflows', wf, 'nodes', `${name}.md`), 'utf-8')

describe('GUI 语义组（launch.cjs node IPC 契约复刻）', () => {
  it('listNodeFiles：目录不存在返回空，且创建 .nodes 目录（getNodesDir 副作用）', () => {
    expect(listNodeFiles(root)).toEqual({ success: true, files: [] })
    expect(fs.existsSync(nd())).toBe(true)
  })

  it('saveNodeFile 哑写：content 原样落盘、同名覆写', () => {
    expect(saveNodeFile(root, 'n1', '---\nname: n1\ntype: business\n---\n节点正文')).toEqual({ success: true })
    expect(nodeMd('n1')).toBe('---\nname: n1\ntype: business\n---\n节点正文')
    expect(saveNodeFile(root, 'n1', '覆盖原文')).toEqual({ success: true })
    expect(nodeMd('n1')).toBe('覆盖原文')
  })

  it('readNodeFile ghost 返回 content:null；存在返回原文与 mtime', () => {
    expect(readNodeFile(root, 'ghost')).toEqual({ success: true, content: null, mtime: null })
    saveNodeFile(root, 'a', 'raw')
    const res = readNodeFile(root, 'a')
    expect(res.success).toBe(true)
    expect(res.content).toBe('raw')
    expect(typeof res.mtime).toBe('string')
  })

  it('deleteNodeFile ghost 静默成功', () => {
    expect(deleteNodeFile(root, 'ghost')).toEqual({ success: true })
  })

  it('listNodeFiles：带 .md 后缀、readdirSync 原始顺序、排除非 .md', () => {
    saveNodeFile(root, 'zeta', 'z')
    saveNodeFile(root, 'alpha', 'a')
    fs.writeFileSync(nd('notes.txt'), 'not md')
    expect(listNodeFiles(root)).toEqual({ success: true, files: ['alpha.md', 'zeta.md'] })
  })

  it('局部节点 save：ensureDir 两级（.workflows/{wf}/nodes）', () => {
    expect(saveLocalNode(root, 'wf1', 'node-a', '---\nname: node-a\n---\n局部节点正文')).toEqual({ success: true })
    expect(localMd('wf1', 'node-a')).toBe('---\nname: node-a\n---\n局部节点正文')
  })

  it('局部节点读副作用：ghost 只建 .workflows 根，不建 {wf}/nodes', () => {
    expect(readLocalNode(root, 'wf1', 'node-a')).toEqual({ success: true, content: null, mtime: null })
    expect(fs.existsSync(path.join(root, '.workflows'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.workflows', 'wf1'))).toBe(false)
  })

  it('局部节点 load/list/delete：ghost null-成功 / files:[] / 静默', () => {
    saveLocalNode(root, 'wf1', 'node-a', 'a')
    saveLocalNode(root, 'wf1', 'node-b', 'b')
    const res = readLocalNode(root, 'wf1', 'node-a')
    expect(res.content).toBe('a')
    expect(typeof res.mtime).toBe('string')
    expect(listLocalNodes(root, 'wf1')).toEqual({ success: true, files: ['node-a.md', 'node-b.md'] })
    expect(listLocalNodes(root, 'ghost-wf')).toEqual({ success: true, files: [] })
    expect(deleteLocalNode(root, 'wf1', 'ghost')).toEqual({ success: true })
    expect(deleteLocalNode(root, 'wf1', 'node-b')).toEqual({ success: true })
    expect(fs.existsSync(path.join(root, '.workflows', 'wf1', 'nodes', 'node-b.md'))).toBe(false)
  })

  it('全局与局部互不干扰', () => {
    saveNodeFile(root, 'global-node', 'g')
    saveLocalNode(root, 'wf1', 'local-node', 'l')
    expect(listNodeFiles(root)).toEqual({ success: true, files: ['global-node.md'] })
    expect(listLocalNodes(root, 'wf1')).toEqual({ success: true, files: ['local-node.md'] })
  })
})

describe('CLI 语义组（core/node.ts 行为零变更）', () => {
  it('listNodes 目录不存在返回空，且不创建目录（与 GUI 组副作用区分）', () => {
    expect(listNodes(root)).toEqual([])
    expect(fs.existsSync(nd())).toBe(false)
  })

  it('createNode：frontmatter name/type(默认 business)/description + 尾换行', () => {
    createNode(root, 'n1', '节点正文', { type: 'processor', description: '节点描述' })
    expect(nodeMd('n1')).toBe(`---
name: n1
type: processor
description: 节点描述
---

节点正文
`)
    createNode(root, 'n2', '默认类型正文')
    expect(nodeMd('n2')).toBe(`---
name: n2
type: business
---

默认类型正文
`)
  })

  it('createNode create-only：重名抛错', () => {
    createNode(root, 'n1', 'x')
    expect(() => createNode(root, 'n1', 'y')).toThrow(/节点已存在: n1/)
  })

  it('readNode 返回原文；ghost 抛 ENOENT 原文', () => {
    createNode(root, 'n1', '正文', { type: 't' })
    expect(readNode(root, 'n1')).toMatch(/^---\nname: n1\ntype: t\n/)
    expect(() => readNode(root, 'ghost')).toThrow(/ENOENT.*\.nodes\/ghost\.md/)
  })

  it('updateNode 增量更新：未提供字段与未知字段保留，type/description 显式覆盖', () => {
    saveNodeFile(root, 'legacy', '---\nname: legacy\ntype: old\nextra: 保留字段\n---\n旧正文')
    updateNode(root, 'legacy', '新正文', { type: 'new' })
    expect(nodeMd('legacy')).toBe(`---
name: legacy
type: new
extra: 保留字段
---

新正文
`)
  })

  it('updateNode ghost 抛错', () => {
    expect(() => updateNode(root, 'ghost', 'x')).toThrow(/节点不存在: ghost/)
  })

  it('delNode ghost 静默成功且不创建目录', () => {
    expect(() => delNode(root, 'ghost')).not.toThrow()
    expect(fs.existsSync(nd())).toBe(false)
  })

  it('listNodes 剥 .md 后缀并排序', () => {
    createNode(root, 'zeta', 'z')
    createNode(root, 'alpha', 'a')
    expect(listNodes(root)).toEqual(['alpha', 'zeta'])
  })
})
