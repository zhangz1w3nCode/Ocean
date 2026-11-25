import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
// 与主进程 IPC / CLI 共用的审核实现（CJS，暂存队列模型）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('../review.cjs')

let tmpDir: string

function mkdir(p: string) { fs.mkdirSync(p, { recursive: true }) }
function write(rel: string, content: string, root = tmpDir) {
  const p = path.join(root, rel)
  mkdir(path.dirname(p))
  fs.writeFileSync(p, content, 'utf-8')
}
function read(rel: string, root = tmpDir) {
  return fs.readFileSync(path.join(root, rel), 'utf-8')
}
function exists(rel: string, root = tmpDir) {
  return fs.existsSync(path.join(root, rel))
}
// 创建一个快照并写入主文件（frontmatter 默认 pending）
function snapshot(root: string, type: string, name: string, body = '正文', fmExtra = ''): string {
  const r = review.newSnapshotDir(root, type, name)
  if (r.error) throw new Error(r.error)
  const main = `---\nname: ${name.split('/').pop()}\ndescription: 测试\nreviewStatus: pending\n${fmExtra}---\n${body}\n`
  fs.writeFileSync(path.join(r.dir, review.snapshotMainRel(type, name)), main, 'utf-8')
  return r.ts
}
const formalNode = (name: string, body: string, version = 1) =>
  `---\nname: ${name}\ndescription: d\nreviewStatus: validated\nversion: ${version}\n---\n${body}\n`

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-review-'))
})
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

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

describe('queueDir / snapshotMainRel', () => {
  it('queueDir 创建并返回绝对路径', () => {
    const d = review.queueDir(tmpDir)
    expect(path.isAbsolute(d)).toBe(true)
    expect(exists('.ocean/reviewQueue')).toBe(true)
    expect(review.queueDir(tmpDir)).toBe(d)
  })
  it('快照主文件相对路径：目录型取主文件名，单文件型取 basename', () => {
    expect(review.snapshotMainRel('skill', 's1')).toBe('SKILL.md')
    expect(review.snapshotMainRel('workflow', 'wf')).toBe('WORKFLOW.md')
    expect(review.snapshotMainRel('task', 't1')).toBe('TASK.md')
    expect(review.snapshotMainRel('codebase', 'c1')).toBe('README.md')
    expect(review.snapshotMainRel('agent', 'a1')).toBe('a1.md')
    expect(review.snapshotMainRel('node', 'n1')).toBe('n1.md')
    expect(review.snapshotMainRel('knowledge', 'ocean/功能设计')).toBe('功能设计.md')
  })
})

describe('newSnapshotDir（G1/G2/G3）', () => {
  it('时间戳唯一且字典序递增；同毫秒冲突追加零填充序号（假时钟确定性验证）', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5, 678))
      const s1 = review.newSnapshotDir(tmpDir, 'node', 'n1')
      const s2 = review.newSnapshotDir(tmpDir, 'node', 'n1') // 同毫秒 → 后缀 -0001
      expect(s1.error).toBeUndefined()
      expect(s2.dir).not.toBe(s1.dir)
      expect(s2.ts).toBe(`${s1.ts}-0001`)
      expect(s2.ts > s1.ts).toBe(true) // 字典序即时间序：后缀排在原毫秒之后
      expect(s2.ts < String(BigInt(s1.ts) + 1n)).toBe(true) // 且早于下一毫秒
      vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5, 679)) // 下一毫秒 → 无后缀
      const s3 = review.newSnapshotDir(tmpDir, 'node', 'n1')
      expect(s3.ts).toBe(String(BigInt(s1.ts) + 1n))
      expect(s3.ts > s2.ts).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
  it('skill 快照以正式目录整树为基底', () => {
    write('.ocean/skills/s1/SKILL.md', formalNode('s1', '旧版'))
    write('.ocean/skills/s1/scripts/x.sh', 'echo 1')
    const s = review.newSnapshotDir(tmpDir, 'skill', 's1')
    expect(fs.readFileSync(path.join(s.dir, 'SKILL.md'), 'utf-8')).toContain('旧版')
    expect(exists(path.relative(tmpDir, path.join(s.dir, 'scripts/x.sh')))).toBe(true)
  })
  it('workflow 快照以正式目录为基底但排除 instance/', () => {
    write('.ocean/workflows/wf/WORKFLOW.md', formalNode('wf', '旧版'))
    write('.ocean/workflows/wf/meta-data/flow.json', '{"name":"wf"}')
    write('.ocean/workflows/wf/instance/i1/status.json', '{}')
    const s = review.newSnapshotDir(tmpDir, 'workflow', 'wf')
    expect(exists(path.relative(tmpDir, path.join(s.dir, 'WORKFLOW.md')))).toBe(true)
    expect(exists(path.relative(tmpDir, path.join(s.dir, 'meta-data/flow.json')))).toBe(true)
    expect(fs.existsSync(path.join(s.dir, 'instance'))).toBe(false)
  })
  it('单文件资产快照目录初始为空；正式不存在（新建）也不报错', () => {
    const s = review.newSnapshotDir(tmpDir, 'node', 'brand-new')
    expect(fs.readdirSync(s.dir)).toEqual([])
    // knowledge 含 domain 子目录
    const k = review.newSnapshotDir(tmpDir, 'knowledge', 'ocean/功能设计')
    expect(exists(path.relative(tmpDir, path.join(k.dir, '功能设计.md')))).toBe(false)
    expect(k.dir).toContain(path.join('reviewQueue', 'knowledges', 'ocean', '功能设计'))
  })
  it('未知类型报错', () => {
    expect(review.newSnapshotDir(tmpDir, 'nope', 'x').error).toBeTruthy()
  })
})

