# Task Plan: 移除 Commands（命令）与 Abilities（能力）模块

## Goal
从 main 创建分支，彻底移除 Ocean 项目中的「命令 (Commands)」与「能力 (Abilities)」两个模块（页面、store、组件、类型、文件 I/O、Electron IPC、引用系统项、设置项、文档），且不破坏保留模块——对被 Skills 复用的 `parseAbilityContent` 等共享函数做保留或通用化重构。

## Current Phase
全部完成（Phase 1-9）。4 commit 已推送至 origin/remove-commands-abilities-modules，PR #1 已创建（base: main）。

## Phases

### Phase 1: 发现与分析
- [x] 理解用户意图：去掉 Commands 与 Abilities 两个模块
- [x] Explore 全项目定位两模块文件、路由、耦合点
- [x] timeline-search-agent 检索历史（无存档）
- [x] findings.md 固化发现
- **Status:** complete

### Phase 2: 决策与计划确认
- [x] 确认移除彻底程度：彻底移除
- [x] 确认 parseAbilityContent 处理：重命名通用化 → parseLlmContent
- [x] 确认分支命名：remove-commands-abilities-modules
- [x] 确认 design-doc 处理：删除
- [x] 用户授权（/goal "开始吧 直接去除成功"）
- **Status:** complete

### Phase 3: 创建分支
- [x] `git checkout -b remove-commands-abilities-modules`（从 main）
- **Status:** complete

### Phase 4: 移除 Commands 模块本体
- [x] 删除 src/components/command/、CommandsPage.tsx、commandStore.ts
- [x] 从 Sidebar/MainContent/appStore/App.tsx 移除 commands 入口
- [x] ApplyModal 重写移除 command 分支（仅留 skill）
- **Status:** complete

### Phase 5: 移除 Abilities 模块本体
- [x] 删除 src/components/ability/、AbilitiesPage.tsx、abilityStore.ts、AbilitySettings.tsx
- [x] 从 SettingsPage/settingsStore/SettingsSidebar 移除 ability 设置项
- **Status:** complete

### Phase 6: 解耦共享代码
- [x] types/index.ts：移除 CommandFile/AbilityFile/AbilityConfig，收窄 ReferenceCategory/SettingsCategory
- [x] storage.ts：移除 command/ability I/O、ability config 函数、模板函数、electronAPI 声明、DEFAULT_ABILITY 常量、sidebarNavOrder
- [x] llmService.ts + services/index.ts：parseAbilityContent→parseLlmContent、AbilityGenerateResult→LlmContentResult、optimizeAbilityWithLLM→optimizeContentWithLLM（保留）
- [x] useReferenceItems.ts：移除 commands/abilities 引用项
- [x] ReferenceSelectModal/WikiLink：移除 commands/abilities
- [x] OptimizeModal：简化为仅 skill-optimize
- [x] SkillModal：更新 parseLlmContent 引用
- [x] electron/launch.cjs：删 getCommandsDir/getAbilitiesDir、6+2 文件 IPC、2 模板 IPC、initProjectDir subDirs
- [x] electron/preload.dev.cjs：删 8+2 绑定
- **Status:** complete

### Phase 7: 测试验证
- [x] pnpm install
- [x] tsc --noEmit：EXIT 0
- [x] vite build：✓ 12.44s
- [x] node --check launch.cjs / preload.dev.cjs：OK
- [x] 残留引用扫描：ALL CLEAR
- [x] Electron 桌面端启动：窗口弹出，无应用错误
- **Status:** complete

### Phase 8: 文档与收尾
- [x] README.md / README_CN.md：移除 Commands/Abilities 模块行与目录结构（8→6 types）
- [x] business-design-doc 三份 design-doc 已删除
- [x] progress.md / task_plan.md 同步
- [x] git commit（4 commit 已推送，作者 zhangz1w3nCode <403592973@qq.com>）
- **Status:** complete

### Phase 9: PR 创建
- [x] 设全局 git 身份（zhangz1w3nCode / 403592973@qq.com）
- [x] 安装 gh CLI（v2.95.0）+ gh auth login 认证
- [x] gh pr create --base main → PR #1 已创建（https://github.com/zhangz1w3nCode/Ocean/pull/1）
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 用 Explore 先定位再制定计划 | CLAUDE.md 强制：先分析再执行；耦合深 |
| 规划文件放 .tasks/remove-commands-abilities-modules/ | task-continue skill 要求 |
| 不主动清理已存在用户目录 | 低风险，避免误删用户数据 |
| @codemirror/commands 依赖保留 | CodeMirror 按键库，与命令模块无关 |
| 彻底移除（含类型/IO/IPC/引用项/设置/文档） | 用户确认 |
| parseAbilityContent→parseLlmContent 重命名通用化 | 被 Skills 复用，不能删 |
| optimizeAbilityWithLLM→optimizeContentWithLLM 保留 | OptimizeModal 通用组件（agent/skill）仍用 |
| loadAbilityTemplateFile 彻底删除 | 唯一调用方 SkillModal 只传 skill-optimize 走 loadSkillTemplateFile，真实路径永不触发 |
| design-doc 三份删除 | 用户确认 |
| 不更新 .tasks/INDEX.md（任务进行中） | 用户纠正：skill 未要求时不自作主张维护（已记 memory） |
| task-end 时更新 INDEX.md | task-end skill 明确要求，有依据 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| 初次删 optimizeAbilityWithLLM 致 OptimizeModal 断裂 | 1 | 改为重命名 optimizeContentWithLLM 保留 |
| 自作主张更新 .tasks/INDEX.md 被用户纠正 | 1 | 撤销改动，记入 memory no-unsolicited-index-updates |
| npx tsc 误装 tsc@2.0.3 | 1 | 改用 pnpm exec tsc（本地 typescript） |
| storage.ts Edit 报 "File modified since read" | 1 | sed 改过后重新 Read 再 Edit |
| Electron 二进制未安装（pnpm v10 不跑 postinstall） | 2 | pnpm rebuild 无效；手动 node install.js + ELECTRON_MIRROR 下载成功 |

## Notes
- 所有错误已记录，不重复失败操作
- git commit 必须经用户允许
- 桌面端启动验证了运行时无破坏
