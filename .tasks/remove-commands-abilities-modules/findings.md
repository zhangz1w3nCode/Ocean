# Findings & Decisions — 移除 Commands / Abilities 模块

> 本文件记录 Ocean 项目中 Commands（命令）与 Abilities（能力）两个模块的位置、耦合点与移除风险。来源：Explore agent 全项目 very thorough 搜索（2026-07-01）。所有结论带 file_path:line，可交叉验证。

## Requirements
<!-- 用户需求 -->
- 从 main 创建分支
- 去掉「命令 (Commands)」「能力 (Abilities)」两个模块
- 不得破坏保留的模块（Skills / Knowledges / Workflows / Agents / Nodes / Resources / Settings 等）

## 项目技术栈概览
- Electron + React + TypeScript + Zustand + Vite
- 后端 IPC：`electron/launch.cjs`（主进程）、`electron/preload.dev.cjs`（预加载桥）
- 共享基础设施：`src/types/index.ts`、`src/utils/storage.ts`（~4232 行，所有文件 I/O）、`src/services/`、`src/hooks/`、`src/components/ui/`

## 模块专属文件（可直接删除）

### Commands（8 个）
| 文件 | 角色 |
|---|---|
| `src/pages/CommandsPage.tsx` | 路由页面 |
| `src/stores/commandStore.ts` | Zustand store |
| `src/components/command/index.ts` | 组件导出入口 |
| `src/components/command/CommandCard.tsx` | 卡片 |
| `src/components/command/CommandModal.tsx` | 创建/编辑弹窗 |
| `src/components/command/CommandDetailModal.tsx` | 详情弹窗 |

### Abilities（9 个）
| 文件 | 角色 |
|---|---|
| `src/pages/AbilitiesPage.tsx` | 路由页面 |
| `src/stores/abilityStore.ts` | Zustand store |
| `src/components/ability/index.ts` | 组件导出入口 |
| `src/components/ability/AbilityCard.tsx` | 卡片 |
| `src/components/ability/AbilityModal.tsx` | 创建/编辑弹窗（含 LLM/Agentic/Claude 多模式） |
| `src/components/ability/AbilityDetailModal.tsx` | 详情弹窗 |
| `src/components/settings/AbilitySettings.tsx` | 能力设置页 |

## 路由 / 入口注册点（必须改）

| 位置 | 行 | 内容 |
|---|---|---|
| `src/stores/appStore.ts` | 5 | `PageType` 联合类型含 `'commands'`/`'abilities'` |
| `src/stores/appStore.ts` | 8 | `DEFAULT_NAV_ORDER` 含两者 |
| `src/utils/storage.ts` | 2584 | `sidebarNavOrder` 默认值含两者 |
| `src/components/layout/Sidebar.tsx` | 27-28 | 导航项 `commands`/`abilities` |
| `src/components/layout/MainContent.tsx` | 8-9, 24-25 | 页面 import 与路由映射 |
| `src/App.tsx` | 13-14, 23-24 | store import 与 `loadCommandFiles()`/`loadAbilityFiles()` |

## 跨模块耦合点（高风险，逐个处理）

### 1. 引用系统 `src/hooks/useReferenceItems.ts`（最高风险）
- L7 `import { useCommandStore }`、L8 `import { useAbilityStore }`
- L22-23 `libraryConfig` 含 commands/abilities 路径
- L35-36 读取 `commandFiles`/`abilityFiles`
- L141-187 命令与能力的引用项构建逻辑（~46 行）
- 用途：所有 Markdown 编辑器的 `@` 引用功能支柱。移除后历史 `@commands/...`/`@abilities/...` 引用将无法解析。

### 2. 文件 I/O `src/utils/storage.ts`
- L55-64 `electronAPI` 声明含 8 个 command/ability 方法
- L139-140 `saveAbilityTemplateFile`/`loadAbilityTemplateFile`
- L1954-2103 命令 I/O：`COMMAND_FILES_KEY`/`parseCommandFrontmatter`/`generateCommandMarkdown`/`saveCommandFilesToLocal`/`loadCommandFilesFromLocal`/`deleteCommandFileFromLocal`
- L2107-2256 能力 I/O：`ABILITY_FILES_KEY`/`parseAbilityFrontmatter`/`generateAbilityMarkdown`/`saveAbilityFilesToLocal`/`loadAbilityFilesFromLocal`/`deleteAbilityFileFromLocal`
- L3320-3444 `saveAbilityConfig`/`loadAbilityConfig`/`getDefaultAbilityPromptTemplate`/`getDefaultAbilityOptimizePromptTemplate`/`saveAbilityTemplateFile`/`loadAbilityTemplateFile`

### 3. LLM 服务 `src/services/llmService.ts` + `src/services/index.ts`（关键交叉依赖）
- `llmService.ts` L26 `AbilityGenerateResult`、L210 `optimizeAbilityWithLLM`、L358 `parseAbilityContent`
- `services/index.ts` L4 重新导出 `parseAbilityContent`
- **⚠ 交叉依赖**：`src/components/skill/SkillModal.tsx` L9 `import { generateWithLLM, parseAbilityContent }`、L298 调用 `parseAbilityContent()`。**Skills 模块保留**，因此 `parseAbilityContent` 不能简单删除，需保留或重命名为通用函数。

