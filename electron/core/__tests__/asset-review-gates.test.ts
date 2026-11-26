import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as skill from '../skill'
import * as agent from '../agent'
import * as node from '../node'
import * as resource from '../resource'
import * as knowledge from '../knowledge'
import * as workflow from '../workflow'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('../review.cjs')

// 口径（2026-11-27）：
//   1) CLI 读取仅有草稿（未过审）的资产时提示「不存在」，不抛原始 ENOENT、不暴露磁盘路径
//   2) 工作流通过审核后用 CLI 再编辑，保存时草稿必须进入审核队列；读取类命令（list-nodes / list-edges / doctor）只反映正式位置
//   3) 工作流引用的节点必须是已通过审核的节点
describe('资产读取门控与工作流草稿入队', () => {
  let tmpDir: string
  const w = (rel: string, text: string) => { const p = path.join(tmpDir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf-8') }
  const read = (rel: string) => fs.readFileSync(path.join(tmpDir, rel), 'utf-8')
  const wfQueueItem = () => review.listQueue(tmpDir).items.find((i: any) => i.type === 'workflow' && i.name === 'wf')
  const expectNoPathLeak = (fn: () => unknown, message: string) => {
    expect(fn).toThrow(message)
    try { fn() } catch (e: any) {
      expect(e.message).not.toContain(tmpDir)
      expect(e.message).not.toContain('ENOENT')
    }
  }

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-gates-')) })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  describe('CLI read：仅有草稿（未过审）的资产提示不存在', () => {
    const cases: Array<[string, () => string, string, string, string]> = [
      ['skill', () => skill.read(tmpDir, 'x'), 'skills', 'SKILL.md', '技能不存在'],
      ['agent', () => agent.read(tmpDir, 'x'), 'agents', 'x.md', '智能体不存在'],
      ['node', () => node.read(tmpDir, 'x'), 'nodes', 'x.md', '节点不存在'],
      ['resource', () => resource.read(tmpDir, 'x'), 'resources', 'x.md', '资源不存在'],
    ]
    for (const [type, fn, dir, mainFile, message] of cases) {
      it(`${type}：从未创建 → ${message}`, () => { expectNoPathLeak(fn, message) })
      it(`${type}：仅有草稿快照 → ${message}`, () => {
        w(`.ocean/reviewQueue/${dir}/x/20261127010000001/${mainFile}`, '---\nname: x\nreviewStatus: pending\n---\n草稿\n')
        expectNoPathLeak(fn, message)
      })
    }
    it('knowledge：仅有草稿 → 知识不存在', () => {
      w('.ocean/reviewQueue/knowledges/k/20261127010000001/k.md', '---\nname: k\nreviewStatus: pending\n---\n草稿\n')
      expectNoPathLeak(() => knowledge.read(tmpDir, 'k'), '知识不存在')
    })
    it('skill：通过审核后可正常读取', () => {
      skill.create(tmpDir, 'ok', '# ok-v1', '描述')
      review.gitInit(tmpDir)
      expect(review.approveAsset(tmpDir, 'skill', 'ok').success).toBe(true)
      expect(skill.read(tmpDir, 'ok')).toContain('ok-v1')
    })
  })

  describe('workflow：CLI 再编辑的草稿必须进入审核队列', () => {
    it('通过后再 add-node：快照主文件为 pending 并进入审核队列；通过后 version=2', () => {
      review.gitInit(tmpDir)
      workflow.create(tmpDir, 'wf')
      let a = review.approveAsset(tmpDir, 'workflow', 'wf')
      expect(a.success).toBe(true)
      expect(a.version).toBe(1)
      expect(read('.ocean/workflows/wf/WORKFLOW.md')).toMatch(/^reviewStatus:\s*validated$/m)

      workflow.addNode(tmpDir, 'wf', 'process', '处理一', { content: 'c1' })
      const snaps = fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/workflows/wf'))
      expect(snaps).toHaveLength(1)
      const draftMd = read(`.ocean/reviewQueue/workflows/wf/${snaps[0]}/WORKFLOW.md`)
      expect(draftMd).toMatch(/^reviewStatus:\s*pending$/m)
      expect(draftMd).not.toMatch(/^version:/m)
      expect(draftMd).toMatch(/^baseCommit: [0-9a-f]{40}$/m)
      const item = wfQueueItem()
      expect(item && item.pendingCount).toBe(1)
      expect(item.baseVersion).toBe(1)

      a = review.approveAsset(tmpDir, 'workflow', 'wf')
      expect(a.success).toBe(true)
      expect(a.version).toBe(2)
      expect(read('.ocean/workflows/wf/WORKFLOW.md')).toMatch(/^version:\s*2$/m)
      expect(wfQueueItem()).toBeUndefined()
    })

    it('读取类命令只反映正式位置：草稿里的新节点在通过前不出现在 list-nodes / read-flow', () => {
      review.gitInit(tmpDir)
      workflow.create(tmpDir, 'wf')
      review.approveAsset(tmpDir, 'workflow', 'wf')
      workflow.addNode(tmpDir, 'wf', 'process', '处理一', { content: 'c1' })
      expect(workflow.listNodes(tmpDir, 'wf')).not.toContain('处理一')
      expect(workflow.readFlow(tmpDir, 'wf')).not.toContain('处理一')
      review.approveAsset(tmpDir, 'workflow', 'wf')
      expect(workflow.listNodes(tmpDir, 'wf')).toContain('处理一')
      expect(workflow.readFlow(tmpDir, 'wf')).toContain('处理一')
    })

    it('局部节点写入同样让草稿进入审核队列', () => {
      review.gitInit(tmpDir)
      workflow.create(tmpDir, 'wf')
      review.approveAsset(tmpDir, 'workflow', 'wf')
      workflow.createLocalNode(tmpDir, 'wf', 'ln', '局部内容')
      expect(wfQueueItem() && wfQueueItem().pendingCount).toBe(1)
    })

    it('命令校验失败时不留下进入审核队列的空改动草稿', () => {
      review.gitInit(tmpDir)
      workflow.create(tmpDir, 'wf')
      review.approveAsset(tmpDir, 'workflow', 'wf')
      expect(() => workflow.addNode(tmpDir, 'wf', 'decision', '判断', {})).toThrow(/condition/)
      expect(wfQueueItem()).toBeUndefined()
      expect(read('.ocean/workflows/wf/meta-data/flow.json')).not.toContain('判断')
    })
  })

  describe('workflow 引用节点：必须是已通过审核的节点', () => {
    it('引用仅有草稿的节点 → 拒绝；引用不存在 → 拒绝；引用已过审节点 → 成功', () => {
      review.gitInit(tmpDir)
      workflow.create(tmpDir, 'wf')
      review.approveAsset(tmpDir, 'workflow', 'wf')
      node.create(tmpDir, 'ref-node', '内容', { type: 'business', description: '描述' })
      expect(() => workflow.addNode(tmpDir, 'wf', 'business', '引用草稿', { nodeRefPath: '.ocean/nodes/ref-node.md' })).toThrow(/尚未通过审核/)
      expect(() => workflow.addNode(tmpDir, 'wf', 'business', '引用不存在', { nodeRefPath: '.ocean/nodes/ghost.md' })).toThrow(/不存在或尚未通过审核/)
      // 拒绝发生在建快照之前：不留下进入审核队列的草稿
      expect(wfQueueItem()).toBeUndefined()

      expect(review.approveAsset(tmpDir, 'node', 'ref-node').success).toBe(true)
      const id = workflow.addNode(tmpDir, 'wf', 'business', '引用已过审', { nodeRefPath: '.ocean/nodes/ref-node.md' })
      expect(typeof id).toBe('string')
      expect(wfQueueItem() && wfQueueItem().pendingCount).toBe(1)
      review.approveAsset(tmpDir, 'workflow', 'wf')
      expect(workflow.listNodes(tmpDir, 'wf')).toContain('.ocean/nodes/ref-node.md')
    })
  })
})
