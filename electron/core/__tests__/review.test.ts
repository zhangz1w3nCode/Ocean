import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
// 与主进程 IPC / CLI 共用的审核实现（CJS）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('../review.cjs')

function mkdir(p: string) { fs.mkdirSync(p, { recursive: true }) }
function write(rel: string, content: string, root = tmpDir) {
  const p = path.join(root, rel)
  mkdir(path.dirname(p))
  fs.writeFileSync(p, content, 'utf-8')
}
let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-review-'))
})
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

const skillMd = (name: string, status: string, body = '内容', version = 1) =>
  `---\nname: ${name}\ndescription: 测试\nreviewStatus: ${status}\nversion: ${version}\n---\n${body}\n`

describe('resolveRef（类型+名称寻址，不暴露路径）', () => {
  it('各类型解析到正确相对路径', () => {
    expect(review.resolveRef(tmpDir, 'skill', 's1').refPath).toBe('skills/s1/SKILL.md')
    expect(review.resolveRef(tmpDir, 'agent', 'a1').refPath).toBe('agents/a1.md')
    expect(review.resolveRef(tmpDir, 'node', 'n1').refPath).toBe('nodes/n1.md')
    expect(review.resolveRef(tmpDir, 'workflow', 'wf').refPath).toBe('workflows/wf/WORKFLOW.md')
    expect(review.resolveRef(tmpDir, 'task', 't1').refPath).toBe('tasks/t1/TASK.md')
    expect(review.resolveRef(tmpDir, 'codebase', 'c1').refPath).toBe('codebases/c1/README.md')
    expect(review.resolveRef(tmpDir, 'knowledge', 'ocean/功能设计').refPath).toBe('knowledges/ocean/功能设计.md')
  })
  it('拒绝未知类型与穿越名称', () => {
    expect(review.resolveRef(tmpDir, 'nope', 'x').error).toBeTruthy()
    expect(review.resolveRef(tmpDir, 'node', '../etc').error).toBeTruthy()
  })
})

describe('listReviewAssets', () => {
  it('列出 pending 与 rejected，排除 validated；含 version 与理由', () => {
    write('.ocean/skills/s-p/SKILL.md', skillMd('s-p', 'pending', '', 3))
    write('.ocean/skills/s-v/SKILL.md', skillMd('s-v', 'validated'))
    write('.ocean/agents/a-r.md', `---\nname: a-r\ndescription: d\nreviewStatus: rejected\nrejectReason: 不合规\nversion: 1\n---\nx`)
    const all = review.listReviewAssets(tmpDir).items
    expect(all.map((i: any) => `${i.type}:${i.name}`).sort()).toEqual(['agent:a-r', 'skill:s-p'])
    const pend = review.listReviewAssets(tmpDir, 'pending').items
    expect(pend).toHaveLength(1)
    expect(pend[0].version).toBe(3)
    const rej = review.listReviewAssets(tmpDir, 'rejected').items
    expect(rej[0].rejectReason).toBe('不合规')
  })
  it('knowledge 兼容旧 status 字段', () => {
    write('.ocean/knowledges/k.md', `---\nname: k\nstatus: validated\n---\nx`)
    expect(review.listReviewAssets(tmpDir).items).toHaveLength(0)
  })
})

describe('diffAgainstHead（基线 = .ocean git HEAD）', () => {
  it('未托管 → 无基线输出全文', () => {
    write('.ocean/nodes/n.md', `---\nname: n\nreviewStatus: pending\nversion: 1\n---\n正文`)
    const r = review.diffAgainstHead(tmpDir, 'node', 'n')
    expect(r.success).toBe(true)
    expect(r.hasBaseline).toBe(false)
    expect(r.content).toContain('正文')
    expect(r.note).toContain('未开启 git 托管')
  })
  it('托管后：HEAD 基线 vs 工作区的正文 diff（剥离 frontmatter）', () => {
    write('.ocean/nodes/n.md', `---\nname: n\nreviewStatus: validated\nversion: 1\n---\n旧正文\n第二行`)
    review.gitInit(tmpDir)
    write('.ocean/nodes/n.md', `---\nname: n\nreviewStatus: pending\nversion: 1\n---\n新正文\n第二行`)
    const r = review.diffAgainstHead(tmpDir, 'node', 'n')
    expect(r.hasBaseline).toBe(true)
    expect(r.changed).toBe(true)
    expect(r.diff).toContain('- 旧正文')
    expect(r.diff).toContain('+ 新正文')
    expect(r.diff).not.toContain('reviewStatus') // frontmatter 不参与 diff
  })
})