### 4. 工作流应用 `src/components/flow/ApplyModal.tsx`
- L6 `import { useCommandStore }`、L8 `import type { CommandFile }`
- L17 `type ApplyTarget = 'command' | 'skill' | null`
- L27 `const { commandFiles, addCommandFile } = useCommandStore()`
- L125-161 `handleCreateCommand`（将工作流应用为命令）
- 处理：去掉 `'command'` 分支，仅保留 `'skill'`。

### 5. 共享 UI `src/components/ui/`
- `ReferenceSelectModal.tsx` L20-23 `categoryLabels`、L32-33 `categoryIcons`、L60-63 `groupedItems` 含 commands/abilities
- `MarkdownRenderer/WikiLink.tsx` L55-63 `getReferenceType` 识别 `/commands/`/`/abilities/` 路径
- `OptimizeModal.tsx` L6-7 `import { optimizeAbilityWithLLM }` / `loadAbilityTemplateFile`；L27 `templateType` 含 `'ability-optimize'`/`'command-optimize'`；L142-149 用 `loadAbilityTemplateFile`

### 6. 设置模块
- `src/pages/SettingsPage.tsx` L7 `import { AbilitySettings }`、L17-18 `loadAbilityConfig()`、L28-29 `case 'ability'`
- `src/components/settings/index.ts` L2 导出 `AbilitySettings`
- `src/components/settings/SettingsSidebar.tsx` L56 `id: 'ability'`
- `src/stores/settingsStore.ts` L2 `AbilityConfig`、L10-13 `saveAbilityConfig`/`loadAbilityConfig`、L48-51 `abilityConfig` 状态、L275-297 CRUD

### 7. 类型 `src/types/index.ts`
- L161-172 `CommandFileType`/`CommandFile`
- L175-186 `AbilityFileType`/`AbilityFile`
- L206 `ReferenceCategory` 含 `'commands'`/`'abilities'`
- L286 `SettingsCategory` 含 `'ability'`
- L299-303 `AbilityConfig`

## Electron 后端（必须改）

| 文件 | 行 | 内容 |
|---|---|---|
| `electron/launch.cjs` | 88-95 | `getCommandsDir()` |
| `electron/launch.cjs` | 97-104 | `getAbilitiesDir()` |
| `electron/launch.cjs` | 691-750 | `save-command-file`/`load-command-file`/`delete-command-file`/`load-all-command-files` IPC |
| `electron/launch.cjs` | 756-815 | `save-ability-file`/`load-ability-file`/`delete-ability-file`/`load-all-ability-files` IPC |
| `electron/launch.cjs` | 1016 | `initProjectDir` 子目录列表含 `'commands'`/`'abilities'` |
| `electron/launch.cjs` | 2185-2221 | `save-ability-template-file`/`load-ability-template-file` IPC |
| `electron/preload.dev.cjs` | 49-52 | `saveCommandFile`/`loadCommandFile`/`deleteCommandFile`/`loadAllCommandFiles` |
| `electron/preload.dev.cjs` | 55-58 | `saveAbilityFile`/`loadAbilityFile`/`deleteAbilityFile`/`loadAllAbilityFiles` |
| `electron/preload.dev.cjs` | 120-122 | `saveAbilityTemplateFile`/`loadAbilityTemplateFile` |

## 文档（需更新或删除）
- `README.md` L34-35（模块表）、L190-192（目录结构）
- `README_CN.md` L34、L190-192
- `business-design-doc/command-design.md`
- `business-design-doc/command-design-doc.md`
- `business-design-doc/ability-design.md`
- `CLAUDE.md`：无引用（无需改）

## 配置文件
- `package.json` L63 `@codemirror/commands` 是 CodeMirror 按键绑定库，**与命令模块无关，保留**。
- `tsconfig.json`/`vite.config.ts`/`pnpm-workspace.yaml`：无引用。

## 风险点（按严重度）

| # | 风险 | 严重度 | 处理方向 |
|---|---|---|---|
| 1 | `useReferenceItems` 引用系统被所有 Markdown 编辑器使用 | 最高 | 移除 commands/abilities 分支，保留 hook 本体 |
| 2 | `parseAbilityContent` 被 SkillModal 复用（Skills 保留） | 高 | 保留并重命名为通用函数，或保留原函数仅删除 ability 页面侧调用 |
| 3 | `OptimizeModal`/`AbilitySettings` 依赖 ability 模板 API | 高 | 移除 `'ability-optimize'`/`'command-optimize'` 分支 |
| 4 | `ApplyModal` `ApplyTarget='command'` 耦合 | 中高 | 去掉 `'command'` 分支，仅留 `'skill'` |
| 5 | `AbilityConfig` 类型被 settingsStore/storage 引用 | 中 | 一并移除 |
| 6 | `ReferenceCategory`/`SettingsCategory` 联合类型收窄 | 中 | 更新联合类型并检查所有 switch |
| 7 | 已存在用户项目目录的 commands/abilities 文件夹 | 低 | 不主动清理（仅停止创建） |

## 统计
- Commands 专属文件：8；Abilities 专属文件：9；受影响跨模块文件：~18；Electron 文件：2；文档：5。**总计约 42 文件。**

## Resources
- 项目根：`/Users/zhangz1w3nbeatbox/developlement/Ocean`
- 任务目录：`/Users/zhangz1w3nbeatbox/developlement/Ocean/.tasks/remove-commands-abilities-modules/`
- 探索 agent：`a876f7ddc7563ae48`（timeline-search，无历史存档）

---
*Update this file after every 2 view/browser/search operations*
