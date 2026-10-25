import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  saveKnowledgeFile,
  readKnowledgeFile,
  deleteKnowledgeFile,
  listKnowledgeFiles,
  listKnowledgeFolders,
  getKnowledgeGitStatus,
  initKnowledgeGit,
  getKnowledgeGitLog,
  showKnowledgeGitRevision,
  commitKnowledgeGit,
  rollbackKnowledgeGit,
  readKnowledgeGitConfig,
  writeKnowledgeGitConfig,
  getKnowledgeBaseline,
  readKnowledgeGraphConfig,
  writeKnowledgeGraphConfig,
  saveKnowledgeTemplateFile,
  readKnowledgeTemplateFile,
} from '../../core/common'
import {
  listKnowledges,
  readKnowledge,
  createKnowledge,
  updateKnowledge,
  delKnowledge,
  createKnowledgeDomain,
  listDomainTree,
  listDomainSubtree,
  searchDomains,
  updateKnowledgeDomain,
  searchKnowledges,
} from '../../source/cli/knowledge'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-knowledge-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const kn = (...seg: string[]): string => path.join(root, '.knowledges', ...seg)
const md = (rel: string): string => fs.readFileSync(kn(`${rel}.md`), 'utf-8')

describe('GUI 语义组（launch.cjs knowledge IPC 契约复刻）', () => {
  it('listKnowledgeFiles：目录不存在返回空，且创建 .knowledges（getKnowledgesDir 副作用）', () => {
    expect(listKnowledgeFiles(root)).toEqual({ success: true, files: [] })
    expect(fs.existsSync(kn())).toBe(true)
  })

  it('saveKnowledgeFile upsert：子目录路径自动建中间目录，content 原样哑写', () => {
    expect(saveKnowledgeFile(root, 'kn1', '---\nname: kn1\n---\n正文')).toEqual({ success: true })
    expect(saveKnowledgeFile(root, 'backend/api', '正文二')).toEqual({ success: true })
    expect(fs.existsSync(kn('backend', 'api.md'))).toBe(true)
    expect(saveKnowledgeFile(root, 'kn1', '覆盖原文')).toEqual({ success: true })
    expect(md('kn1')).toBe('覆盖原文')
  })

  it('readKnowledgeFile ghost 返回 content:null；存在返回原文与 mtime', () => {
    expect(readKnowledgeFile(root, 'ghost')).toEqual({ success: true, content: null, mtime: null })
    saveKnowledgeFile(root, 'a', 'raw')
    const res = readKnowledgeFile(root, 'a')
    expect(res.success).toBe(true)
    expect(res.content).toBe('raw')
    expect(typeof res.mtime).toBe('string')
  })

  it('deleteKnowledgeFile ghost 静默；只删单文件不删目录', () => {
    saveKnowledgeFile(root, 'd1/k', 'x')
    expect(deleteKnowledgeFile(root, 'ghost')).toEqual({ success: true })
    expect(deleteKnowledgeFile(root, 'd1/k')).toEqual({ success: true })
    expect(fs.existsSync(kn('d1'))).toBe(true)
  })

  it('listKnowledgeFiles：递归 .md 相对路径、跳过隐藏目录与非 .md、含 index.md', () => {
    saveKnowledgeFile(root, 'zeta', 'z')
    saveKnowledgeFile(root, 'alpha', 'a')
    saveKnowledgeFile(root, 'sub/deep/x', 'x')
    fs.mkdirSync(kn('.hidden'))
    fs.writeFileSync(kn('.hidden', 'h.md'), 'h')
    fs.writeFileSync(kn('notes.txt'), 'not md')
    fs.writeFileSync(kn('index.md'), 'idx')
    const res = listKnowledgeFiles(root)
    if (!res.success) throw new Error('listKnowledgeFiles 应成功')
    expect(res.files.sort()).toEqual(['alpha.md', 'index.md', 'sub/deep/x.md', 'zeta.md'])
  })

  it('listKnowledgeFolders：树形结构、跳过隐藏目录', () => {
    saveKnowledgeFile(root, 'backend/api', 'x')
    fs.mkdirSync(kn('.h'))
    expect(listKnowledgeFolders(root)).toEqual({
      success: true,
      folders: [{ name: 'backend', path: 'backend', children: [] }],
    })
  })

  it('initKnowledgeGit 在 .knowledges 目录不存在时先建目录再 init（旧 getKnowledgesDir 无条件建目录副作用，审查回归修复锁定）', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-knowledge-bare-'))
    try {
      expect(fs.existsSync(path.join(bare, '.knowledges'))).toBe(false)
      const r = initKnowledgeGit(bare)
      expect(r.success).toBe(true)
      if (r.success) expect(r.hasCommits).toBe(true)
      expect(fs.existsSync(path.join(bare, '.knowledges', '.git'))).toBe(true)
    } finally {
      fs.rmSync(bare, { recursive: true, force: true })
    }
  })

  it('git 全链路：init 基线提交 → status → commit 默认消息 → log → show → baseline → rollback', () => {
    saveKnowledgeFile(root, 'k1', '---\nname: k1\nstatus: validated\n---\n正文 v1')

    expect(getKnowledgeGitStatus(root)).toEqual({ success: true, managed: false, branch: null, hasCommits: false })

    const init = initKnowledgeGit(root)
    expect(init.success).toBe(true)
    if (!init.success) throw new Error('initKnowledgeGit 应成功')
    expect(init.branch).toBe('ocean-knowledge')
    expect(init.hasCommits).toBe(true)
    expect(fs.readFileSync(kn('.gitignore'), 'utf-8')).toBe('*.sqlite\n.trash-box/\n')

    expect(getKnowledgeGitStatus(root)).toEqual({ success: true, managed: true, branch: 'ocean-knowledge', hasCommits: true })

    // init 幂等（alreadyManaged）
    expect(initKnowledgeGit(root)).toEqual({ success: true, alreadyManaged: true, branch: 'ocean-knowledge', hasCommits: true })

    // 基线内容（init 的 add -A 已含 k1）
    expect(getKnowledgeBaseline(root, 'k1')).toEqual({ success: true, content: '---\nname: k1\nstatus: validated\n---\n正文 v1' })
    expect(getKnowledgeBaseline(root, 'no-file')).toEqual({ success: true, content: null })

    // 无变更提交 → noChanges
    const nc = commitKnowledgeGit(root, 'k1', '')
    expect(nc.success).toBe(true)
    expect((nc as { noChanges?: boolean }).noChanges).toBe(true)
    expect((nc as { message?: string }).message).toMatch(/^chore\(knowledge\): \d{14} knowledge card is updated$/)

    // 变更后提交 → hash + log + show
    saveKnowledgeFile(root, 'k1', '正文 v2')
    const c = commitKnowledgeGit(root, 'k1', '审核通过 v2')
    expect(c.success).toBe(true)
    expect(typeof (c as { hash?: string }).hash).toBe('string')
    const log = getKnowledgeGitLog(root, 'k1')
    expect(log.success).toBe(true)
    expect(log.commits.length).toBe(2)
    expect(log.commits[0].subject).toBe('审核通过 v2')
    // 身份来自全局 git 配置或回退（ocean@local/Ocean）——不依赖具体环境值
    expect(log.commits[0].author.length).toBeGreaterThan(0)
    const sha = log.commits[0].hash
    expect(showKnowledgeGitRevision(root, 'k1', sha)).toEqual({ success: true, content: '正文 v2' })

    // 非法 rev / 路径
    expect(showKnowledgeGitRevision(root, 'k1', 'zzzz')).toEqual({ success: false, error: '非法的版本号', content: null })
    expect(showKnowledgeGitRevision(root, '../evil', 'abcd1234')).toEqual({ success: false, error: '非法的知识路径', content: null })

    // rollback：有基线恢复
    saveKnowledgeFile(root, 'k1', '偏离基线的内容')
    expect(rollbackKnowledgeGit(root, 'k1')).toEqual({ success: true, action: 'restored' })
    expect(md('k1')).toBe('正文 v2')

    // rollback：无基线删除（基线提交后新建的文件）
    saveKnowledgeFile(root, 'throwaway', 'x')
    expect(rollbackKnowledgeGit(root, 'throwaway')).toEqual({ success: true, action: 'deleted' })
    expect(fs.existsSync(kn('throwaway.md'))).toBe(false)

    // ghost 文件提交 / 非法路径
    expect(commitKnowledgeGit(root, 'ghost', 'm')).toEqual({ success: false, error: '知识文件不存在' })
    expect(commitKnowledgeGit(root, '../evil', 'm')).toEqual({ success: false, error: '非法的知识路径' })
  })

  it('git config / graph config：缺失 null、写入 JSON 2 空格', () => {
    expect(readKnowledgeGitConfig(root)).toEqual({ success: true, config: null })
    expect(writeKnowledgeGitConfig(root, { enableLlmCommitMessage: true })).toEqual({ success: true })
    expect(readKnowledgeGitConfig(root)).toEqual({ success: true, config: { enableLlmCommitMessage: true } })
    expect(fs.readFileSync(path.join(root, '.ocean', 'knowledge-git.json'), 'utf-8')).toBe('{\n  "enableLlmCommitMessage": true\n}')

    expect(readKnowledgeGraphConfig(root)).toEqual({ success: true, config: null })
    expect(writeKnowledgeGraphConfig(root, { maxNodes: 100 })).toEqual({ success: true })
    expect(readKnowledgeGraphConfig(root)).toEqual({ success: true, config: { maxNodes: 100 } })
  })

  it('模板：save 落 JSON；load 读回；missing = 失败语义', () => {
    expect(saveKnowledgeTemplateFile(root, 'agentic-create', '模板')).toEqual({ success: true })
    expect(readKnowledgeTemplateFile(root, 'agentic-create')).toEqual({ success: true, content: '模板' })
    expect(readKnowledgeTemplateFile(root, 'llm-create')).toEqual({ success: false, content: null })
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, '.ocean', 'template', 'knowledge', 'agentic-create.json'), 'utf-8'))
    expect(onDisk.content).toBe('模板')
    expect(typeof onDisk.updatedAt).toBe('string')
  })
})

