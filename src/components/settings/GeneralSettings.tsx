import { useState, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import { Settings, CheckCircle2, AlertCircle, Loader2, Terminal, RefreshCw, FileText } from 'lucide-react'
import { Button } from '../ui/Button'
import { useToastStore } from '../../stores/toastStore'

interface CliCheckResult {
  installed: boolean
  working: boolean
  commandPath: string | null
  wrapperPath: string | null
}

const SKILL_NAME = 'ocean-cli'

const SKILL_CONTENT = `---
name: ocean-cli
description: Ocean CLI 工具。通过 ocean 命令完成完整的自循环：创建资产、编排工作流、实例化执行、查看详情、优化迭代。触发词：执行工作流、跑工作流、ocean 命令、资产管理、创建节点
---

# ocean-cli

## 命令一览

### 工作流执行

| 命令 | 作用 | 是否带 --instance |
|------|------|:---:|
| \`ocean workflow list\` | 列出可用工作流 | 否 |
| \`ocean workflow instance <name>\` | 创建工作流实例，返回 instance-id | 产出 id |
| \`ocean workflow instance list\` | 列出实例 | 否 |
| \`ocean workflow next\` | 拉取下一个节点内容 | 是 |
| \`ocean workflow complete\` | 交产物并推进 | 是 |
| \`ocean workflow fail\` | 标记失败 | 是 |
| \`ocean workflow choose\` | 决策分支选择 | 是 |
| \`ocean workflow status\` | 查看进度 | 是 |
| \`ocean workflow artifact list/view/search/timeline/diff\` | 产物操作 | 是 |
| \`ocean workflow context set/get\` | 上下文操作 | 是 |

### 资产管理

| 命令 | 子命令 | 作用 |
|------|--------|------|
| \`ocean node\` | list/read/create/update/delete | 节点 CRUD |
| \`ocean knowledge\` | list/read/create/update/delete | 知识 CRUD（支持子目录） |
| \`ocean resource\` | list/read/create/update/delete | 资源 CRUD |
| \`ocean agent\` | list/read/create/update/delete | 智能体 CRUD |
| \`ocean skill\` | list/read/create/update/delete | 技能 CRUD |

### 工作流图编辑

| 命令 | 作用 |
|------|------|
| \`ocean workflow create <name>\` | 创建工作流（初始化 start + end） |
| \`ocean workflow add-node <name> --type/--label/--node-ref/--content/--condition\` | 添加节点，返回 node ID |
| \`ocean workflow connect <name> --from <id> --to <id> [--branch <name>]\` | 连接节点 |
| \`ocean workflow add-branch <name> --node <id> --name <name>\` | 添加分支（自动追加"其他"兜底） |
| \`ocean workflow remove-node <name> --node <id>\` | 删除节点 + 关联边 |
| \`ocean workflow disconnect <name> --from <id> --to <id> [--branch <name>]\` | 删除边 |
| \`ocean workflow list-nodes <name>\` | 列出节点表格 |
| \`ocean workflow list-edges <name>\` | 列出边表格 |
| \`ocean workflow read <name>\` | 读 WORKFLOW.md |
| \`ocean workflow read-flow <name>\` | 读 flow.json |
| \`ocean workflow generate <name>\` | 生成 WORKFLOW.md |
| \`ocean workflow doctor <name> [--json]\` | 检查工作流完整性（10 项检查） |
| \`ocean workflow delete <name>\` | 删除工作流 |
| \`ocean workflow rename <old> <new>\` | 重命名工作流 |
| \`ocean workflow local-node list/read/create/delete <wf> [name]\` | 局部节点 CRUD |

### 配置

| 命令 | 作用 |
|------|------|
| \`ocean config asset-root\` | 查询当前资产来源（pi 或 claude） |

## Agent 自循环

1. 创建资产: \`ocean skill/agent/resource/knowledge/node create\`
2. 编排工作流: \`ocean workflow create\` -> \`add-node\` -> \`connect\` -> \`add-branch\` -> \`doctor\` -> \`generate\`
3. 实例化执行: \`ocean workflow instance <name>\` -> \`next\` -> \`complete\`/\`choose\`/\`fail\` 循环
4. 查看详情: \`ocean workflow status\` + \`artifact list/view/diff/timeline\`
5. 优化迭代: \`ocean node/knowledge update\` + \`workflow remove-node/disconnect/add-node/connect\` -> \`doctor\` -> \`generate\` -> 重新实例化

## 关键约定

- 全局 flag: \`--root <path>\` 覆盖项目根
- 内容输入三选一: \`--content "短内容"\` / \`--content-file <path>\` / stdin
- \`ocean workflow doctor\` 检查 10 项完整性（非空/起始/结束/出边/入边/孤立/分支/可达/边引用/文件引用）
- asset/skill 目录随 assetRoot（.pi 或 .claude）自动变化，agent 不需手动判断
`

export const GeneralSettings: FC = () => {
  const { addToast } = useToastStore()
  const [cliStatus, setCliStatus] = useState<CliCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [skillInstalled, setSkillInstalled] = useState<boolean | null>(null)
  const [checkingSkill, setCheckingSkill] = useState(false)
  const [installingSkill, setInstallingSkill] = useState(false)
  const [assetDir, setAssetDir] = useState('.pi')

  const checkCli = useCallback(async (showToast = false) => {
    setChecking(true)
    try {
      const result = await window.electronAPI?.checkCliInstalled()
      setCliStatus(result ?? null)
      if (showToast) {
        if (result?.installed && result?.working) {
          addToast('CLI 已安装且可用', 'success')
        } else if (result?.installed && !result?.working) {
          addToast('CLI 已安装但无法正常运行', 'warning')
        } else {
          addToast('CLI 未安装', 'info')
        }
      }
    } catch {
      setCliStatus(null)
      if (showToast) addToast('检测失败', 'error')
    } finally {
      setChecking(false)
    }
  }, [addToast])

  const installCli = useCallback(async () => {
    setInstalling(true)
    try {
      const result = await window.electronAPI?.installCli()
      if (result?.success) {
        addToast('CLI 安装成功，可直接使用 ocean 命令', 'success')
        await checkCli()
      } else {
        addToast(`安装失败: ${result?.error || '未知错误'}`, 'error')
      }
    } catch (e: any) {
      addToast(`安装失败: ${e.message || String(e)}`, 'error')
    } finally {
      setInstalling(false)
    }
  }, [checkCli, addToast])

  const checkSkill = useCallback(async (showToast = false) => {
    setCheckingSkill(true)
    try {
      const result = await window.electronAPI?.loadSkillFile(SKILL_NAME)
      const installed = !!result?.content
      setSkillInstalled(installed)
      if (showToast) {
        addToast(installed ? 'Skill 已安装' : 'Skill 未安装', installed ? 'success' : 'info')
      }
    } catch {
      setSkillInstalled(null)
      if (showToast) addToast('检测失败', 'error')
    } finally {
      setCheckingSkill(false)
    }
  }, [addToast])

  const installSkill = useCallback(async () => {
    setInstallingSkill(true)
    try {
      const result = await window.electronAPI?.saveSkillFile(SKILL_NAME, SKILL_CONTENT)
      if (result?.success) {
        addToast('Skill 安装成功', 'success')
        await checkSkill()
      } else {
        addToast(`安装失败: ${result?.error || '未知错误'}`, 'error')
      }
    } catch (e: any) {
      addToast(`安装失败: ${e.message || String(e)}`, 'error')
    } finally {
      setInstallingSkill(false)
    }
  }, [checkSkill, addToast])

  useEffect(() => {
    checkCli()
  }, [checkCli])

  useEffect(() => {
    checkSkill()
  }, [checkSkill])

  useEffect(() => {
    window.electronAPI?.loadAssetRoot?.().then((result) => {
      if (result?.assetRoot) setAssetDir(result.assetRoot === 'pi' ? '.pi' : '.claude')
    })
  }, [])

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Settings size={20} className="text-macos-text-secondary" strokeWidth={1.5} />
          <h2 className="text-base font-medium text-macos-text">通用</h2>
        </div>

        <div className="flex flex-col gap-4">
          {/* ocean-cli 安装 */}
          <div className="p-4 rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <Terminal size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
              <div className="text-sm font-medium text-macos-text">ocean-cli 安装</div>
            </div>
            <div className="text-xs text-macos-text-tertiary mb-3">
              安装 CLI 命令后，Agent 可通过 ocean 命令完成资产管理、工作流编排、实例化执行等完整自循环
            </div>

            {/* 状态显示 */}
            <div className="flex items-center gap-2 text-xs">
              {checking ? (
                <>
                  <Loader2 size={14} className="animate-spin text-macos-text-tertiary" />
                  <span className="text-macos-text-tertiary">检测中...</span>
                </>
              ) : cliStatus?.installed && cliStatus?.working ? (
                <>
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span className="text-macos-text">已安装且可用</span>
                  {cliStatus.commandPath && (
                    <span className="px-2 py-0.5 bg-gray-50 rounded font-mono text-macos-text-tertiary">
                      {cliStatus.commandPath}
                    </span>
                  )}
                </>
              ) : cliStatus?.installed && !cliStatus?.working ? (
                <>
                  <AlertCircle size={14} className="text-amber-500" />
                  <span className="text-macos-text-secondary">已安装但无法正常运行，请重新安装</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="text-macos-text-tertiary" />
                  <span className="text-macos-text-tertiary">未安装</span>
                </>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="mt-3 flex items-center gap-2">
              {!cliStatus?.installed && !installing && (
                <Button variant="outline" size="sm" onClick={installCli}
                  className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400">
                  安装 CLI
                </Button>
              )}
              {installing && (
                <Button variant="outline" size="sm" disabled
                  className="bg-[#E5E7EB] border border-gray-300 text-gray-700">
                  <Loader2 size={14} className="animate-spin mr-1" />
                  安装中...
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => checkCli(true)}
                disabled={checking || installing}
                className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-3 py-1.5 text-sm"
              >
                <RefreshCw size={14} className={`flex-shrink-0 ${checking ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* ocean-cli skill */}
          <div className="p-4 rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <FileText size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
              <div className="text-sm font-medium text-macos-text">ocean-cli skill</div>
            </div>
            <div className="text-xs text-macos-text-tertiary mb-3">
              在当前项目中安装 ocean-cli 使用指南 skill，Agent 可据此通过 ocean 命令完成完整自循环
            </div>

            {/* 状态显示 */}
            <div className="flex items-center gap-2 text-xs">
              {checkingSkill ? (
                <>
                  <Loader2 size={14} className="animate-spin text-macos-text-tertiary" />
                  <span className="text-macos-text-tertiary">检测中...</span>
                </>
              ) : skillInstalled ? (
                <>
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span className="text-macos-text">已安装</span>
                  <span className="px-2 py-0.5 bg-gray-50 rounded font-mono text-macos-text-tertiary">
                    {assetDir}/skills/{SKILL_NAME}/SKILL.md
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="text-macos-text-tertiary" />
                  <span className="text-macos-text-tertiary">未安装</span>
                </>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="mt-3 flex items-center gap-2">
              {!skillInstalled && !installingSkill && (
                <Button variant="outline" size="sm" onClick={installSkill}
                  className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400">
                  安装 Skill
                </Button>
              )}
              {installingSkill && (
                <Button variant="outline" size="sm" disabled
                  className="bg-[#E5E7EB] border border-gray-300 text-gray-700">
                  <Loader2 size={14} className="animate-spin mr-1" />
                  安装中...
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => checkSkill(true)}
                disabled={checkingSkill || installingSkill}
                className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-3 py-1.5 text-sm"
              >
                <RefreshCw size={14} className={`flex-shrink-0 ${checkingSkill ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