describe('approveAsset（version+1 / 提交 / skill 自动物化 / 状态约束）', () => {
  it('skill 审核通过：version 自增、提交、自动物化到 .pi', () => {
    write('.ocean/asset-root.json', JSON.stringify({ assetRoot: 'pi' }))
    write('.ocean/skills/s1/SKILL.md', skillMd('s1', 'pending'))
    write('.ocean/skills/s1/scripts/x.sh', 'echo 1')
    review.gitInit(tmpDir)
    const r = review.approveAsset(tmpDir, 'skill', 's1')
    expect(r.success).toBe(true)
    expect(r.version).toBe(2)
    expect(r.commit.success).toBe(true)
    expect(r.sync.success).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, '.pi/skills/s1/SKILL.md'), 'utf-8')).toMatch(/reviewStatus:\s*validated/)
    expect(fs.readFileSync(path.join(tmpDir, '.pi/skills/s1/SKILL.md'), 'utf-8')).toMatch(/version:\s*2/)
    expect(fs.existsSync(path.join(tmpDir, '.pi/skills/s1/scripts/x.sh'))).toBe(true)
  })
  it('非 skill/agent 通过：无物化', () => {
    write('.ocean/nodes/n.md', `---\nname: n\nreviewStatus: pending\nversion: 1\n---\nx`)
    const r = review.approveAsset(tmpDir, 'node', 'n')
    expect(r.success).toBe(true)
    expect(r.sync).toBeNull()
    expect(r.version).toBe(2)
  })
  it('已驳回资产不可直接通过', () => {
    write('.ocean/nodes/n.md', `---\nname: n\nreviewStatus: rejected\nrejectReason: r\nversion: 1\n---\nx`)
    const r = review.approveAsset(tmpDir, 'node', 'n')
    expect(r.success).toBe(false)
    expect(r.error).toContain('已驳回')
  })
})

describe('reject / restore', () => {
  it('reject 必填理由并落盘；restore 回 pending 并清理由', () => {
    write('.ocean/nodes/n.md', `---\nname: n\nreviewStatus: pending\nversion: 1\n---\nx`)
    const ref = review.resolveRef(tmpDir, 'node', 'n').refPath
    expect(review.setReviewStatus(tmpDir, ref, 'rejected', false, '').success).toBe(false)
    expect(review.setReviewStatus(tmpDir, ref, 'rejected', false, '内容不完整').success).toBe(true)
    let t = fs.readFileSync(path.join(tmpDir, '.ocean', ref), 'utf-8')
    expect(t).toMatch(/rejectReason: 内容不完整/)
    expect(review.setReviewStatus(tmpDir, ref, 'pending', false).success).toBe(true)
    t = fs.readFileSync(path.join(tmpDir, '.ocean', ref), 'utf-8')
    expect(t).toMatch(/reviewStatus: pending/)
    expect(t).not.toContain('rejectReason')
    expect(t).toMatch(/version: 1/) // reject/restore 不动 version
  })
})

describe('syncApprovedAssets（全量幂等 / 单项不做删除对齐）', () => {
  beforeEach(() => write('.ocean/asset-root.json', JSON.stringify({ assetRoot: 'pi' })))
  it('全量：validated 物化、pending 跳过、孤儿移入回收站；二跑幂等', () => {
    write('.ocean/skills/ok/SKILL.md', skillMd('ok', 'validated'))
    write('.ocean/skills/no/SKILL.md', skillMd('no', 'pending'))
    write('.ocean/agents/a.md', `---\nname: a\nreviewStatus: validated\nversion: 1\n---\nx`)
    write('.pi/skills/orphan/SKILL.md', skillMd('orphan', 'validated'))
    const r1 = review.syncApprovedAssets(tmpDir)
    expect(r1.report.added.sort()).toEqual(['agents/a.md', 'skills/ok'])
    expect(r1.report.skippedPending).toEqual(['skills/no'])
    expect(r1.report.removed).toEqual(['skills/orphan'])
    expect(fs.existsSync(path.join(tmpDir, '.pi/skills/orphan'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.ocean/.trashbox/sync'))).toBe(true)
    const r2 = review.syncApprovedAssets(tmpDir)
    expect(r2.report.added).toHaveLength(0)
    expect(r2.report.removed).toHaveLength(0)
  })
  it('单项：只物化指定资产，不触碰运行时目录其他项', () => {
    write('.ocean/skills/ok/SKILL.md', skillMd('ok', 'validated'))
    write('.pi/skills/orphan/SKILL.md', skillMd('orphan', 'validated'))
    const r = review.syncApprovedAssets(tmpDir, { type: 'skill', name: 'ok' })
    expect(r.success).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.pi/skills/ok/SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.pi/skills/orphan'))).toBe(true)
  })
  it('单项 pending 资产拒绝物化；非 skill/agent 类型无物化目标', () => {
    write('.ocean/skills/no/SKILL.md', skillMd('no', 'pending'))
    expect(review.syncApprovedAssets(tmpDir, { type: 'skill', name: 'no' }).success).toBe(false)
    expect(review.syncApprovedAssets(tmpDir, { type: 'node', name: 'x' }).success).toBe(false)
  })
})