describe('latestDraft / oldestPending / oldestRejected', () => {
  it('多快照时分别取最新/最早', () => {
    const ts1 = snapshot(tmpDir, 'node', 'n1', '第一版')
    const ts2 = snapshot(tmpDir, 'node', 'n1', '第二版')
    const latest = review.latestDraft(tmpDir, 'node', 'n1')
    expect(latest.ts).toBe(ts2)
    expect(review.oldestPending(tmpDir, 'node', 'n1').ts).toBe(ts1)
    // 驳回最早一条后：pending 里最早变成第二版，rejected 里最早是第一版
    review.rejectAsset(tmpDir, 'node', 'n1', '不合格')
    expect(review.oldestPending(tmpDir, 'node', 'n1').ts).toBe(ts2)
    expect(review.oldestRejected(tmpDir, 'node', 'n1').ts).toBe(ts1)
    // latestDraft 仍是最新一份（rejected 的）
    expect(review.latestDraft(tmpDir, 'node', 'n1').ts).toBe(ts2)
    expect(review.latestDraft(tmpDir, 'node', 'n1').status).toBe('pending')
    // 无快照 → null
    expect(review.latestDraft(tmpDir, 'node', 'ghost')).toBeNull()
    expect(review.oldestPending(tmpDir, 'node', 'ghost')).toBeNull()
  })
  it('mainRel/mainFile 指向快照主文件', () => {
    snapshot(tmpDir, 'skill', 's1', '内容')
    const p = review.oldestPending(tmpDir, 'skill', 's1')
    expect(p.mainRel).toBe('SKILL.md')
    expect(fs.existsSync(p.mainFile)).toBe(true)
  })
})

describe('resolveEditTarget（G3 编辑目标）', () => {
  it('无快照 → 新建快照', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '正式版'))
    const t = review.resolveEditTarget(tmpDir, 'node', 'n1')
    expect(t.error).toBeUndefined()
    expect(t.isNewSnapshot).toBe(true)
    expect(t.formalExists).toBe(true)
    expect(fs.existsSync(t.dir)).toBe(true)
  })
  it('已有快照 → 返回最新快照，不新建', () => {
    snapshot(tmpDir, 'node', 'n1', '草稿一')
    const t = review.resolveEditTarget(tmpDir, 'node', 'n1')
    expect(t.isNewSnapshot).toBe(false)
    expect(fs.readFileSync(t.mainFile, 'utf-8')).toContain('草稿一')
  })
})

describe('approveAsset（G5）', () => {
  it('未托管 → 报错且不改动任何文件', () => {
    const ts = snapshot(tmpDir, 'node', 'n1', '草稿')
    const queueBefore = fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/nodes/n1')).sort()
    const r = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r.success).toBe(false)
    expect(r.error).toContain('git 托管')
    expect(exists('.ocean/nodes/n1.md')).toBe(false) // 正式未生成
    expect(exists(`.ocean/reviewQueue/nodes/n1/${ts}`)).toBe(true) // 快照保留
    expect(fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/nodes/n1')).sort()).toEqual(queueBefore)
  })
  it('新建资产：正式生成 version=1、已提交、快照删除', () => {
    const ts = snapshot(tmpDir, 'node', 'n1', '第一版')
    review.gitInit(tmpDir)
    const r = review.approveAsset(tmpDir, 'node', 'n1', 'feat: 第一版')
    expect(r.success).toBe(true)
    expect(r.version).toBe(1)
    expect(r.commit.success).toBe(true)
    expect(read('.ocean/nodes/n1.md')).toContain('第一版')
    expect(read('.ocean/nodes/n1.md')).toMatch(/reviewStatus:\s*validated/)
    expect(exists(`.ocean/reviewQueue/nodes/n1/${ts}`)).toBe(false)
    const log = review.gitLog(tmpDir, 'nodes/n1.md')
    expect(log.commits).toHaveLength(1)
    expect(log.commits[0].subject).toBe('feat: 第一版')
  })
  it('已有资产：version+1 且覆写正文', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '旧正文', 3))
    review.gitInit(tmpDir)
    snapshot(tmpDir, 'node', 'n1', '新正文')
    const r = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r.success).toBe(true)
    expect(r.version).toBe(4)
    expect(read('.ocean/nodes/n1.md')).toContain('新正文')
    expect(read('.ocean/nodes/n1.md')).toMatch(/version: 4/)
  })
  it('skill：整树落到正式并自动物化到 .pi', () => {
    write('.ocean/asset-root.json', JSON.stringify({ assetRoot: 'pi' }))
    write('.ocean/skills/s1/SKILL.md', formalNode('s1', '旧版'))
    write('.ocean/skills/s1/scripts/old.sh', '旧脚本')
    review.gitInit(tmpDir)
    const ts = snapshot(tmpDir, 'skill', 's1', '新版')
    write(`.ocean/reviewQueue/skills/s1/${ts}/scripts/new.sh`, '新脚本')
    const r = review.approveAsset(tmpDir, 'skill', 's1')
    expect(r.success).toBe(true)
    expect(r.sync.success).toBe(true)
    expect(read('.ocean/skills/s1/SKILL.md')).toContain('新版')
    expect(exists('.ocean/skills/s1/scripts/new.sh')).toBe(true)
    expect(read('.pi/skills/s1/SKILL.md')).toContain('新版')
    expect(exists('.pi/skills/s1/scripts/new.sh')).toBe(true)
    expect(exists(`.ocean/reviewQueue/skills/s1/${ts}`)).toBe(false)
  })
  it('workflow：以快照整树替换正式目录但保留 instance/', () => {
    write('.ocean/workflows/wf/WORKFLOW.md', formalNode('wf', '旧版'))
    write('.ocean/workflows/wf/instance/i1/status.json', '{"status":"running"}')
    review.gitInit(tmpDir)
    const ts = snapshot(tmpDir, 'workflow', 'wf', '新版')
    write(`.ocean/reviewQueue/workflows/wf/${ts}/meta-data/flow.json`, '{"name":"wf"}')
    const r = review.approveAsset(tmpDir, 'workflow', 'wf')
    expect(r.success).toBe(true)
    expect(read('.ocean/workflows/wf/WORKFLOW.md')).toContain('新版')
    expect(read('.ocean/workflows/wf/instance/i1/status.json')).toContain('running')
  })
  it('非 skill/agent 通过：无物化；只有 rejected 快照时不可通过', () => {
    write('.ocean/asset-root.json', JSON.stringify({ assetRoot: 'pi' }))
    write('.ocean/nodes/n1.md', formalNode('n1', '旧'))
    review.gitInit(tmpDir)
    snapshot(tmpDir, 'node', 'n1', 'x')
    const r = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r.sync).toBeNull()
    review.rejectAsset(tmpDir, 'node', 'n1', '不要')
    const r2 = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r2.success).toBe(false)
    expect(r2.error).toContain('待审核快照')
  })
  it('codebase：覆写快照内存在的文件；新 codebase 整树搬运', () => {
    // 已有正式：快照只带 README.md → 覆写 README，正式其余文件保留
    write('.ocean/codebases/c1/README.md', formalNode('c1', '旧说明'))
    write('.ocean/codebases/c1/src/a.ts', 'export {}')
    review.gitInit(tmpDir)
    const ts = snapshot(tmpDir, 'codebase', 'c1', '新说明')
    const r = review.approveAsset(tmpDir, 'codebase', 'c1')
    expect(r.success).toBe(true)
    expect(read('.ocean/codebases/c1/README.md')).toContain('新说明')
    expect(exists('.ocean/codebases/c1/src/a.ts')).toBe(true)
    expect(exists(`.ocean/reviewQueue/codebases/c1/${ts}`)).toBe(false)
    // 新 codebase：快照整树搬运到正式
    const ts2 = snapshot(tmpDir, 'codebase', 'c2', '全新')
    write(`.ocean/reviewQueue/codebases/c2/${ts2}/src/b.ts`, 'export {}')
    const r2 = review.approveAsset(tmpDir, 'codebase', 'c2')
    expect(r2.success).toBe(true)
    expect(r2.version).toBe(1)
    expect(exists('.ocean/codebases/c2/README.md')).toBe(true)
    expect(exists('.ocean/codebases/c2/src/b.ts')).toBe(true)
  })
})

