import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  PACKAGE_FORMAT,
  WorkflowPackageError,
  buildPackage,
  importPackage,
  inspectPackage,
} from '../workflow-package'

const workflow = '审批流'

function flowJson(withMissingNode = false): string {
  return JSON.stringify({
    name: workflow,
    nodes: [
      { id: 'start-1', type: 'start', data: { label: '开始' } },
      {
        id: 'b1',
        type: 'business',
        data: { label: '节点甲', nodeDefName: '节点甲', nodeRefPath: '.nodes/节点甲.md' },
      },
      {
        id: 'b2',
        type: 'business',
        data: { label: missingNodeLabel(withMissingNode), nodeRefPath: withMissingNode ? '.nodes/不存在.md' : '.nodes/节点乙.md' },
      },
      { id: 'p1', type: 'process', data: { label: '处理', content: '内联内容' } },
      { id: 'end-1', type: 'end', data: { label: '结束' } },
    ],
    edges: [
      { source: 'start-1', target: 'b1' },
      { source: 'b1', target: 'b2' },
      { source: 'b2', target: 'p1' },
      { source: 'p1', target: 'end-1' },
    ],
  })
}

function missingNodeLabel(missing: boolean): string {
  return missing ? '节点缺失' : '节点乙'
}

describe('workflow-package', () => {
  let root: string
  let wfDir: string

  const write = (rel: string, content: string) => {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content, 'utf-8')
  }

  const seedProject = (withMissingNode = false) => {
    write(`.workflows/${workflow}/meta-data/flow.json`, flowJson(withMissingNode))
    write(`.workflows/${workflow}/WORKFLOW.md`, '# 审批流设计')
    write('.nodes/节点甲.md', '---\nname: 节点甲\n---\n甲的内容')
    if (!withMissingNode) write('.nodes/节点乙.md', '乙的内容')
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-pkg-'))
    wfDir = path.join(root, '.workflows', workflow)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('导出的包包含 flow.json / WORKFLOW.md / 被引用的全局节点与 manifest', () => {
    seedProject()
    const { buffer, manifest, warnings } = buildPackage(root, workflow, { appVersion: '9.9.9' })

    const entries = Object.keys(unzipSync(buffer)).sort()
    expect(entries).toEqual([
      'manifest.json',
      'nodes/节点乙.md',
      'nodes/节点甲.md',
      'workflow/WORKFLOW.md',
      'workflow/meta-data/flow.json',
    ].sort())
    expect(manifest.format).toBe(PACKAGE_FORMAT)
    expect(manifest.workflowName).toBe(workflow)
    expect(manifest.appVersion).toBe('9.9.9')
    expect(manifest.counts).toEqual({ globalNodes: 2, localNodes: 0 })
    expect(warnings).toEqual([])

    const packedFlow = JSON.parse(strFromU8(unzipSync(buffer)['workflow/meta-data/flow.json']))
    expect(packedFlow.name).toBe(workflow)
    expect(packedFlow.nodes).toHaveLength(5)
  })

  it('引用的全局节点文件缺失时导出并给出警告，不中断', () => {
    seedProject(true)
    const { buffer, manifest, warnings } = buildPackage(root, workflow)
    expect(Object.keys(unzipSync(buffer))).not.toContain('nodes/不存在.md')
    expect(manifest.counts.globalNodes).toBe(1)
    expect(warnings.join('\n')).toContain('.nodes/不存在.md')
  })

  it('局部节点随包导出，放在 workflow/nodes 下', () => {
    seedProject()
    write(`.workflows/${workflow}/nodes/局部一.md`, '局部内容')
    const { buffer, manifest } = buildPackage(root, workflow)
    const entries = unzipSync(buffer)
    expect(Object.keys(entries)).toContain('workflow/nodes/局部一.md')
    expect(manifest.counts.localNodes).toBe(1)
  })

  it('导入到空项目：文件全部落位，flow.json 的 name 以 manifest 为准', () => {
    seedProject()
    const { buffer } = buildPackage(root, workflow)

    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-pkg-target-'))
    try {
      const result = importPackage(target, buffer)
      expect(result.workflowName).toBe(workflow)
      expect(result.overwrittenWorkflow).toBe(false)
      expect(result.overwrittenNodes).toEqual([])

      const targetFlow = JSON.parse(
        fs.readFileSync(path.join(target, '.workflows', workflow, 'meta-data', 'flow.json'), 'utf-8'),
      )
      expect(targetFlow.name).toBe(workflow)
      expect(fs.readFileSync(path.join(target, '.nodes', '节点甲.md'), 'utf-8')).toContain('甲的内容')
      expect(fs.existsSync(path.join(target, '.workflows', workflow, 'WORKFLOW.md'))).toBe(true)
      expect(result.writtenFiles).toContain(`.workflows/${workflow}/meta-data/flow.json`)
      expect(result.writtenFiles).toContain('.nodes/节点乙.md')
    } finally {
      fs.rmSync(target, { recursive: true, force: true })
    }
  })

  it('覆盖写入：同名工作流与同名全局节点都被覆盖，并在结果中报告', () => {
    seedProject()
    const { buffer } = buildPackage(root, workflow)

    // 目标环境下预先存在同名工作流与同名全局节点（内容不同）
    write(`.workflows/${workflow}/meta-data/flow.json`, '{"name":"旧版本","nodes":[]}')
    write('.nodes/节点甲.md', '旧内容')

    const inspection = inspectPackage(root, buffer)
    expect(inspection.workflowExists).toBe(true)
    expect(inspection.conflictingNodes).toEqual(['节点甲.md', '节点乙.md'].sort())

    const result = importPackage(root, buffer)
    expect(result.overwrittenWorkflow).toBe(true)
    expect(result.overwrittenNodes).toEqual(['节点甲.md', '节点乙.md'].sort())
    expect(fs.readFileSync(path.join(root, '.nodes', '节点甲.md'), 'utf-8')).toContain('甲的内容')
    const flow = JSON.parse(fs.readFileSync(path.join(wfDir, 'meta-data', 'flow.json'), 'utf-8'))
    expect(flow.nodes).toHaveLength(5)
  })

  it('拒绝含上级目录的条目（zip-slip）', () => {
    const malicious = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({ format: PACKAGE_FORMAT, version: 1, workflowName: 'x', nodes: [], counts: {} }),
      ),
      'workflow/meta-data/flow.json': strToU8('{"nodes":[]}'),
      '../escape.md': strToU8('bad'),
    })
    expect(() => inspectPackage(root, malicious)).toThrow(WorkflowPackageError)
    expect(fs.existsSync(path.join(root, '..', 'escape.md'))).toBe(false)
  })

  it('拒绝未预期目录的条目', () => {
    const bad = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({ format: PACKAGE_FORMAT, version: 1, workflowName: 'x', nodes: [], counts: {} }),
      ),
      'workflow/meta-data/flow.json': strToU8('{"nodes":[]}'),
      'hack/x.md': strToU8('bad'),
    })
    expect(() => inspectPackage(root, bad)).toThrow(/未预期的条目/)
  })

  it('拒绝缺少 manifest 或格式不符的包', () => {
    expect(() => inspectPackage(root, zipSync({ 'workflow/meta-data/flow.json': strToU8('{}') }))).toThrow(
      /缺少 manifest/,
    )
    const wrongFormat = zipSync({
      'manifest.json': strToU8(JSON.stringify({ format: 'other', version: 1, workflowName: 'x' })),
      'workflow/meta-data/flow.json': strToU8('{"nodes":[]}'),
    })
    expect(() => inspectPackage(root, wrongFormat)).toThrow(/格式标识不匹配/)
  })

  it('拒绝版本高于当前支持的包', () => {
    const future = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({ format: PACKAGE_FORMAT, version: 99, workflowName: 'x', nodes: [] }),
      ),
      'workflow/meta-data/flow.json': strToU8('{"nodes":[]}'),
    })
    expect(() => inspectPackage(root, future)).toThrow(/版本 99 高于当前支持的版本/)
  })

  it('拒绝非法工作流名（含路径分隔符或 ..）', () => {
    seedProject()
    expect(() => buildPackage(root, '../escape')).toThrow(WorkflowPackageError)
    expect(() => buildPackage(root, 'a/b')).toThrow(WorkflowPackageError)
    expect(() => buildPackage(root, '  ')).toThrow(WorkflowPackageError)
  })

  it('工作流未保存 design 文件时导出直接报错', () => {
    expect(() => buildPackage(root, '不存在的流')).toThrow(/工作流不存在或未保存设计文件/)
  })
})