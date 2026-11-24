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