describe('rejectAsset / restoreAsset（G6）', () => {
  it('理由必填；写入最早 pending 快照；正式文件不变；restore 回 pending 删理由', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '正式内容'))
    const ts1 = snapshot(tmpDir, 'node', 'n1', '第一版')
    snapshot(tmpDir, 'node', 'n1', '第二版')
    expect(review.rejectAsset(tmpDir, 'node', 'n1', '').success).toBe(false)
    expect(review.rejectAsset(tmpDir, 'node', 'n1', '  ').success).toBe(false)
    const r = review.rejectAsset(tmpDir, 'node', 'n1', '内容不完整')
    expect(r.success).toBe(true)
    const rejected = read(`.ocean/reviewQueue/nodes/n1/${ts1}/n1.md`)
    expect(rejected).toMatch(/reviewStatus:\s*rejected/)
    expect(rejected).toMatch(/rejectReason: 内容不完整/)
    expect(read('.ocean/nodes/n1.md')).toContain('正式内容') // 正式不变
    expect(review.rejectAsset(tmpDir, 'node', 'ghost', 'r').success).toBe(false)
    const rr = review.restoreAsset(tmpDir, 'node', 'n1')
    expect(rr.success).toBe(true)
    const restored = read(`.ocean/reviewQueue/nodes/n1/${ts1}/n1.md`)
    expect(restored).toMatch(/reviewStatus:\s*pending/)
    expect(restored).not.toContain('rejectReason')
    expect(review.restoreAsset(tmpDir, 'node', 'n1').success).toBe(false) // 无 rejected 可恢复
  })
})

describe('diffAsset / readSnapshot（G4）', () => {
  it('正式 vs 最早 pending；剥离 frontmatter 只比正文；最早与正式相同时无差异', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '旧正文\n共有行'))
    snapshot(tmpDir, 'node', 'n1', '旧正文\n共有行') // 最早快照与正式一致
    snapshot(tmpDir, 'node', 'n1', '新正文\n共有行') // 最新快照有差异
    const r = review.diffAsset(tmpDir, 'node', 'n1')
    expect(r.success).toBe(true)
    expect(r.isNew).toBe(false)
    expect(r.hasBaseline).toBe(true)
    expect(r.version).toBe(1)
    // 多快照时对比的是最早一条（与正式相同 → 无差异），最新快照不参与
    expect(r.changed).toBe(false)
    expect(r.diff).not.toContain('+ 新正文')
    const show = review.readSnapshot(tmpDir, 'node', 'n1')
    expect(show.content).toContain('旧正文') // 最早快照全文
  })
  it('最早快照与正式有差异时输出 +/- 行', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '旧正文'))
    snapshot(tmpDir, 'node', 'n1', '新正文')
    const r = review.diffAsset(tmpDir, 'node', 'n1')
    expect(r.changed).toBe(true)
    expect(r.diff).toContain('- 旧正文')
    expect(r.diff).toContain('+ 新正文')
    expect(r.diff).not.toContain('reviewStatus')
  })
  it('新建资产无基线：输出全文并标注 isNew', () => {
    snapshot(tmpDir, 'node', 'brand', '全新内容')
    const r = review.diffAsset(tmpDir, 'node', 'brand')
    expect(r.isNew).toBe(true)
    expect(r.hasBaseline).toBe(false)
    expect(r.content).toContain('全新内容')
    expect(r.content).toContain('---') // 含 frontmatter 的全文
  })
  it('无待审核快照 → 报错', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    expect(review.diffAsset(tmpDir, 'node', 'n1').success).toBe(false)
  })
})

