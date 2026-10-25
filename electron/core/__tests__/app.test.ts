import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import {
  readAppConfig,
  writeAppConfig,
  readGeneralSettings,
  writeGeneralSettings,
  initProjectDirs,
  projectIdentity,
  syncProjectState,
  readAssetRoot,
  writeAssetRoot,
} from '../../core/common'

let root: string
let homeBak: string | undefined

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-app-'))
  // syncProjectState 写 ~/.ocean/cli-root（os.homedir 读 HOME），测试内重定向
  homeBak = process.env.HOME
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-app-home-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  if (homeBak !== undefined) process.env.HOME = homeBak
})

const projectIdOf = (p: string) => crypto.createHash('md5').update(p).digest('hex').slice(0, 16)

describe('应用配置（userData/flow-editor-config.json，路径由壳层传入）', () => {
  it('readAppConfig 无文件 → 默认配置', () => {
    const r = readAppConfig(root)
    expect(r).toEqual({
      success: true,
      config: { recentProjects: [], lastProjectPath: null, maxRecentProjects: 10 },
    })
  })

  it('writeAppConfig → readAppConfig 读回一致（JSON 缩进落盘）', () => {
    const cfg = { recentProjects: ['/tmp/a'], lastProjectPath: '/tmp/a', maxRecentProjects: 3 }
    expect(writeAppConfig(root, cfg)).toEqual({ success: true })
    expect(readAppConfig(root).config).toEqual(cfg)
    const disk = fs.readFileSync(path.join(root, 'flow-editor-config.json'), 'utf-8')
    expect(disk).toBe(JSON.stringify(cfg, null, 2))
  })

  it('readAppConfig 坏 JSON → 抛异常（壳 catch 兜底为带默认 config 的失败契约）', () => {
    fs.writeFileSync(path.join(root, 'flow-editor-config.json'), '{bad', 'utf-8')
    expect(() => readAppConfig(root)).toThrow(SyntaxError)
  })

  it('writeAppConfig 循环引用 → 抛异常（壳 catch 兜底）', () => {
    const circular: any = {}
    circular.self = circular
    expect(() => writeAppConfig(root, circular)).toThrow(TypeError)
  })
})

describe('通用设置（项目级 .ocean/setting/general.json，raw root 判空契约）', () => {
  it('readGeneralSettings 未设项目 → {success:false, error, settings:null}', () => {
    expect(readGeneralSettings(null)).toEqual({
      success: false,
      error: '未设置项目路径',
      settings: null,
    })
  })

  it('readGeneralSettings 无文件 → {success:true, settings:{}}（不创建文件与目录）', () => {
    const r = readGeneralSettings(root)
    expect(r).toEqual({ success: true, settings: {} })
    expect(fs.existsSync(path.join(root, '.ocean'))).toBe(false)
  })

  it('writeGeneralSettings 未设项目 → 失败', () => {
    expect(writeGeneralSettings(null, {})).toEqual({ success: false, error: '未设置项目路径' })
  })

  it('writeGeneralSettings 建目录落盘 → 读回一致', () => {
    expect(writeGeneralSettings(root, { a: 1, b: 'x' })).toEqual({ success: true })
    expect(fs.existsSync(path.join(root, '.ocean', 'setting', 'general.json'))).toBe(true)
    expect(readGeneralSettings(root).settings).toEqual({ a: 1, b: 'x' })
  })
})

describe('项目初始化与切换', () => {
  it('initProjectDirs 建目录结构（claude 默认：.claude/agents + 5 共享域 + .ocean）', () => {
    const r = initProjectDirs(root)
    expect(r.success).toBe(true)
    if (!r.success) throw new Error('unreachable')
    expect(r.projectId).toBe(projectIdOf(root))
    expect(r.projectName).toBe(path.basename(root))
    for (const d of ['.claude/agents', '.knowledges', '.resources', '.nodes', '.workflows', '.ocean']) {
      expect(fs.existsSync(path.join(root, d))).toBe(true)
    }
  })

  it('initProjectDirs assetRoot=pi → .pi/agents', () => {
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), JSON.stringify({ assetRoot: 'pi' }), 'utf-8')
    initProjectDirs(root)
    expect(fs.existsSync(path.join(root, '.pi', 'agents'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false)
  })

  it('initProjectDirs 幂等（已存在的目录不报错）', () => {
    initProjectDirs(root)
    expect(() => initProjectDirs(root)).not.toThrow()
  })

  it('projectIdentity → projectId（md5 前 16 hex）与 projectName', () => {
    expect(projectIdentity(root)).toEqual({
      success: true,
      projectId: projectIdOf(root),
      projectName: path.basename(root),
    })
    expect(projectIdOf(root)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('syncProjectState 写 HOME/.ocean/cli-root', () => {
    syncProjectState(root)
    expect(fs.readFileSync(path.join(process.env.HOME!, '.ocean', 'cli-root'), 'utf-8')).toBe(root)
  })

  it('syncProjectState 数据迁移：.workflow-maker → .claude（旧目录存在且新目录不存在时）', () => {
    fs.mkdirSync(path.join(root, '.workflow-maker'), { recursive: true })
    fs.writeFileSync(path.join(root, '.workflow-maker', 'x.md'), '旧数据')
    syncProjectState(root)
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(true)
    expect(fs.existsSync(path.join(root, '.workflow-maker'))).toBe(false)
    expect(fs.readFileSync(path.join(root, '.claude', 'x.md'), 'utf-8')).toBe('旧数据')
  })

  it('syncProjectState 已有 .claude 时不迁移（保护现有数据）', () => {
    fs.mkdirSync(path.join(root, '.workflow-maker'), { recursive: true })
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    syncProjectState(root)
    expect(fs.existsSync(path.join(root, '.workflow-maker'))).toBe(true)
  })
})

describe('资产加载来源（.ocean/asset-root.json，特例兜底契约）', () => {
  it('readAssetRoot 未设项目 → success:true + claude（错误不算失败的特例契约）', () => {
    expect(readAssetRoot(null)).toEqual({ success: true, assetRoot: 'claude' })
  })

  it('readAssetRoot 无配置文件 → claude', () => {
    expect(readAssetRoot(root)).toEqual({ success: true, assetRoot: 'claude' })
  })

  it('readAssetRoot 正常读 pi', () => {
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), JSON.stringify({ assetRoot: 'pi' }), 'utf-8')
    expect(readAssetRoot(root)).toEqual({ success: true, assetRoot: 'pi' })
  })

  it('readAssetRoot 空值 → claude 兜底', () => {
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), JSON.stringify({}), 'utf-8')
    expect(readAssetRoot(root)).toEqual({ success: true, assetRoot: 'claude' })
  })

  it('readAssetRoot 坏 JSON → catch 兜底 claude（success:true 特例）', () => {
    fs.mkdirSync(path.join(root, '.ocean'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ocean', 'asset-root.json'), '{bad', 'utf-8')
    expect(readAssetRoot(root)).toEqual({ success: true, assetRoot: 'claude' })
  })

  it('writeAssetRoot 未设项目 → 失败', () => {
    expect(writeAssetRoot(null, 'pi')).toEqual({ success: false, error: '未设置项目路径' })
  })

  it('writeAssetRoot 建 .ocean 落盘 → 读回 pi', () => {
    expect(writeAssetRoot(root, 'pi')).toEqual({ success: true })
    expect(JSON.parse(fs.readFileSync(path.join(root, '.ocean', 'asset-root.json'), 'utf-8'))).toEqual({ assetRoot: 'pi' })
    expect(readAssetRoot(root).assetRoot).toBe('pi')
  })
})