describe('CLI 语义组（core/knowledge.ts 行为零变更）', () => {
  it('listKnowledges 目录不存在返回空，且不创建目录（与 GUI 组副作用区分）', () => {
    expect(listKnowledges(root)).toEqual([])
    expect(fs.existsSync(kn())).toBe(false)
  })

  it('createKnowledge：frontmatter（domain 子目录时）+ status pending + 尾换行', () => {
    createKnowledge(root, 'k1', '正文一', { summary: '摘要一', tags: ['t1', 't2'] })
    expect(md('k1')).toBe(`---
name: k1
summary: 摘要一
tags: [t1, t2]
status: pending
---

正文一
`)
    createKnowledge(root, 'backend/api', 'API正文', { summary: 'API摘要', tags: ['api'] })
    expect(md('backend/api')).toBe(`---
name: api
domain: backend
summary: API摘要
tags: [api]
status: pending
---

API正文
`)
  })

  it('createKnowledge create-only：重名抛错', () => {
    createKnowledge(root, 'k1', 'x', { summary: 's', tags: ['t'] })
    expect(() => createKnowledge(root, 'k1', 'y', { summary: 's', tags: ['t'] })).toThrow(/知识已存在: k1/)
  })

  it('readKnowledge 返回原文；ghost 抛 ENOENT 原文', () => {
    createKnowledge(root, 'k1', '正文', { summary: 's', tags: ['t'] })
    expect(readKnowledge(root, 'k1')).toMatch(/^---\nname: k1\n/)
    expect(() => readKnowledge(root, 'ghost')).toThrow(/ENOENT.*\.knowledges\/ghost\.md/)
  })

  it('updateKnowledge：增量合并 + status 回退 pending + description→summary 迁移 + domain 同步', () => {
    saveKnowledgeFile(root, 'legacy', '---\nname: legacy\ndescription: 旧描述\nextra: 保留字段\nstatus: validated\n---\n旧正文')
    updateKnowledge(root, 'legacy', '新正文', { summary: '新摘要' })
    // 字段顺序 = 对象插入序：description 删除后 summary 追加在原 status 之后
    expect(md('legacy')).toBe(`---
name: legacy
extra: 保留字段
status: pending
summary: 新摘要
---

新正文
`)
    // domain 同步：文件移入子目录后 update 写 domain 字段
    saveKnowledgeFile(root, 'mover', '---\nname: mover\nstatus: validated\n---\nx')
    updateKnowledge(root, 'mover', 'y')
    expect(md('mover')).not.toContain('domain')
  })

  it('updateKnowledge ghost 抛错', () => {
    expect(() => updateKnowledge(root, 'ghost', 'x')).toThrow(/知识不存在: ghost/)
  })

  it('delKnowledge ghost 静默且不建目录', () => {
    expect(() => delKnowledge(root, 'ghost')).not.toThrow()
    expect(fs.existsSync(kn())).toBe(false)
  })

  it('domain 管理：create/list 树/search/update（domain 字段刷新）', () => {
    expect(listDomainTree(root)).toEqual([])
    createKnowledgeDomain(root, 'd1')
    createKnowledge(root, 'd1/doc', 'c', { summary: 's', tags: ['t'] })
    const tree = listDomainTree(root)
    expect(tree[0].domain).toBe('d1')
    expect(tree[0].knowledges).toEqual(['d1/doc.md'])
    expect(listDomainSubtree(root, 'd1').knowledges).toEqual(['d1/doc.md'])
    expect(() => listDomainSubtree(root, 'ghost')).toThrow(/domain 不存在: ghost/)
    expect(searchDomains(root, 'd')).toEqual([{ domain: 'd1', count: 1 }])
    expect(() => createKnowledgeDomain(root, 'd1')).toThrow(/domain 已存在: d1/)

    updateKnowledgeDomain(root, 'd1', 'd2')
    expect(md('d2/doc')).toContain('domain: d2')
    expect(() => updateKnowledgeDomain(root, 'd2', 'd2/sub')).toThrow(/子路径/)
    expect(() => updateKnowledgeDomain(root, 'd2', 'd2')).toThrow(/domain 已存在: d2/) // 重命名为自身：目标已存在
  })

  it('searchKnowledges：仅 status=validated；上下文与 top；跳过 index.md', () => {
    createKnowledge(root, 'val', '独特关键词正文', { summary: 'vs', tags: ['vt'] })
    createKnowledge(root, 'pen', '独特关键词 pending', { summary: 's', tags: ['t'] })
    fs.writeFileSync(kn('index.md'), '---\nstatus: validated\n---\n独特关键词')
    // 初始均为 pending：无命中
    expect(searchKnowledges(root, '独特关键词')).toEqual([])
    // 置 validated
    saveKnowledgeFile(root, 'val', '---\nname: val\nstatus: validated\n---\n独特关键词正文')
    const res = searchKnowledges(root, '独特关键词')
    expect(res.map(r => r.path)).toEqual(['val.md']) // index.md 被跳过
    expect(res[0].name).toBe('val')
    expect(res[0].matches[0].text).toContain('独特关键词')
    // top 截断
    saveKnowledgeFile(root, 'val2', '---\nname: val2\nstatus: validated\n---\n独特关键词 x')
    expect(searchKnowledges(root, '独特关键词', { top: 1 }).length).toBe(1)
    // 空关键词
    expect(searchKnowledges(root, '')).toEqual([])
  })
})