describe('listQueue', () => {
  it('每资产一条：ts=最早 pending、pendingCount、isNew、baseVersion', () => {
    write('.ocean/nodes/has-formal.md', formalNode('has-formal', 'x', 7))
    const t1 = snapshot(tmpDir, 'node', 'has-formal', '一')
    snapshot(tmpDir, 'node', 'has-formal', '二')
    snapshot(tmpDir, 'agent', 'brand-agent', '新代理')
    const items = review.listQueue(tmpDir).items
    expect(items).toHaveLength(2)
    const node = items.find((i: any) => i.type === 'node')
    expect(node.name).toBe('has-formal')
    expect(node.ts).toBe(t1)
    expect(node.pendingCount).toBe(2)
    expect(node.isNew).toBe(false)
    expect(node.baseVersion).toBe(7)
    expect(node.reviewStatus).toBe('pending')
    const agent = items.find((i: any) => i.type === 'agent')
    expect(agent.isNew).toBe(true)
    expect(agent.baseVersion).toBeNull()
    expect(agent.pendingCount).toBe(1)
  })
  it('rejected 过滤：取最早 rejected 快照并带理由', () => {
    snapshot(tmpDir, 'node', 'n1', '一')
    snapshot(tmpDir, 'node', 'n1', '二')
    review.rejectAsset(tmpDir, 'node', 'n1', '不行')
    const pend = review.listQueue(tmpDir, 'pending').items
    expect(pend).toHaveLength(1)
    expect(pend[0].pendingCount).toBe(1)
    const rej = review.listQueue(tmpDir, 'rejected').items
    expect(rej).toHaveLength(1)
    expect(rej[0].rejectReason).toBe('不行')
    expect(rej[0].reviewStatus).toBe('rejected')
  })
  it('knowledge 含 domain 子目录', () => {
    snapshot(tmpDir, 'knowledge', 'ocean/功能设计', '草稿')
    const items = review.listQueue(tmpDir).items
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('knowledge')
    expect(items[0].name).toBe('ocean/功能设计')
    expect(items[0].description).toBe('测试')
  })
  it('listReviewAssets 为 listQueue 别名', () => {
    snapshot(tmpDir, 'node', 'n1', 'x')
    expect(review.listReviewAssets(tmpDir).items).toEqual(review.listQueue(tmpDir).items)
  })
})

describe('commitFormalDeletion / discardSnapshots（G8）', () => {
  it('删除后提交入库；未托管直接 success', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    fs.rmSync(path.join(tmpDir, '.ocean/nodes/n1.md'))
    const r = review.commitFormalDeletion(tmpDir, 'nodes/n1.md')
    expect(r.success).toBe(true)
    expect(review.gitShow(tmpDir, 'nodes/n1.md', review.gitLog(tmpDir, 'nodes/n1.md').commits[0].hash).content).toBeNull()
    expect(review.commitFormalDeletion(tmpDir, 'nodes/ghost.md').success).toBe(true) // 未存在也 success
  })
  it('discardSnapshots 删除该资产全部快照', () => {
    snapshot(tmpDir, 'node', 'n1', '一')
    snapshot(tmpDir, 'node', 'n1', '二')
    snapshot(tmpDir, 'node', 'other', 'x')
    review.discardSnapshots(tmpDir, 'node', 'n1')
    expect(exists('.ocean/reviewQueue/nodes/n1')).toBe(false)
    expect(review.oldestPending(tmpDir, 'node', 'other')).not.toBeNull()
  })
})

describe('syncApprovedAssets（全量幂等 / 单项不做删除对齐）', () => {
  beforeEach(() => write('.ocean/asset-root.json', JSON.stringify({ assetRoot: 'pi' })))
  it('全量：validated 物化、pending 跳过、孤儿移入回收站；二跑幂等', () => {
    write('.ocean/skills/ok/SKILL.md', '---\nname: ok\nreviewStatus: validated\nversion: 1\n---\nx')
    write('.ocean/skills/no/SKILL.md', '---\nname: no\nreviewStatus: pending\n---\nx')
    write('.ocean/agents/a.md', '---\nname: a\nreviewStatus: validated\nversion: 1\n---\nx')
    write('.pi/skills/orphan/SKILL.md', '---\nname: orphan\nreviewStatus: validated\n---\nx')
    const r1 = review.syncApprovedAssets(tmpDir)
    expect(r1.report.added.sort()).toEqual(['agents/a.md', 'skills/ok'])
    expect(r1.report.skippedPending).toEqual(['skills/no'])
    expect(r1.report.removed).toEqual(['skills/orphan'])
    expect(exists('.pi/skills/orphan')).toBe(false)
    expect(exists('.ocean/.trashbox/sync')).toBe(true)
    const r2 = review.syncApprovedAssets(tmpDir)
    expect(r2.report.added).toHaveLength(0)
    expect(r2.report.removed).toHaveLength(0)
  })
  it('单项：只物化指定资产，不触碰运行时目录其他项', () => {
    write('.ocean/skills/ok/SKILL.md', '---\nname: ok\nreviewStatus: validated\n---\nx')
    write('.pi/skills/orphan/SKILL.md', '---\nname: orphan\nreviewStatus: validated\n---\nx')
    const r = review.syncApprovedAssets(tmpDir, { type: 'skill', name: 'ok' })
    expect(r.success).toBe(true)
    expect(exists('.pi/skills/ok/SKILL.md')).toBe(true)
    expect(exists('.pi/skills/orphan')).toBe(true)
  })
  it('单项 pending 资产拒绝物化；非 skill/agent 类型无物化目标', () => {
    write('.ocean/skills/no/SKILL.md', '---\nname: no\nreviewStatus: pending\n---\nx')
    expect(review.syncApprovedAssets(tmpDir, { type: 'skill', name: 'no' }).success).toBe(false)
    expect(review.syncApprovedAssets(tmpDir, { type: 'node', name: 'x' }).success).toBe(false)
  })
})

