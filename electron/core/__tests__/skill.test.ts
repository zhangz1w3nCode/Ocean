import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  createSkillDirectory,
  saveSkillFile,
  readSkillFile,
  deleteSkillDirectory,
  listSkillDirectories,
  saveSkillResource,
  readSkillResource,
  deleteSkillResource,
  listSkillResourceFiles,
  saveSkillTemplateFile,
  readSkillTemplateFile,
} from '../../core/common'
import {
  listSkills,
  readSkill,
  createSkill,
  updateSkill,
  delSkill,
} from '../../source/cli/skill'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-skill-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const skillsDir = (): string => path.join(root, '.claude', 'skills')
const skillMd = (name: string): string => path.join(skillsDir(), name, 'SKILL.md')
const read = (name: string): string => fs.readFileSync(skillMd(name), 'utf-8')

describe('GUI 语义组（launch.cjs skill IPC 契约复刻）', () => {
  it('listSkillDirectories：目录不存在返回空数组，且创建 .claude/skills 目录（getSkillsDir 副作用）', () => {
    expect(listSkillDirectories(root)).toEqual({ success: true, directories: [] })
    expect(fs.existsSync(skillsDir())).toBe(true)
  })

  it('createSkillDirectory 完整输入：SKILL.md 无尾换行、建三个子目录、资源文件落盘', () => {
    const res = createSkillDirectory(root, 's1', {
      description: '描述一',
      content: '正文内容',
      scripts: [{ name: 'run.sh', content: 'echo hi' }],
      references: [{ name: 'ref.md', content: '参考资料' }],
      examples: [{ name: 'ex.md', content: '示例' }],
    })
    expect(res).toEqual({ success: true })
    expect(read('s1')).toBe(`---
name: s1
description: 描述一
---
正文内容`)
    for (const d of ['scripts', 'references', 'examples']) {
      expect(fs.existsSync(path.join(skillsDir(), 's1', d))).toBe(true)
    }
    expect(fs.readFileSync(path.join(skillsDir(), 's1', 'scripts', 'run.sh'), 'utf-8')).toBe('echo hi')
  })

  it('createSkillDirectory 重名：{success:false, error}（文案不含技能名，与 CLI 组差异）', () => {
    createSkillDirectory(root, 's1', { description: 'd', content: 'x' })
    expect(createSkillDirectory(root, 's1', { description: 'd', content: 'y' })).toEqual({
      success: false,
      error: '技能目录已存在',
    })
  })

  it('createSkillDirectory 缺 description：无校验，落空值行（与 CLI 组的必填校验相反）', () => {
    expect(createSkillDirectory(root, 'nodesc', { content: 'x' })).toEqual({ success: true })
    expect(read('nodesc')).toBe(`---
name: nodesc
description: 
---
x`)
  })

  it('createSkillDirectory null 输入：系统异常向上抛（desktop 壳 catch 兜底，旧行为 TypeError 拒绝）', () => {
    expect(() => createSkillDirectory(root, 'x', null as any)).toThrow(TypeError)
  })

  it('saveSkillFile 是 upsert：目录不存在只建 skillDir（无子目录），content 原样哑写', () => {
    expect(saveSkillFile(root, 's2', '---\nname: s2\n---\nbody')).toEqual({ success: true })
    expect(fs.readdirSync(path.join(skillsDir(), 's2'))).toEqual(['SKILL.md'])
    expect(saveSkillFile(root, 's2', 'new raw')).toEqual({ success: true })
    expect(read('s2')).toBe('new raw')
  })

  it('readSkillFile 文件不存在返回 content:null 而非失败', () => {
    const res = readSkillFile(root, 'ghost')
    expect(res.success).toBe(true)
    expect(res.content).toBeNull()
    expect(res.mtime).toBeNull()
  })

  it('readSkillFile 存在返回原文与 mtime', () => {
    saveSkillFile(root, 'a', 'raw md')
    const res = readSkillFile(root, 'a')
    expect(res.success).toBe(true)
    expect(res.content).toBe('raw md')
    expect(typeof res.mtime).toBe('string')
  })

  it('listSkillDirectories 返回目录名（readdirSync 原始顺序，APFS 为字母序）', () => {
    saveSkillFile(root, 'zeta', 'z')
    saveSkillFile(root, 'alpha', 'a')
    expect(listSkillDirectories(root)).toEqual({ success: true, directories: ['alpha', 'zeta'] })
  })

  it('deleteSkillDirectory 目录不存在静默成功', () => {
    expect(deleteSkillDirectory(root, 'ghost')).toEqual({ success: true })
  })

  it('saveSkillResource 副作用最重：建 skillDir+subDir 两层', () => {
    expect(saveSkillResource(root, 'newskill', 'scripts', 'a.sh', 'x')).toEqual({ success: true })
    expect(fs.readdirSync(path.join(skillsDir(), 'newskill'))).toEqual(['scripts'])
  })

  it('listSkillResourceFiles 子目录不存在返回 files:[] 且不建子目录', () => {
    saveSkillResource(root, 's1', 'scripts', 'a.sh', 'x')
    expect(listSkillResourceFiles(root, 's1', 'references')).toEqual({ success: true, files: [] })
    expect(fs.existsSync(path.join(skillsDir(), 's1', 'references'))).toBe(false)
  })

  it('readSkillResource / deleteSkillResource：ghost 文件 null / 静默成功', () => {
    saveSkillResource(root, 's1', 'scripts', 'a.sh', 'echo x')
    expect(readSkillResource(root, 's1', 'scripts', 'a.sh')).toEqual({ success: true, content: 'echo x' })
    expect(readSkillResource(root, 's1', 'scripts', 'nope.sh').content).toBeNull()
    expect(deleteSkillResource(root, 's1', 'scripts', 'nope.sh')).toEqual({ success: true })
    expect(deleteSkillResource(root, 's1', 'scripts', 'a.sh')).toEqual({ success: true })
    expect(listSkillResourceFiles(root, 's1', 'scripts')).toEqual({ success: true, files: [] })
  })

  it('模板文件：save 落 JSON {content, updatedAt}；load 读回；missing = {success:false, content:null}', () => {
    expect(saveSkillTemplateFile(root, 'llm-create', '模板内容A')).toEqual({ success: true })
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, '.ocean', 'template', 'skill', 'llm-create.json'), 'utf-8'))
    expect(onDisk.content).toBe('模板内容A')
    expect(typeof onDisk.updatedAt).toBe('string')
    expect(readSkillTemplateFile(root, 'llm-create')).toEqual({ success: true, content: '模板内容A' })
    expect(readSkillTemplateFile(root, 'agentic-create')).toEqual({ success: false, content: null })
  })

  it('模板文件不随 assetRoot 变化（固定 .ocean/template/skill/）', () => {
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), JSON.stringify({ assetRoot: 'pi' }))
    saveSkillTemplateFile(root, 'llm-create', 'tpl')
    expect(readSkillTemplateFile(root, 'llm-create')).toEqual({ success: true, content: 'tpl' })
    expect(fs.existsSync(path.join(root, '.ocean', 'template', 'skill', 'llm-create.json'))).toBe(true)
  })

  it('assetRoot=pi：load-all 立即切 .pi/skills（.claude 保留），create 落 .pi', () => {
    saveSkillFile(root, 'old', 'x') // .claude/skills 已有内容
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), JSON.stringify({ assetRoot: 'pi' }))
    expect(listSkillDirectories(root)).toEqual({ success: true, directories: [] })
    expect(fs.existsSync(path.join(root, '.pi', 'skills'))).toBe(true)
    expect(fs.existsSync(path.join(skillsDir(), 'old', 'SKILL.md'))).toBe(true)
    createSkillDirectory(root, 'pi-s1', { description: 'pi 下', content: 'x' })
    expect(fs.readFileSync(path.join(root, '.pi', 'skills', 'pi-s1', 'SKILL.md'), 'utf-8')).toBe(`---
name: pi-s1
description: pi 下
---
x`)
  })
})

