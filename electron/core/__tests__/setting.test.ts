// 设置域测试 —— CLI 安装 / 可执行文件检查（自 llm.test.ts 拆分，测试逻辑零变更）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  testExecutablePath,
  checkCliInstalled,
  installCli,
} from '../../core/common'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-setting-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('testExecutablePath', () => {
  it('/bin/ls → 存在且可执行', () => {
    const r = testExecutablePath('/bin/ls')
    expect(r).toEqual({ success: true, exists: true, isExecutable: true, path: '/bin/ls' })
  })

  it('不存在 → {success:false, error:"文件不存在"}', () => {
    expect(testExecutablePath('/nonexistent/ocean-x')).toEqual({ success: false, error: '文件不存在' })
  })
})

describe('checkCliInstalled（真实环境，字段结构断言）', () => {
  it('返回 installed/working/version/commandPath/wrapperPath 结构', () => {
    const r = checkCliInstalled()
    expect(typeof r.installed).toBe('boolean')
    expect(typeof r.working).toBe('boolean')
    expect('version' in r).toBe(true)
    expect('commandPath' in r).toBe(true)
    expect(r.wrapperPath).toBe(r.commandPath)
  })
})

describe('installCli（参数注入三分支）', () => {
  let home: string
  let oceanJs: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-installcli-home-'))
    oceanJs = path.join(root, 'ocean.js')
    fs.writeFileSync(oceanJs, '// cli', 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('ocean.js 未找到 → 失败且提示编译', () => {
    const r = installCli(path.join(root, 'nope.js'), null, { homeDir: home, globalBins: [] })
    expect(r.success).toBe(false)
    expect((r as any).error).toContain('ocean.js 未找到')
  })

  it('全局 bin 可写 → 直接安装（wrapper 内容 + 0755）', () => {
    const globalBin = path.join(root, 'globalbin')
    fs.mkdirSync(globalBin, { recursive: true })
    const r = installCli(oceanJs, null, { homeDir: home, globalBins: [globalBin] })
    expect(r.success).toBe(true)
    expect((r as any).path).toBe(path.join(globalBin, 'ocean'))
    expect((r as any).note).toContain('已全局安装')
    const wrapper = fs.readFileSync(path.join(globalBin, 'ocean'), 'utf-8')
    expect(wrapper).toMatch(/^#!\/bin\/sh\nexec ".*node" ".*ocean\.js" "\$@"\n$/)
    expect(fs.statSync(path.join(globalBin, 'ocean')).mode & 0o111).not.toBe(0)
  })

  it('全局 bin 不可写 → 回退 ~/.ocean/bin 并写 rc 文件', () => {
    // 用一个不存在的全局 bin 目录（fs.existsSync false → 跳过）+ 不存在的第二候选
    const r = installCli(oceanJs, null, { homeDir: home, globalBins: [path.join(root, 'not-exist-bin')] })
    expect(r.success).toBe(true)
    expect((r as any).path).toBe(path.join(home, '.ocean', 'bin', 'ocean'))
    expect((r as any).note).toContain('已安装并自动配置 PATH')
    const rc = fs.readFileSync(path.join(home, '.zshrc'), 'utf-8')
    expect(rc).toContain('export PATH="$HOME/.ocean/bin:$PATH"')
  })

  it('rc 文件已含 PATH 配置 → 不重复追加', () => {
    fs.writeFileSync(path.join(home, '.zshrc'), '# 已有配置\nexport PATH="$HOME/.ocean/bin:$PATH"\n', 'utf-8')
    installCli(oceanJs, null, { homeDir: home, globalBins: [] })
    const rc = fs.readFileSync(path.join(home, '.zshrc'), 'utf-8')
    expect(rc.match(/\.ocean\/bin/g)?.length).toBe(1)
  })

  it('projectPath 非空 → 写 cli-root', () => {
    installCli(oceanJs, root, { homeDir: home, globalBins: [] })
    expect(fs.readFileSync(path.join(home, '.ocean', 'cli-root'), 'utf-8')).toBe(root)
  })

  it('projectPath 为 null → 不写 cli-root', () => {
    installCli(oceanJs, null, { homeDir: home, globalBins: [] })
    expect(fs.existsSync(path.join(home, '.ocean', 'cli-root'))).toBe(false)
  })
})