describe('resolveSaveTarget（G3：每次保存新快照，同一保存会话内复用）', () => {
  it('无快照 → 新建；3s 内再次保存 → 复用同一快照；超过窗口 → 新快照', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0, 0))
    try {
      write('.ocean/nodes/sv.md', `---\nname: sv\nreviewStatus: validated\nversion: 1\n---\n正文\n`)
      const a = review.resolveSaveTarget(tmpDir, 'node', 'sv')
      expect(a.isNewSnapshot).toBe(true)
      fs.writeFileSync(a.mainFile, '---\nname: sv\nreviewStatus: pending\n---\n草稿1\n')
      vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 2, 0))
      const b = review.resolveSaveTarget(tmpDir, 'node', 'sv')
      expect(b.reusedInSession).toBe(true)
      expect(b.ts).toBe(a.ts)
      vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 5, 0))
      const c = review.resolveSaveTarget(tmpDir, 'node', 'sv')
      expect(c.isNewSnapshot).toBe(true)
      expect(c.ts > a.ts).toBe(true)
      // 刚创建但主文件尚未写入的快照对读取方不可见（无效快照被跳过）
      expect(review.resolveEditTarget(tmpDir, 'node', 'sv').ts).toBe(a.ts)
      fs.writeFileSync(c.mainFile, '---\nname: sv\nreviewStatus: pending\n---\n草稿2\n')
      // 编辑读取目标为最新有效快照（不新建）
      const e = review.resolveEditTarget(tmpDir, 'node', 'sv')
      expect(e.isNewSnapshot).toBe(false)
      expect(e.ts).toBe(c.ts)
      // 两次独立保存 = 两份快照（FIFO：a 先审）
      expect(review.listQueue(tmpDir).items.find((i: any) => i.name === 'sv').pendingCount).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ==================== 基准追踪 / 三方合并 / 直改收编（H1–H7） ====================

// 带 baseCommit 的快照（复用 snapshot() 的 fmExtra 通道）
function snapshotWithBase(root: string, type: string, name: string, body: string, baseSha: string | null): string {
  return snapshot(root, type, name, body, baseSha ? `baseCommit: ${baseSha}\n` : '')
}

describe('headSha / fileChangedSince（H1/H2）', () => {
  it('headSha：未托管 → null；托管 → 40 位 sha', () => {
    expect(review.headSha(tmpDir)).toBeNull()
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    expect(review.headSha(tmpDir)).toMatch(/^[0-9a-f]{40}$/)
  })
  it('fileChangedSince 三态：改了正式 / 没改 / sha 不存在或为空', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'v1'))
    review.gitInit(tmpDir)
    const sha1 = review.headSha(tmpDir)
    expect(review.fileChangedSince(tmpDir, 'nodes/n1.md', sha1)).toBe('unchanged')
    write('.ocean/nodes/n1.md', formalNode('n1', 'v2', 2))
    review.gitCommit(tmpDir, 'nodes/n1.md', 'v2')
    expect(review.fileChangedSince(tmpDir, 'nodes/n1.md', sha1)).toBe('changed')
    // sha1 之后没改过 n2 → 对 n2 而言 unchanged（无差异）
    expect(review.fileChangedSince(tmpDir, 'nodes/ghost.md', review.headSha(tmpDir))).toBe('unchanged')
    expect(review.fileChangedSince(tmpDir, 'nodes/n1.md', '0123456789abcdef0123456789abcdef01234567')).toBe('unknown')
    expect(review.fileChangedSince(tmpDir, 'nodes/n1.md', null)).toBe('unknown')
    expect(review.fileChangedSince(tmpDir, 'nodes/n1.md', '')).toBe('unknown')
  })
})

describe('threeWayMerge（H4）', () => {
  it('无冲突：ours 与 theirs 改不同区域 → 自动合并', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '开头\n中间\n结尾'))
    review.gitInit(tmpDir)
    const sha = review.headSha(tmpDir)
    const ours = '开头改为 ours\n中间\n结尾'
    const theirs = '开头\n中间\n结尾改为 theirs'
    const r = review.threeWayMerge(tmpDir, 'nodes/n1.md', sha, ours, theirs)
    expect(r.ok).toBe(true)
    expect(r.conflicts).toBe(0)
    expect(r.text).toContain('开头改为 ours')
    expect(r.text).toContain('中间')
    expect(r.text).toContain('结尾改为 theirs')
  })
  it('有冲突：同区域 → conflicts>0 且文本含冲突标记', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '开头\n同一段\n结尾'))
    review.gitInit(tmpDir)
    const sha = review.headSha(tmpDir)
    const r = review.threeWayMerge(tmpDir, 'nodes/n1.md', sha, '开头\nours 版同一段\n结尾', '开头\ntheirs 版同一段\n结尾')
    expect(r.ok).toBe(false)
    expect(r.conflicts).toBeGreaterThan(0)
    expect(r.text).toContain('<<<<<<<')
    expect(r.text).toContain('=======')
    expect(r.text).toContain('>>>>>>>')
    expect(r.text).toContain('ours 版同一段')
    expect(r.text).toContain('theirs 版同一段')
  })
  it('base 路径在基准中不存在（新建场景）→ base 为空，theirs 全保留', () => {
    write('.ocean/nodes/other.md', formalNode('other', '占位'))
    review.gitInit(tmpDir)
    const sha = review.headSha(tmpDir)
    const r = review.threeWayMerge(tmpDir, 'nodes/new.md', sha, '', '---\nname: new\n---\n全新内容\n')
    expect(r.ok).toBe(true)
    expect(r.text).toContain('全新内容')
  })
})

