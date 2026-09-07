import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  addResource,
  baseDir,
  create,
  del,
  deleteResource,
  list,
  listResources,
  read,
  readResource,
  update,
} from './skill'

// baseDir 依赖 resolveAssetDir：无 .ocean/asset-root.json 时为 '.claude'
let root: string
let skills: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-skill-'))
  skills = baseDir(root)
  fs.mkdirSync(skills, { recursive: true })
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const mk = (name: string, attachments = {}) =>
  create(root, name, '正文主体', '描述', attachments as any)

const goodAttach = () => ({
  references: [{ name: 'r1.md', content: 'R1\n' }],
  examples: [{ name: 'e1.md', content: 'E1\n' }],
})

describe('创建：happy path 与逐字节一致', () => {
  it('三类附件各自落到参数名对应子目录，内容原样', () => {
    mk('ok', {
      references: [{ name: 'r1.md', content: 'R1\n' }, { name: 'r2.md', content: 'R2\n' }],
      examples: [{ name: 'e1.md', content: 'E1\n' }],
      scripts: [{ name: 's1.sh', content: '#!/bin/sh\n' }],
    })
    const d = path.join(skills, 'ok')
    expect(fs.readFileSync(path.join(d, 'references', 'r1.md'), 'utf-8')).toBe('R1\n')
    expect(fs.readFileSync(path.join(d, 'references', 'r2.md'), 'utf-8')).toBe('R2\n')
    expect(fs.readFileSync(path.join(d, 'examples', 'e1.md'), 'utf-8')).toBe('E1\n')
    expect(fs.readFileSync(path.join(d, 'scripts', 's1.sh'), 'utf-8')).toBe('#!/bin/sh\n')
  })

  it('SKILL.md frontmatter 为 name + description', () => {
    mk('fm')
    const raw = fs.readFileSync(path.join(skills, 'fm', 'SKILL.md'), 'utf-8')
    expect(raw.startsWith('---\nname: fm\ndescription: 描述\n---\n')).toBe(true)
  })

  it('不传附件时三个子目录仍被创建（与 GUI create-skill-directory 一致）', () => {
    mk('bare')
    const d = path.join(skills, 'bare')
    for (const sub of ['scripts', 'references', 'examples']) {
      expect(fs.existsSync(path.join(d, sub))).toBe(true)
    }
  })
})

describe('校验不对称修复（P2-1）：两条路径都要求附件内容非空', () => {
  it('create 带空内容附件被拒', () => {
    expect(() => mk('e1', { references: [{ name: 'x.md', content: '' }], examples: [{ name: 'e.md', content: 'E' }] }))
      .toThrow(/内容为空/)
  })

  it('create 带纯空白附件被拒', () => {
    expect(() => mk('e2', { references: [{ name: 'x.md', content: '   \n  ' }], examples: [{ name: 'e.md', content: 'E' }] }))
      .toThrow(/内容为空/)
  })

  it('create 附件 content 缺省时被拒且不崩溃', () => {
    expect(() => mk('e3', { references: [{ name: 'x.md' } as any,], examples: [{ name: 'e.md', content: 'E' }] }))
      .toThrow(/内容为空/)
  })

  it('addResource 空内容同样被拒（与 create 对称）', () => {
    mk('s1', goodAttach())
    expect(() => addResource(root, 's1', 'references', 'blank.md', '   ')).toThrow(/必填/)
  })

  it('失败后不留半成品目录', () => {
    try {
      mk('rb', { references: [{ name: 'bad.md', content: '   ' }], examples: [{ name: 'e.md', content: 'E' }] })
    } catch { /* expected */ }
    expect(fs.existsSync(path.join(skills, 'rb'))).toBe(false)
  })
})

describe('路径越界防护', () => {
  it('拒绝含路径分隔符、. 与 .. 的附件文件名', () => {
    for (const bad of ['../evil.md', 'sub/a.md', '.', '..', '..\\evil.md']) {
      expect(() => mk('n' + Buffer.from(bad).toString('hex').slice(0, 6), {
        references: [{ name: bad, content: 'X' }],
        examples: [{ name: 'e.md', content: 'E' }],
      })).toThrow(/文件名非法|存在空文件名/)
    }
    expect(list(root)).toEqual([])
  })

  it('同类内 basename 重复被拒', () => {
    expect(() => mk('dup', {
      references: [{ name: 'a.md', content: 'A' }, { name: 'a.md', content: 'B' }],
      examples: [{ name: 'e.md', content: 'E' }],
    })).toThrow(/文件名重复/)
  })

  it('非法技能名在 create/read/update/del 全部入口被拒', () => {
    for (const nm of ['../escape', 'a/b', 'a b', 'a.b', '']) {
      expect(() => create(root, nm, '正文', '描述')).toThrow(/技能名称/)
      expect(() => read(root, nm)).toThrow(/技能名称/)
      expect(() => update(root, nm, 'x')).toThrow(/技能名称/)
      expect(() => del(root, nm)).toThrow(/技能名称/)
    }
  })

  it('资源类型只接受 scripts/references/examples', () => {
    mk('ty', goodAttach())
    expect(() => listResources(root, 'ty', 'bogus')).toThrow(/scripts \/ references \/ examples/)
    expect(() => addResource(root, 'ty', 'bogus', 'x.md', 'X')).toThrow(/scripts \/ references \/ examples/)
  })

  it('技能不存在时给出业务文案而非 ENOENT', () => {
    expect(() => read(root, 'ghost')).toThrow(/技能不存在: ghost/)
    expect(() => listResources(root, 'ghost', 'references')).toThrow(/技能不存在: ghost/)
  })
})

