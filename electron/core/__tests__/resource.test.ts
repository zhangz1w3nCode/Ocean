import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  saveResourceFile,
  readResourceFile,
  deleteResourceFile,
  listResourceFiles,
} from '../../core/common'
import {
  listResources,
  readResource,
  createResource,
  updateResource,
  delResource,
} from '../../source/cli/resource'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-resource-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const read = (name: string): string =>
  fs.readFileSync(path.join(root, '.resources', `${name}.md`), 'utf-8')

describe('GUI 语义组（launch.cjs resource IPC 契约复刻）', () => {
  it('listResourceFiles：目录不存在返回空数组，且创建 .resources 目录（getResourcesDir 副作用）', () => {
    expect(listResourceFiles(root)).toEqual({ success: true, files: [] })
    expect(fs.existsSync(path.join(root, '.resources'))).toBe(true)
  })

  it('saveResourceFile 是无条件覆写（upsert），content 原样写盘', () => {
    saveResourceFile(root, 'r1', '---\nid: a\n---\nbody1')
    expect(saveResourceFile(root, 'r1', '---\nid: b\n---\nbody2')).toEqual({ success: true })
    expect(readResourceFile(root, 'r1').content).toBe('---\nid: b\n---\nbody2')
  })

  it('readResourceFile 文件不存在返回 content:null 而非失败', () => {
    const res = readResourceFile(root, 'ghost')
    expect(res.success).toBe(true)
    expect(res.content).toBeNull()
    expect(res.mtime).toBeNull()
  })

  it('readResourceFile 存在返回原文与 mtime', () => {
    saveResourceFile(root, 'r1', '# 正文')
    const res = readResourceFile(root, 'r1')
    expect(res.success).toBe(true)
    expect(res.content).toBe('# 正文')
    expect(typeof res.mtime).toBe('string')
  })

  it('listResourceFiles 返回完整 .md 文件名（不剥后缀、不排序，按 readdirSync 原始顺序）', () => {
    saveResourceFile(root, 'zeta', 'a')
    saveResourceFile(root, 'alpha', 'b')
    const res = listResourceFiles(root)
    expect(res).toEqual({ success: true, files: ['alpha.md', 'zeta.md'] })
  })

  it('deleteResourceFile 文件不存在静默成功', () => {
    expect(deleteResourceFile(root, 'ghost')).toEqual({ success: true })
  })
})

describe('CLI 语义组（core/resource.ts 行为零变更）', () => {
  it('listResources 目录不存在返回空，且不创建目录（与 GUI 组副作用区分）', () => {
    expect(listResources(root)).toEqual([])
    expect(fs.existsSync(path.join(root, '.resources'))).toBe(false)
  })

  it('createResource 落盘格式：id 自动生成、type 默认 rule、空行加尾换行', () => {
    createResource(root, '命名规范', '正文', { description: '描述' })
    expect(read('命名规范')).toMatch(/^---\nid: 命名规范-\d+\ntype: rule\ndescription: 描述\n---\n\n正文\n$/)
  })

  it('createResource 无 description 时不写 description 行', () => {
    createResource(root, '裸资源', '内容')
    expect(read('裸资源')).toMatch(/^---\nid: 裸资源-\d+\ntype: rule\n---\n\n内容\n$/)
  })

  it('createResource create-only：重名抛错（exit 1 语义）', () => {
    createResource(root, 'r1', 'a')
    expect(() => createResource(root, 'r1', 'b')).toThrow(/资源已存在: r1/)
  })

  it('readResource 返回原文（含 frontmatter）；ghost 抛 ENOENT 原文', () => {
    createResource(root, 'r1', '正文')
    expect(readResource(root, 'r1')).toMatch(/^---\nid: r1-\d+/)
    expect(() => readResource(root, 'ghost')).toThrow(/ENOENT.*\.resources\/ghost\.md/)
  })

  it('updateResource 增量更新：未知字段与字段顺序保留，仅覆盖提供的字段', () => {
    fs.mkdirSync(path.join(root, '.resources'), { recursive: true })
    fs.writeFileSync(path.join(root, '.resources', '旧.md'), '---\nid: x\ntype: rule\ndescription: 旧\ntags: 自定义\n---\n旧正文\n')
    updateResource(root, '旧', '新正文')
    expect(read('旧')).toBe(`---
id: x
type: rule
description: 旧
tags: 自定义
---

新正文
`)
  })

  it('updateResource ghost 抛错', () => {
    expect(() => updateResource(root, 'ghost', 'x')).toThrow(/资源不存在: ghost/)
  })

  it('delResource ghost 静默成功且不创建目录', () => {
    expect(() => delResource(root, 'ghost')).not.toThrow()
    expect(fs.existsSync(path.join(root, '.resources'))).toBe(false)
  })

  it('listResources 剥后缀并排序', () => {
    createResource(root, 'zeta', 'a')
    createResource(root, 'alpha', 'b')
    expect(listResources(root)).toEqual(['alpha', 'zeta'])
  })
})