describe('approveAsset 基准漂移与重定基（H3）', () => {
  it('基准未变（baseCommit 后正式无变化）→ 直接提升', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'v1'))
    review.gitInit(tmpDir)
    const sha = review.headSha(tmpDir)
    const ts = snapshotWithBase(tmpDir, 'node', 'n1', '改后内容', sha)
    const r = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r.success).toBe(true)
    expect(r.version).toBe(2)
    expect(read('.ocean/nodes/n1.md')).toContain('改后内容')
    expect(exists(`.ocean/reviewQueue/nodes/n1/${ts}`)).toBe(false)
  })
  it('草稿无 baseCommit → 跳过合并直接提升（向后兼容）', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'v1'))
    review.gitInit(tmpDir)
    review.gitCommit(tmpDir, 'nodes/n1.md', '再次修改') // HEAD 前进
    snapshot(tmpDir, 'node', 'n1', '无基准草稿') // 无 baseCommit
    const r = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r.success).toBe(true)
    expect(read('.ocean/nodes/n1.md')).toContain('无基准草稿')
  })
  it('多份草稿：approve 第一份 → 第二份自动重定基 → approve 第二份 → 正式含两处改动（H3 步骤 5）', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '第一段原文\n间隔行\n第二段原文'))
    review.gitInit(tmpDir)
    const sha1 = review.headSha(tmpDir)
    // 草稿 A（最早）改第一段；草稿 B 改第二段——都基于 sha1
    snapshotWithBase(tmpDir, 'node', 'n1', '第一段 A 改\n间隔行\n第二段原文', sha1)
    snapshotWithBase(tmpDir, 'node', 'n1', '第一段原文\n间隔行\n第二段 B 改', sha1)
    const r1 = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r1.success).toBe(true)
    expect(r1.version).toBe(2)
    expect(read('.ocean/nodes/n1.md')).toContain('第一段 A 改')
    // B 被自动重定基：内容含两处改动、autoMerged、baseCommit 更新
    const snaps = fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/nodes/n1')).sort()
    expect(snaps).toHaveLength(1) // A 已删
    const bText = read(`.ocean/reviewQueue/nodes/n1/${snaps[0]}/n1.md`)
    expect(bText).toContain('第一段 A 改')
    expect(bText).toContain('第二段 B 改')
    expect(bText).toMatch(/autoMerged:\s*true/)
    expect(bText).toContain(`baseCommit: ${review.headSha(tmpDir)}`)
    const item = review.listQueue(tmpDir).items.find((i: any) => i.name === 'n1')
    expect(item.autoMerged).toBe(true)
    expect(item.baseStale).toBe(false)
    // 第二次 approve：B 基准已是当前 HEAD → 直接提升 v3
    const r2 = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r2.success).toBe(true)
    expect(r2.version).toBe(3)
    expect(read('.ocean/nodes/n1.md')).toContain('第一段 A 改')
    expect(read('.ocean/nodes/n1.md')).toContain('第二段 B 改')
  })
  it('approve 时基准已漂移且可自动合并 → needReReview，不提升；再次 approve → 提升（H3 步骤 3/4）', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '第一段原文\n间隔行\n第二段原文'))
    review.gitInit(tmpDir)
    const sha1 = review.headSha(tmpDir)
    // 草稿 A 直接提升（正式 → v2，HEAD 前进）
    snapshotWithBase(tmpDir, 'node', 'n1', '第一段 A 改\n间隔行\n第二段原文', sha1)
    expect(review.approveAsset(tmpDir, 'node', 'n1').success).toBe(true)
    const sha2 = review.headSha(tmpDir)
    // 之后才出现的草稿 B，但手工写死 baseCommit=sha1（模拟"基于旧版创建"的草稿）改第二段
    const tsB = snapshotWithBase(tmpDir, 'node', 'n1', '第一段 A 改\n间隔行\n第二段 B 改', sha1)
    // 第一次 approve：B 基准漂移 → 三方合并成功 → 写回草稿 + autoMerged，不提升
    const r = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r.success).toBe(false)
    expect(r.needReReview).toBe(true)
    expect(r.autoMerged).toBe(true)
    expect(read('.ocean/nodes/n1.md')).toContain('第一段 A 改') // 正式未动
    expect(read('.ocean/nodes/n1.md')).not.toContain('第二段 B 改')
    const bText = read(`.ocean/reviewQueue/nodes/n1/${tsB}/n1.md`)
    expect(bText).toContain('第一段 A 改') // 合并结果
    expect(bText).toContain('第二段 B 改')
    expect(bText).toContain(`baseCommit: ${sha2}`)
    // 第二次 approve：基准已是当前 → 直接提升 v3
    const r2 = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r2.success).toBe(true)
    expect(r2.version).toBe(3)
    expect(read('.ocean/nodes/n1.md')).toContain('第二段 B 改')
  })
  it('approve 时基准漂移且冲突 → conflict:true、正式不变、草稿标 mergeConflict；跳过后报错；discard 可丢弃（H5）', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '同一段原文'))
    review.gitInit(tmpDir)
    const sha1 = review.headSha(tmpDir)
    snapshotWithBase(tmpDir, 'node', 'n1', 'A 版同一段', sha1)
    expect(review.approveAsset(tmpDir, 'node', 'n1').success).toBe(true) // v2 = A 版
    // 草稿 B 基于旧 sha1，改同一段 → 冲突
    const tsB = snapshotWithBase(tmpDir, 'node', 'n1', 'B 版同一段', sha1)
    const r = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r.success).toBe(false)
    expect(r.conflict).toBe(true)
    expect(r.error).toContain('冲突')
    expect(read('.ocean/nodes/n1.md')).toContain('A 版同一段') // 正式未动
    const bText = read(`.ocean/reviewQueue/nodes/n1/${tsB}/n1.md`)
    expect(bText).toMatch(/mergeConflict:\s*true/)
    expect(bText).toContain('<<<<<<<') // 冲突标记写回草稿
    // listQueue / diffAsset 展示冲突（H5）
    const item = review.listQueue(tmpDir).items.find((i: any) => i.name === 'n1')
    expect(item.mergeConflict).toBe(true)
    const d = review.diffAsset(tmpDir, 'node', 'n1')
    expect(d.mergeConflict).toBe(true)
    expect(d.success).toBe(true)
    // 再 approve：唯一 pending 是冲突草稿 → 报错并引导 discard
    const r2 = review.approveAsset(tmpDir, 'node', 'n1')
    expect(r2.success).toBe(false)
    expect(r2.error).toContain('冲突')
    expect(r2.error).toContain('discard')
    // discard 丢弃
    const dr = review.discardOldestPending(tmpDir, 'node', 'n1')
    expect(dr.success).toBe(true)
    expect(exists(`.ocean/reviewQueue/nodes/n1/${tsB}`)).toBe(false)
    expect(review.approveAsset(tmpDir, 'node', 'n1').success).toBe(false) // 无 pending
  })
})