describe('符号链接穿透防护（P1-1）', () => {
  it('类型目录被换成指向技能外的符号链接时，读写列删全部被拒', () => {
    mk('sl', goodAttach())
    const skillDir = path.join(skills, 'sl')
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-outside-'))
    try {
      fs.rmSync(path.join(skillDir, 'references'), { recursive: true, force: true })
      fs.symlinkSync(outside, path.join(skillDir, 'references'), 'dir')

      expect(() => addResource(root, 'sl', 'references', 'escaped.md', 'X')).toThrow(/越界/)
      expect(() => readResource(root, 'sl', 'references', 'anything.md')).toThrow(/越界/)
      expect(() => listResources(root, 'sl', 'references')).toThrow(/越界/)
      expect(() => deleteResource(root, 'sl', 'references', 'anything.md')).toThrow(/越界/)

      // 关键：根外目录一个文件都没被写
      expect(fs.readdirSync(outside)).toEqual([])
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('整个技能目录是指向根外的符号链接时也被拒，且不删除根外数据', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-victim-'))
    try {
      fs.writeFileSync(path.join(outside, 'SKILL.md'), '---\nname: v\ndescription: d\n---\nbody\n')
      fs.mkdirSync(path.join(outside, 'references'))
      fs.writeFileSync(path.join(outside, 'references', 'secret.md'), 'SECRET\n')
      fs.symlinkSync(outside, path.join(skills, 'victim'), 'dir')

      expect(() => listResources(root, 'victim', 'references')).toThrow(/越界/)
      expect(() => deleteResource(root, 'victim', 'references', 'secret.md')).toThrow(/越界/)
      expect(fs.existsSync(path.join(outside, 'references', 'secret.md'))).toBe(true)
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('技能目录内的正常符号链接文件仍可读列（不过度收紧）', () => {
    mk('ln', { references: [{ name: 'a.md', content: 'A\n' }], examples: [{ name: 'e.md', content: 'E' }] })
    const refDir = path.join(skills, 'ln', 'references')
    fs.symlinkSync(path.join(refDir, 'a.md'), path.join(refDir, 'link.md'))
    const listed = listResources(root, 'ln', 'references')
    expect(listed).toContain('link.md')
    expect(readResource(root, 'ln', 'references', 'link.md')).toBe('A\n')
  })
})

describe('原子性与幂等', () => {
  it('二次 create 同名被拒且不破坏原目录内容', () => {
    mk('tw', goodAttach())
    const md = path.join(skills, 'tw', 'SKILL.md')
    fs.writeFileSync(md, 'PRECIOUS\n')
    expect(() => mk('tw', goodAttach())).toThrow(/技能目录已存在/)
    expect(fs.readFileSync(md, 'utf-8')).toBe('PRECIOUS\n')
    expect(fs.existsSync(path.join(skills, 'tw', 'references', 'r1.md'))).toBe(true)
  })

  it('写盘阶段失败时回滚，不残留部分产物（用超长名触发写入失败）', () => {
    // 该名字无分隔符、等于自身 basename，能过完全部字面校验，
    // 要到 try 内写盘时才因文件系统上限失败，因此能真正走到回滚分支
    const longName = `${'x'.repeat(300)}.md`
    expect(() => create(root, 'boom', '正文', '描述', {
      references: [{ name: longName, content: 'X' }],
      examples: [{ name: 'e.md', content: 'E' }],
    } as any)).toThrow()
    // 回滚必须把已建出的 skill 目录整体清除
    expect(fs.existsSync(path.join(skills, 'boom'))).toBe(false)
  })

  it('del 幂等：不存在的技能静默成功', () => {
    expect(() => del(root, 'never-existed')).not.toThrow()
  })

  it('resource delete 幂等且不波及同目录其他文件', () => {
    mk('rd', { references: [{ name: 'a.md', content: 'A' }, { name: 'b.md', content: 'B' }], examples: [{ name: 'e.md', content: 'E' }] })
    deleteResource(root, 'rd', 'references', 'a.md')
    expect(listResources(root, 'rd', 'references')).toEqual(['b.md'])
    expect(() => deleteResource(root, 'rd', 'references', 'a.md')).not.toThrow()
  })

  it('resource create 重名被拒且原文件不被覆盖', () => {
    mk('rc', goodAttach())
    expect(() => addResource(root, 'rc', 'references', 'r1.md', 'OVERWRITE')).toThrow(/文件已存在/)
    expect(readResource(root, 'rc', 'references', 'r1.md')).toBe('R1\n')
  })

  it('类型子目录被删后 create 自动重建（对齐 getSkillSubDir）', () => {
    mk('mk2', goodAttach())
    fs.rmSync(path.join(skills, 'mk2', 'scripts'), { recursive: true, force: true })
    addResource(root, 'mk2', 'scripts', 'back.sh', '#!/bin/sh\n')
    expect(readResource(root, 'mk2', 'scripts', 'back.sh')).toBe('#!/bin/sh\n')
  })
})

describe('update 与 CRUD 不互相波及', () => {
  it('update 保留 frontmatter 与附属文件', () => {
    mk('up', { references: [{ name: 'r.md', content: 'R' }], examples: [{ name: 'e.md', content: 'E' }], scripts: [{ name: 's.md', content: 'S' }] })
    update(root, 'up', '新正文')
    const raw = fs.readFileSync(path.join(skills, 'up', 'SKILL.md'), 'utf-8')
    expect(raw.startsWith('---\nname: up\ndescription: 描述\n---\n')).toBe(true)
    expect(raw).toContain('新正文')
    expect(raw).not.toContain('正文主体')
    expect(listResources(root, 'up', 'references')).toEqual(['r.md'])
  })

  it('list 返回排序后的技能名', () => {
    mk('b'); mk('a')
    expect(list(root)).toEqual(['a', 'b'])
  })
})
