import { useState, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import { Settings, CheckCircle2, AlertCircle, Loader2, Terminal, RefreshCw, FileText } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useToastStore } from '../stores/toastStore'

interface CliCheckResult {
  installed: boolean
  working: boolean
  commandPath: string | null
  wrapperPath: string | null
}

const SKILL_NAME = 'workflow-cli'

const SKILL_CONTENT = `---
name: workflow-cli
description: Ocean 工作流执行 CLI。把工作流流转交给确定性命令驱动，Agent 只需循环调用 next/complete/choose。触发词：执行工作流、跑工作流、workflow 实例化、产物查询、工作流恢复
---

# workflow-cli

## 命令一览

| 命令 | 作用 | 是否带 --instance |
|------|------|:---:|
| \`workflow list\` | 列出可用工作流 | 否 |
| \`workflow instance <workflow-name>\` | 创建工作流实例，返回 instance-id | 产出 id |
| \`workflow instance list\` | 列出实例 | 否 |
| \`workflow next\` | 拉取下一个节点内容 | 是 |
| \`workflow complete\` | 交产物并推进 | 是 |
| \`workflow fail\` | 标记失败 | 是 |
| \`workflow choose\` | 决策分支选择 | 是 |
| \`workflow status\` | 查看进度 | 是 |
| \`workflow artifact list\` | 列出实例所有产物元数据 | 是 |
| \`workflow artifact view\` | 查看产物完整内容 | 是 |
| \`workflow artifact search\` | 关键词搜索产物 | 是 |
| \`workflow artifact timeline\` | 时间线 + 全部产物全文（恢复用） | 是 |
| \`workflow artifact diff\` | 对比重入节点多次执行产物 | 是 |
| \`workflow context set\` | 追加暂存 Agent 上下文 | 是 |
| \`workflow context get\` | 查看 Agent 上下文 | 是 |

## 命令签名

\`\`\`
workflow list

workflow instance <workflow-name>
    [--input "初始任务"]                 # 记录进 process.md 供追溯
    [--max-steps N] [--max-loop N] [--max-retry N]   # 默认 100/10/2
    [--instance <id>]                   # 自定义 instance-id，缺省自动生成

workflow instance list [--workflow <name>]

workflow next --instance <id> [--json]

workflow complete --instance <id>
    [--output "产物"]                    # 短产物直接传
    [--output-file <path>]               # 长产物指向文件
    # 或 stdin：cat f | workflow complete --instance <id>

workflow fail --instance <id> --reason "失败原因"

workflow choose --instance <id> --branch "分支名" [--reason "理由"]

workflow status --instance <id> [--json]

workflow artifact list --instance <id> [--json]

workflow artifact view --instance <id>
    [--node <name>]                       # 按节点名查看（环回时返回全部）
    [--invoke <id>]                      # 按执行ID精确查看（优先于 --node）
    [--json]

workflow artifact search --instance <id> --keyword <kw> [--json]

workflow artifact timeline --instance <id> [--json]    # 含时间线+产物全文+暂存上下文

workflow artifact diff --instance <id> --node <name>
    [--context <n>]                       # 变更前后 n 行上下文（默认 3）
    [--full]                             # 显示全部行
    [--json]

workflow context set --instance <id> --topic "..." --content "..."  # 追加写入 context.md

workflow context get --instance <id> [--json]
\`\`\`

## 执行循环

\`\`\`bash
# 1. 创建实例（拿到 instance-id）
workflow instance task-standard-pipeline --input "帮我实现登录功能"
# 输出: 20260818T003758-038b

# 2. 拉取下一个节点内容
workflow next --instance 20260818T003758-038b
# business 节点：原样输出 .nodes/{节点名}.md 全文
# decision 节点：输出"判断条件 + 可选分支"

# 3a. business 节点：执行后交产物
workflow complete --instance 20260818T003758-038b --output "产物内容"

# 3b. decision 节点：显式选分支
workflow choose --instance 20260818T003758-038b --branch "没问题" --reason "评审通过"

# 3c. 失败时标记，然后重新 next 重试
workflow fail --instance 20260818T003758-038b --reason "执行失败原因"
workflow next --instance 20260818T003758-038b

# 4. 循环 2-3，直到 next 输出"工作流已完成"

# 5. 随时查看进度
workflow status --instance 20260818T003758-038b
\`\`\`

## 关键约定

- 执行类命令（next/complete/fail/choose/status）必须带 --instance <id>。
- complete 必须提供产物（--output / --output-file / stdin 三选一），否则拒绝。
- decision 节点只能 choose，不能 complete。
- 产物由 CLI 写入实例目录，Agent 不直接编辑产物文件。
- 产物查询只读，不修改任何文件。
- context set 追加写入 context.md，是唯一允许 Agent 写入的文件。
- artifact diff 用 LCS 行级算法；--context 控制上下文行数，--full 显示全部。
- artifact timeline 自动包含 context.md 内容（若存在），用于一键恢复。
`
export const WorkflowSettingsPage: FC = () => {
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
        addToast('CLI 安装成功，可直接使用 workflow 命令', 'success')
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
    <>
      <div className="h-16 px-6 flex items-center justify-end" />

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Settings size={20} className="text-macos-text-secondary" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-macos-text">工作流设置</h2>
          </div>

          <div className="flex flex-col gap-4">
            {/* 工作流存储路径 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">工作流存储路径</div>
              <div className="text-xs text-macos-text-tertiary">
                工作流定义和实例数据存储在项目根目录的 .workflows/ 目录下
              </div>
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded text-xs font-mono text-macos-text-secondary">
                .workflows/
              </div>
            </div>

            {/* 实例保留策略 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">实例保留</div>
              <div className="text-xs text-macos-text-tertiary">
                Agent 使用工作流产生的实例将自动存储在对应工作流的 instance/ 目录下，可在"实例"标签页中查看
              </div>
            </div>

            {/* 节点存储路径 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">节点存储路径</div>
              <div className="text-xs text-macos-text-tertiary">
                节点定义存储在项目根目录的 .nodes/ 目录下，跨资产来源共享
              </div>
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded text-xs font-mono text-macos-text-secondary">
                .nodes/
              </div>
            </div>

            {/* workflow-cli 安装 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <Terminal size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
                <div className="text-sm font-medium text-macos-text">workflow-cli 安装</div>
              </div>
              <div className="text-xs text-macos-text-tertiary mb-3">
                安装 CLI 命令后，Agent 可通过 workflow next/complete/choose 等命令驱动工作流执行
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

            {/* workflow-cli skill */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
                <div className="text-sm font-medium text-macos-text">workflow-cli skill</div>
              </div>
              <div className="text-xs text-macos-text-tertiary mb-3">
                在当前项目中安装 workflow-cli 使用指南 skill，Agent 可据此通过 workflow 命令驱动工作流执行
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
    </>
  )
}