describe('writeDraftWithBase / baseCommitField（H1）', () => {
  it('写入草稿：pending + baseCommit，清除 version/理由/冲突/合并标记', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    const sha = review.headSha(tmpDir)
    const dirty = `---\nname: n1\nreviewStatus: validated\nversion: 9\nrejectReason: 旧理由\nmergeConflict: true\nautoMerged: true\n---\n内容\n`
    const w = review.writeDraftWithBase(tmpDir, 'node', 'n1', dirty)
    expect(w.error).toBeUndefined()
    const t = fs.readFileSync(w.mainFile, 'utf-8')
    expect(t).toMatch(/reviewStatus:\s*pending/)
    expect(t).toContain(`baseCommit: ${sha}`)
    expect(t).not.toMatch(/^version:/m)
    expect(t).not.toContain('rejectReason')
    expect(t).not.toMatch(/^mergeConflict:/m)
    expect(t).not.toMatch(/^autoMerged:/m)
    expect(t).toContain('内容')
    // keepAutoMerged 选项
    const w2 = review.writeDraftWithBase(tmpDir, 'node', 'n1', dirty, { keepAutoMerged: true })
    expect(fs.readFileSync(w2.mainFile, 'utf-8')).toMatch(/autoMerged:\s*true/)
  })
  it('baseCommitField：未托管返回空串；托管返回行', () => {
    expect(review.baseCommitField(tmpDir)).toBe('')
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    expect(review.baseCommitField(tmpDir)).toBe(`baseCommit: ${review.headSha(tmpDir)}`)
  })
})