describe('CLI 语义组（core/skill.ts 行为零变更）', () => {
  it('listSkills 目录不存在返回空，且不创建目录（与 GUI 组副作用区分）', () => {
    expect(listSkills(root)).toEqual([])
    expect(fs.existsSync(skillsDir())).toBe(false)
  })

  it('createSkill：SKILL.md 有尾换行 + frontmatter + 三个子目录', () => {
    createSkill(root, 's1', '正文内容', '描述一')
    expect(read('s1')).toBe(`---
name: s1
description: 描述一
---
正文内容
`)
    for (const d of ['scripts', 'references', 'examples']) {
      expect(fs.existsSync(path.join(skillsDir(), 's1', d))).toBe(true)
    }
  })

  it('createSkill description 必填（先于重名检查）', () => {
    expect(() => createSkill(root, 's1', 'x', '')).toThrow(/技能描述为必填项/)
    expect(() => createSkill(root, 's1', 'x', undefined as any)).toThrow(/技能描述为必填项/)
    expect(fs.existsSync(skillsDir())).toBe(false)
  })

  it('createSkill create-only：重名抛错（exit 1 语义，文案含技能名）', () => {
    createSkill(root, 's1', 'x', 'd')
    expect(() => createSkill(root, 's1', 'y', 'd')).toThrow(/技能目录已存在: s1/)
  })

  it('readSkill 返回原文（含 frontmatter）；ghost 抛 ENOENT 原文', () => {
    createSkill(root, 's1', '正文', '描述')
    expect(readSkill(root, 's1')).toMatch(/^---\nname: s1\ndescription: 描述\n---\n正文\n$/)
    expect(() => readSkill(root, 'ghost')).toThrow(/ENOENT.*\.claude\/skills\/ghost\/SKILL\.md/)
  })

  it('updateSkill 增量更新：frontmatter 字段与顺序保留，仅替换正文', () => {
    createSkill(root, 's1', '旧正文', '描述一')
    updateSkill(root, 's1', '新正文')
    expect(read('s1')).toBe(`---
name: s1
description: 描述一
---
新正文
`)
  })

  it('updateSkill ghost 抛错', () => {
    expect(() => updateSkill(root, 'ghost', 'x')).toThrow(/技能不存在: ghost/)
  })

  it('delSkill ghost 静默成功且不创建目录', () => {
    expect(() => delSkill(root, 'ghost')).not.toThrow()
    expect(fs.existsSync(skillsDir())).toBe(false)
  })

  it('listSkills 排序', () => {
    createSkill(root, 'zeta', 'z', 'zd')
    createSkill(root, 'alpha', 'a', 'ad')
    expect(listSkills(root)).toEqual(['alpha', 'zeta'])
  })

  it('createSkill assetRoot=pi 时落 .pi/skills', () => {
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), JSON.stringify({ assetRoot: 'pi' }))
    createSkill(root, 'pi-skill', 'x', 'pd')
    expect(fs.existsSync(path.join(root, '.pi', 'skills', 'pi-skill', 'SKILL.md'))).toBe(true)
  })
})
