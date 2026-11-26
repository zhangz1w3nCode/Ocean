import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'
import * as codebases from '../codebases'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('../review.cjs')

describe('codebases core', () => {
  let tmpDir: string

  // 代码库不参与审核队列与版本化：断言基于正式位置；queueBase 仅用于断言「不产生任何队列快照」
  const queueBase = (name: string) => path.join(tmpDir, '.ocean', 'reviewQueue', 'codebases', name)
  const formalDir = (name: string) => path.join(tmpDir, '.ocean', 'codebases', name)
  const readmeOf = (name: string) => path.join(formalDir(name), 'README.md')

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebases-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('create (blank)', () => {
    it('create 直接写正式位置：README 含描述，无 reviewStatus / version，不产生队列快照', async () => {
      const r = await codebases.create(tmpDir, 'demo', { type: 'blank', description: '演示库' })
      expect(r.success).toBe(true)
      const readme = fs.readFileSync(readmeOf('demo'), 'utf-8')
      expect(readme).toContain('# demo')
      expect(readme).toContain('> 演示库')
      expect(readme).not.toMatch(/^reviewStatus:/m)
      expect(readme).not.toMatch(/^version:/m)
      expect(fs.existsSync(queueBase('demo'))).toBe(false)
    })

    it('writes provided content directly as README when given', async () => {
      const r = await codebases.create(tmpDir, 'with-content', { type: 'blank', content: '# 自定义内容\n\n正文第一段' })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(readmeOf('with-content'), 'utf-8')).toBe('# 自定义内容\n\n正文第一段')
    })

    it('rejects duplicate name', async () => {
      const c1 = await codebases.create(tmpDir, 'demo', { type: 'blank' })
      expect(c1.success).toBe(true)
      const c2 = await codebases.create(tmpDir, 'demo', { type: 'blank' })
      expect(c2.success).toBe(false)
    })

    it('rejects invalid names', async () => {
      for (const bad of ['', '..', '.', 'a/b', 'a\\b', '.hidden', 'a b']) {
        const r = await codebases.create(tmpDir, bad, { type: 'blank' })
        expect(r.success).toBe(false)
      }
    })
  })

  describe('create (local)', () => {
    it('copies source directory and keeps existing README', async () => {
      const src = path.join(tmpDir, 'src-project')
      fs.mkdirSync(src, { recursive: true })
      fs.writeFileSync(path.join(src, 'README.md'), '# 原项目\n原有内容', 'utf-8')
      fs.writeFileSync(path.join(src, 'a.txt'), 'hello', 'utf-8')

      const r = await codebases.create(tmpDir, 'copied', { type: 'local', sourcePath: src })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(path.join(formalDir('copied'), 'README.md'), 'utf-8')).toBe('# 原项目\n原有内容')
      expect(fs.readFileSync(path.join(formalDir('copied'), 'a.txt'), 'utf-8')).toBe('hello')
    })

    it('generates default README when source has none', async () => {
      const src = path.join(tmpDir, 'no-readme')
      fs.mkdirSync(src, { recursive: true })
      fs.writeFileSync(path.join(src, 'code.js'), 'x', 'utf-8')

      const r = await codebases.create(tmpDir, 'copied2', { type: 'local', sourcePath: src })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(readmeOf('copied2'), 'utf-8')).toContain('# copied2')
    })

    it('rejects missing source path', async () => {
      const r = await codebases.create(tmpDir, 'x', { type: 'local', sourcePath: path.join(tmpDir, 'nope') })
      expect(r.success).toBe(false)
    })

    it('rejects source that is a file', async () => {
      const f = path.join(tmpDir, 'file.txt')
      fs.writeFileSync(f, 'x', 'utf-8')
      const r = await codebases.create(tmpDir, 'x', { type: 'local', sourcePath: f })
      expect(r.success).toBe(false)
    })
  })

  describe('create (url)', () => {
    it('clones a local git repository', async () => {
      const srcRepo = path.join(tmpDir, 'origin-repo')
      fs.mkdirSync(srcRepo, { recursive: true })
      fs.writeFileSync(path.join(srcRepo, 'README.md'), '# 远程项目\nclone 内容', 'utf-8')
      execSync('git init -b main', { cwd: srcRepo })
      execSync('git add .', { cwd: srcRepo })
      execSync('git -c user.name=t -c user.email=t@t commit -m init', { cwd: srcRepo })

      const r = await codebases.create(tmpDir, 'cloned', { type: 'url', url: srcRepo })
      expect(r.success).toBe(true)
      expect(fs.readFileSync(readmeOf('cloned'), 'utf-8')).toContain('clone 内容')
    })

    it('cleans up target directory on clone failure', async () => {
      const r = await codebases.create(tmpDir, 'bad', { type: 'url', url: path.join(tmpDir, 'not-a-repo') })
      expect(r.success).toBe(false)
      expect(fs.existsSync(formalDir('bad'))).toBe(false)
      expect(fs.existsSync(queueBase('bad'))).toBe(false)
    })
  })

  describe('list / read', () => {
    it('returns empty list when directory absent', async () => {
      const r = await codebases.list(tmpDir)
      expect(r.success).toBe(true)
      if (r.success) expect(r.codebases).toEqual([])
    })

    it('lists codebases with readme preview, sorted by name（创建后立即可见，无需审核）', async () => {
      await codebases.create(tmpDir, 'beta', { type: 'blank' })
      await codebases.create(tmpDir, 'alpha', { type: 'blank', description: '描述甲' })
      const r = await codebases.list(tmpDir)
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.codebases.map(c => c.name)).toEqual(['alpha', 'beta'])
        const alpha = r.codebases.find(c => c.name === 'alpha')
        expect(alpha?.preview).toContain('描述甲')
      }
    })

    it('reads readme content by name（创建后立即可读，无需审核）', async () => {
      await codebases.create(tmpDir, 'demo', { type: 'blank', description: '描述' })
      const r = await codebases.read(tmpDir, 'demo')
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.name).toBe('demo')
        expect(r.content).toContain('# demo')
        expect(r.content).toContain('> 描述')
      }
    })

    it('rejects read of missing codebase', async () => {
      const r = await codebases.read(tmpDir, 'ghost')
      expect(r.success).toBe(false)
    })
  })

  describe('update', () => {
    it('update 直接覆写正式 README，不产生队列快照', async () => {
      await codebases.create(tmpDir, 'demo', { type: 'blank' })
      const r = await codebases.update(tmpDir, 'demo', '# 新内容\n完全替换')
      expect(r.success).toBe(true)
      expect(fs.readFileSync(readmeOf('demo'), 'utf-8')).toBe('# 新内容\n完全替换')
      expect(fs.existsSync(queueBase('demo'))).toBe(false)
    })

    it('rejects update of missing codebase', async () => {
      const r = await codebases.update(tmpDir, 'ghost', 'x')
      expect(r.success).toBe(false)
    })
  })

  describe('delete', () => {
    it('removes the directory', async () => {
      await codebases.create(tmpDir, 'demo', { type: 'blank' })
      const r = await codebases.del(tmpDir, 'demo')
      expect(r.success).toBe(true)
      expect(fs.existsSync(formalDir('demo'))).toBe(false)
    })

    it('rejects delete of missing codebase', async () => {
      const r = await codebases.del(tmpDir, 'ghost')
      expect(r.success).toBe(false)
    })
  })

  describe('不参与审核队列与版本化', () => {
    it('review 命令不接受 codebase 类型', () => {
      review.gitInit(tmpDir)
      const r = review.approveAsset(tmpDir, 'codebase', 'demo')
      expect(r.success).toBe(false)
      expect(r.error).toContain('未知的资产类型')
      const q = review.listQueue(tmpDir)
      expect(q.items.some((i: { type: string }) => i.type === 'codebase')).toBe(false)
    })

    it('直改收编（adoptStrayEdits）不扫描 codebases 目录', async () => {
      await codebases.create(tmpDir, 'demo', { type: 'blank', content: 'v1' })
      review.gitInit(tmpDir)
      await codebases.update(tmpDir, 'demo', '直接修改后的内容')
      const ad = review.adoptStrayEdits(tmpDir)
      expect(ad.success).toBe(true)
      expect((ad.adopted || []).length).toBe(0)
      expect(fs.readFileSync(readmeOf('demo'), 'utf-8')).toBe('直接修改后的内容')
      expect(fs.existsSync(queueBase('demo'))).toBe(false)
    })
  })

  describe('IO 异常收敛统一契约', () => {
    it('create 收敛非法 root 的 IO 异常(不抛 rejection)', async () => {
      // 用文件路径作 root：mkdirSync 将抛 ENOTDIR，应返回 success:false 而非 reject
      const fileAsRoot = path.join(tmpDir, 'not-a-dir')
      fs.writeFileSync(fileAsRoot, 'x', 'utf-8')
      const r = await codebases.create(fileAsRoot, 'demo', { type: 'blank' })
      expect(r.success).toBe(false)
      if (!r.success) expect(r.error).toContain('IO 错误')
    })

    it('list 对非法 root 返回契约结果(不以 rejection 冒泡)', async () => {
      const fileAsRoot = path.join(tmpDir, 'not-a-dir')
      fs.writeFileSync(fileAsRoot, 'x', 'utf-8')
      const r = await codebases.list(fileAsRoot)
      expect(typeof r.success).toBe('boolean')
    })

    it('update 收敛只读目录的 IO 异常', async () => {
      await codebases.create(tmpDir, 'demo', { type: 'blank' })
      // 让正式 README 只读：直接覆写将抛 EACCES，应收敛为 success:false
      const rp = readmeOf('demo')
      fs.chmodSync(rp, 0o444)
      try {
        const r = await codebases.update(tmpDir, 'demo', 'x')
        expect(r.success).toBe(false)
      } finally {
        fs.chmodSync(rp, 0o644)
      }
    })
  })

  describe('search', () => {
    it('finds matches with line numbers and context', async () => {
      const src = path.join(tmpDir, 's')
      fs.mkdirSync(src, { recursive: true })
      fs.writeFileSync(path.join(src, 'README.md'), '# A\n目标词第一处\n中间行\n目标词第二处', 'utf-8')
      await codebases.create(tmpDir, 'one', { type: 'local', sourcePath: src })
      await codebases.create(tmpDir, 'two', { type: 'blank' })

      const r = await codebases.search(tmpDir, '目标词', { top: 5, context: 1 })
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.results.length).toBe(1)
        expect(r.results[0].name).toBe('one')
        expect(r.results[0].matches.length).toBeGreaterThanOrEqual(2)
        expect(r.results[0].matches[0].line).toBe(2)
        expect(r.results[0].matches[0].text).toContain('目标词')
        expect(r.results[0].matches[0].after).toEqual(['中间行'])
      }
    })

    it('rejects empty keyword', async () => {
      const r = await codebases.search(tmpDir, '   ')
      expect(r.success).toBe(false)
    })

    it('returns empty when no match', async () => {
      await codebases.create(tmpDir, 'demo', { type: 'blank' })
      const r = await codebases.search(tmpDir, '不存在的词xyz')
      expect(r.success).toBe(true)
      if (r.success) expect(r.results).toEqual([])
    })
  })
})