describe('adoptStrayEdits（H7 直改收编）', () => {
  it('未托管 → 报错', () => {
    const r = review.adoptStrayEdits(tmpDir)
    expect(r.success).toBe(false)
    expect(r.error).toContain('git 托管')
    expect(r.adopted).toEqual([])
    expect(r.restoredDeletions).toEqual([])
  })
  it('直改正式文件 → 入队 + 正式还原为 HEAD；幂等', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', '过审内容'))
    review.gitInit(tmpDir)
    const headContent = read('.ocean/nodes/n1.md')
    const sha = review.headSha(tmpDir)
    // 直改（带脏 frontmatter：version=9 / validated）
    write('.ocean/nodes/n1.md', '---\nname: n1\nreviewStatus: validated\nversion: 9\n---\n被直接改掉的内容\n')
    const r = review.adoptStrayEdits(tmpDir)
    expect(r.success).toBe(true)
    expect(r.adopted).toEqual([{ type: 'node', name: 'n1', kind: 'modified' }])
    expect(r.restoredDeletions).toEqual([])
    // 正式字节级还原
    expect(read('.ocean/nodes/n1.md')).toBe(headContent)
    // 快照：直改内容 + pending + baseCommit=sha + 无 version
    const snaps = fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/nodes/n1')).sort()
    expect(snaps).toHaveLength(1)
    const t = read(`.ocean/reviewQueue/nodes/n1/${snaps[0]}/n1.md`)
    expect(t).toContain('被直接改掉的内容')
    expect(t).toMatch(/reviewStatus:\s*pending/)
    expect(t).toContain(`baseCommit: ${sha}`)
    expect(t).not.toMatch(/^version:/m)
    // 幂等：二跑零动作
    const r2 = review.adoptStrayEdits(tmpDir)
    expect(r2.success).toBe(true)
    expect(r2.adopted).toEqual([])
    expect(r2.restoredDeletions).toEqual([])
    // 收编后的草稿可正常走审核
    const ap = review.approveAsset(tmpDir, 'node', 'n1')
    expect(ap.success).toBe(true)
    expect(read('.ocean/nodes/n1.md')).toContain('被直接改掉的内容')
  })
  it('新增未跟踪文件 → 入队（added）+ 正式位置删除；knowledge domain 清空目录', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    write('.ocean/knowledges/ocean/新知.md', '---\nname: 新知\n---\n未跟踪新文件\n')
    const r = review.adoptStrayEdits(tmpDir)
    expect(r.success).toBe(true)
    expect(r.adopted).toEqual([{ type: 'knowledge', name: 'ocean/新知', kind: 'added' }])
    expect(exists('.ocean/knowledges/ocean/新知.md')).toBe(false)
    expect(exists('.ocean/knowledges/ocean')).toBe(false) // 空父目录清理
    const snaps = fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/knowledges/ocean/新知')).sort()
    const t = read(`.ocean/reviewQueue/knowledges/ocean/新知/${snaps[0]}/新知.md`)
    expect(t).toContain('未跟踪新文件')
    expect(t).toMatch(/reviewStatus:\s*pending/)
  })
  it('删除 → 还原不入队', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    fs.rmSync(path.join(tmpDir, '.ocean/nodes/n1.md'))
    const r = review.adoptStrayEdits(tmpDir)
    expect(r.success).toBe(true)
    expect(r.adopted).toEqual([])
    expect(r.restoredDeletions).toEqual(['nodes/n1.md'])
    expect(exists('.ocean/nodes/n1.md')).toBe(true)
    expect(exists('.ocean/reviewQueue/nodes/n1')).toBe(false)
  })
  it('skill 目录直改子文件 → 整目录入队并还原', () => {
    write('.ocean/skills/s1/SKILL.md', formalNode('s1', '正式主文件'))
    write('.ocean/skills/s1/scripts/x.sh', 'echo old')
    review.gitInit(tmpDir)
    const sha = review.headSha(tmpDir)
    write('.ocean/skills/s1/scripts/x.sh', 'echo new') // 直改子文件
    const r = review.adoptStrayEdits(tmpDir)
    expect(r.success).toBe(true)
    expect(r.adopted).toEqual([{ type: 'skill', name: 's1', kind: 'modified' }])
    expect(read('.ocean/skills/s1/scripts/x.sh')).toBe('echo old') // 还原
    const snaps = fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/skills/s1')).sort()
    expect(read(`.ocean/reviewQueue/skills/s1/${snaps[0]}/scripts/x.sh`)).toBe('echo new') // 快照含直改
    const sk = read(`.ocean/reviewQueue/skills/s1/${snaps[0]}/SKILL.md`)
    expect(sk).toContain('正式主文件')
    expect(sk).toMatch(/reviewStatus:\s*pending/)
    expect(sk).toContain(`baseCommit: ${sha}`)
  })
  it('reviewQueue 下的内容不影响收编（gitignored）', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    snapshot(tmpDir, 'node', 'n1', '既有草稿')
    const r = review.adoptStrayEdits(tmpDir)
    expect(r.success).toBe(true)
    expect(r.adopted).toEqual([])
    expect(exists('.ocean/reviewQueue/nodes/n1')).toBe(true)
  })
  it('工作区干净 → 无动作', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'x'))
    review.gitInit(tmpDir)
    const r = review.adoptStrayEdits(tmpDir)
    expect(r.success).toBe(true)
    expect(r.adopted).toEqual([])
    expect(r.restoredDeletions).toEqual([])
  })
})

describe('listQueue 合并状态字段（H6）', () => {
  it('hasBase / baseStale / autoMerged / mergeConflict', () => {
    write('.ocean/nodes/n1.md', formalNode('n1', 'v1'))
    review.gitInit(tmpDir)
    const sha1 = review.headSha(tmpDir)
    // 草稿（基准=sha1，正式未变 → baseStale=false, hasBase=true）
    snapshotWithBase(tmpDir, 'node', 'n1', '草稿', sha1)
    let item = review.listQueue(tmpDir).items.find((i: any) => i.name === 'n1')
    expect(item.hasBase).toBe(true)
    expect(item.baseStale).toBe(false)
    // 正式前进后（另一个资产过审不动本文件……直接对 n1 提交使基准漂移）
    write('.ocean/nodes/n1.md', formalNode('n1', 'v2', 2))
    review.gitCommit(tmpDir, 'nodes/n1.md', '直接提交 v2')
    item = review.listQueue(tmpDir).items.find((i: any) => i.name === 'n1')
    expect(item.baseStale).toBe(true)
    // 标记冲突/自动合并后透出
    const snaps = fs.readdirSync(path.join(tmpDir, '.ocean/reviewQueue/nodes/n1')).sort()
    let t = read(`.ocean/reviewQueue/nodes/n1/${snaps[0]}/n1.md`)
    t = review.setFmField ? t : t // setFmField 未导出，直接手工改文件
    fs.writeFileSync(path.join(tmpDir, `.ocean/reviewQueue/nodes/n1/${snaps[0]}/n1.md`), t.replace('reviewStatus: pending', 'reviewStatus: pending\nmergeConflict: true\nautoMerged: true'), 'utf-8')
    item = review.listQueue(tmpDir).items.find((i: any) => i.name === 'n1')
    expect(item.mergeConflict).toBe(true)
    expect(item.autoMerged).toBe(true)
  })
})

describe('discardOldestPending（H5）', () => {
  it('丢弃最早 pending（含冲突草稿）；无 pending 报错', () => {
    const ts1 = snapshot(tmpDir, 'node', 'n1', '一')
    snapshot(tmpDir, 'node', 'n1', '二')
    const r = review.discardOldestPending(tmpDir, 'node', 'n1')
    expect(r.success).toBe(true)
    expect(r.ts).toBe(ts1)
    expect(exists(`.ocean/reviewQueue/nodes/n1/${ts1}`)).toBe(false)
    expect(exists('.ocean/reviewQueue/nodes/n1')).toBe(true)
    review.discardOldestPending(tmpDir, 'node', 'n1')
    expect(review.discardOldestPending(tmpDir, 'node', 'n1').success).toBe(false)
    expect(review.discardOldestPending(tmpDir, 'node', 'ghost').success).toBe(false)
  })
})
