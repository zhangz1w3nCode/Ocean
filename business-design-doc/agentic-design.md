# Agentic 模块设计文档

> 本文档描述 Agentic 模块的设计规范，包括配置管理、工具系统和 LLM 集成。

---

## 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-03-13 | 初始版本，实现基础 Agentic 配置和工具管理 |
| 1.1 | 2026-03-13 | UI/UX优化：自定义下拉组件、配色统一、测试功能添加 |
| 1.2 | 2026-03-13 | 测试连通性功能优化：完整测试流程展示、折叠卡片、macOS灰色系风格 |
| 2.0 | 2026-03-13 | 工具系统重构：使用 @mariozechner/pi-coding-agent 提供完整工具实现 |
| 3.0 | 2026-03-13 | Agent Loop 功能实现：真正的 LLM 驱动工具调用，支持多轮循环执行 |
| 3.1 | 2026-03-13 | Bug修复：解决最终结果卡片丢失问题、UI样式统一、后续规划 |
| 3.2 | 2026-03-13 | 页面优化：卡片折叠功能、移除测试连通性按钮、代码清理 |
| 3.3 | 2026-03-13 | UI精简：移除冗余说明文字、头部标题简化、状态指示点改为表示"当前选中" |
| 4.0 | 2026-03-13 | Agent Loop 能力封装：将核心能力抽象为独立服务，供各业务模块复用 |

---

## 一、模块概述

### 1.1 模块定位

Agentic 模式是 AI Agent 的基础设施，允许 AI 使用工具与本地文件系统交互，实现更智能的能力构建。与 LLM 配置不同，Agentic 关注如何让 AI 具备自主行动能力。

### 1.2 核心概念

- **Agentic 模式**: 启用后，AI 可以使用工具与本地环境交互
- **工具**: 文件读写、编辑、搜索、终端执行等能力
- **Agent Loop**: AI 决策 → 工具调用 → 结果反馈 → 下一步决策

### 1.3 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Agentic 模式 v2.0                        │
│  ┌──────────────────┐      ┌──────────────────────────┐    │
│  │   LLM 提供商     │──────▶│   工具决策与生成         │    │
│  │  (OpenAI/Claude) │      │   (思考、规划、执行)     │    │
│  └──────────────────┘      └──────────────────────────┘    │
│              │                           │                  │
│              │                           ▼                  │
│              │              ┌──────────────────────────┐    │
│              │              │  pi-coding-agent 工具    │    │
│              │              │  read/write/edit/bash    │    │
│              │              │  ls/grep/find            │    │
│              │              └──────────────────────────┘    │
│              │                           │                  │
│              └───────────────────────────┘                  │
│                          (结果反馈)                         │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 工具来源

使用 `@mariozechner/pi-coding-agent` 包提供的完整工具实现：

| 工具名称 | 功能描述 | 风险等级 |
|----------|----------|----------|
| `read` | 读取文件内容，支持分段读取、图片检测 | 低 |
| `write` | 写入文件，自动创建目录 | 中 |
| `edit` | 文件编辑，查找并替换文本 | 中 |
| `ls` | 列出目录内容 | 低 |
| `grep` | 搜索文件内容（支持正则表达式） | 低 |
| `find` | 查找匹配名称的文件 | 低 |
| `bash` | 执行终端命令 | 高 |

---

## 二、数据持久化设计

### 2.1 配置文件位置

```
项目根目录/
└── .ocean/
    ├── llm-config.json         # LLM 提供商配置
    └── agentic-config.json     # Agentic 配置（新增）
```

### 2.2 配置文件格式

```json
{
  "enabled": true,
  "providerId": "provider-xxx",
  "modelId": "gpt-4o",
  "tools": [
    { "type": "file-read", "enabled": true, "description": "读取本地文件内容" },
    { "type": "file-write", "enabled": true, "description": "写入内容到本地文件" },
    { "type": "file-list", "enabled": true, "description": "列出目录中的文件" },
    { "type": "directory-tree", "enabled": true, "description": "获取目录树结构" },
    { "type": "terminal-execute", "enabled": false, "description": "执行终端命令" }
  ],
  "maxIterations": 10,
  "timeout": 60,
  "updatedAt": "2026-03-13T10:00:00.000Z"
}
```

### 2.3 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| enabled | boolean | 是 | 是否启用 Agentic 模式 |
| providerId | string | 否 | 指定使用的 LLM 提供商 ID |
| modelId | string | 否 | 指定使用的模型 ID |
| tools | array | 是 | 工具配置列表 |
| maxIterations | number | 是 | 最大迭代次数（1-50） |
| timeout | number | 是 | 超时时间（秒，10-300） |
| updatedAt | string | 是 | 更新时间 |

### 2.4 存储策略

**Electron 环境**:
- 保存到 `.ocean/agentic-config.json`
- 通过 IPC 通信读写文件

**浏览器环境**:
- 使用 localStorage 作为回退
- Key: `agentic-config`

---

## 三、LLM 配置（双纬度选择）

### 3.1 选择逻辑

Agentic 使用 LLM 来驱动工具调用决策，支持两个纬度的选择：

#### 纬度一：LLM 提供商
- 直接从 `llm-config.json` 读取所有已配置的提供商
- **不限启用状态** - 可以选择任何已配置的提供商（无论是否启用）
- 显示提供商的启用状态指示点（绿色=启用，灰色=未启用）

#### 纬度二：具体模型
- 从所选提供商的可用模型列表中选择
- 自动选择提供商的默认模型
- 切换提供商时自动重置模型选择

**设计原则**：Agentic 配置是独立的，与 LLM 设置中的启用状态无关。用户可以在 Agentic 中选择任何已配置的提供商。

### 3.2 配置界面 (v3.3 更新)

```
┌─────────────────────────────────────────┐
│  LLM 配置                               │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  [✓] OpenAI - gpt-4o    [当前使用] │  │  <- 当前配置卡片
│  └───────────────────────────────────┘  │
│                                         │
│  ① 选择 LLM 提供商                      │
│  ┌───────────────────────────────┐     │
│  │ ● OpenAI             [▼]     │     │  <- 绿色点=当前选中
│  └───────────────────────────────┘     │
│                                         │
│  ② 选择模型                             │
│  ┌───────────────────────────────┐     │
│  │ ● gpt-4o             [▼]     │     │  <- 绿色点=当前选中
│  └───────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

**界面说明** (v3.3 更新)：
- 下拉框采用完全自定义设计，替代原生 `<select>`
- **状态指示点**：绿色表示"当前选中"，灰色表示未选中
- 当前选中项在列表中显示勾选图标
- ~~配置摘要文字已移除~~
- ~~测试按钮已移除~~

### 3.3 数据流

```
用户选择提供商 ──▶ 更新 providerId
       │
       ▼
清空 modelId ──▶ 使用新提供商的默认模型
       │
       ▼
用户选择模型 ──▶ 更新 modelId
       │
       ▼
保存配置 ──▶ 写入 agentic-config.json
```

### 3.4 测试功能

#### 测试流程
```
点击测试按钮
     │
     ▼
检查配置完整性 ──▶ 提示用户配置提供商和模型
     │
     ▼
测试 LLM 连接 ──▶ 发送测试消息到选择的模型
     │
     ▼
测试工具能力 ──▶ 如果启用文件读取，尝试读取测试文件
     │
     ▼
显示结果 ──▶ 成功: 绿色卡片 / 失败: 红色卡片
```

#### 测试按钮设计
- **图标**: Heart（心脏）
- **文案**: 测试
- **配色**: 深灰色背景（`bg-gray-900`），符合 Ocean 整体风格
- **状态**: 测试中显示旋转加载图标
- **位置**: 选择模型下方

#### 测试结果展示
```
成功示例：
┌───────────────────────────────────────┐
│ [✓] 测试成功！                        │
│                                       │
│ LLM 响应: 测试成功...                 │
│ 工具调用测试: 已成功读取文件...        │
└───────────────────────────────────────┘

失败示例：
┌───────────────────────────────────────┐
│ [!] 测试失败: API Key 无效            │
└───────────────────────────────────────┘
```

---

## 四、工具系统

### 4.1 工具类型（v2.0 更新）

使用 `@mariozechner/pi-coding-agent` 提供的完整工具实现：

| 工具类型 | 标识 | 描述 | 风险等级 |
|----------|------|------|----------|
| 文件读取 | file-read | 读取文件内容，支持分段读取、图片检测 | 低 |
| 文件写入 | file-write | 写入文件，自动创建目录 | 中 |
| 文件编辑 | file-edit | 查找并替换文本 | 中 |
| 目录列表 | file-ls | 列出目录中的文件和子目录 | 低 |
| 内容搜索 | file-grep | 在文件中搜索内容（支持正则表达式） | 低 |
| 文件查找 | file-find | 查找匹配名称的文件 | 低 |
| 终端执行 | bash-execute | 执行终端命令（如 ls、mkdir、rm 等） | 高 |

### 4.2 工具参数详情

#### read 工具
```typescript
{
  path: string,      // 文件路径
  offset?: number,   // 开始读取的行号
  limit?: number     // 读取的行数限制
}
```

#### write 工具
```typescript
{
  path: string,      // 文件路径
  content: string    // 文件内容
}
```

#### edit 工具
```typescript
{
  path: string,      // 文件路径
  oldText: string,   // 要查找的文本
  newText: string    // 替换后的文本
}
```

#### ls 工具
```typescript
{
  path?: string      // 目录路径，默认为当前目录
}
```

#### grep 工具
```typescript
{
  pattern: string,       // 正则表达式模式
  path?: string,         // 搜索路径
  glob?: string,         // 文件匹配模式
  ignoreCase?: boolean   // 是否忽略大小写
}
```

#### find 工具
```typescript
{
  pattern: string,   // 文件名匹配模式
  path?: string      // 搜索路径
}
```

#### bash 工具
```typescript
{
  command: string,     // 终端命令
  timeout?: number     // 超时时间（毫秒）
}
```

### 4.3 工具配置界面

```
┌─────────────────────────────────────────┐
│  工具配置                               │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ [📄] 文件读取                     │  │  <- 工具卡片
│  │ 读取文件内容，支持分段读取        │  │
│  │                          [开关ON] │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ [✏️] 文件写入                     │  │
│  │ 写入文件，自动创建目录            │  │
│  │                          [开关ON] │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ... 其他工具卡片 ...                   │
│                                         │
└─────────────────────────────────────────┘
```

### 4.4 工具状态样式

**启用状态**:
- 背景: `bg-gray-100`
- 边框: `border-gray-200`
- 图标背景: `bg-gray-100`
- 图标颜色: `text-macos-success`

**禁用状态**:
- 背景: `bg-gray-50`
- 边框: `border-gray-200`
- 图标背景: `bg-gray-200`
- 图标颜色: `text-macos-text-tertiary`

---

## 六、UI 组件设计规范

### 6.1 自定义下拉框

为了替代原生 `<select>` 元素，实现完全自定义的下拉组件：

#### 下拉框主体
- **边框**: `border-gray-300`，悬停 `border-gray-400`
- **圆角**: `rounded-lg`（8px）
- **背景**: `bg-white`
- **文字**: `text-gray-900 font-medium`
- **箭头**: `ChevronDown` 图标，展开时旋转180度
- **过渡**: 所有状态变化200ms平滑过渡

#### 下拉选项列表
- **容器**: 白色背景 + `border-gray-200` + `rounded-lg` + 阴影
- **选项高度**: `py-3`（12px上下内边距）
- **选中状态**: `bg-gray-100` 背景 + 勾选图标
- **悬停状态**: `hover:bg-gray-50`
- **状态指示**: 提供商选项前显示启用状态点（绿色/灰色）
- **过渡**: 颜色过渡150ms

#### 交互逻辑
- 点击外部自动关闭下拉框
- 同时只能打开一个下拉框
- 选中后自动关闭
- 禁用状态显示半透明 + 禁止点击光标

### 6.2 测试按钮

#### 按钮样式
```css
背景色: bg-gray-900
文字颜色: text-white
圆角: rounded-lg
内边距: px-4 py-2.5
字体: font-medium text-sm
悬停: hover:bg-gray-800
点击: active:bg-gray-700
过渡: transition-all duration-200
```

#### 状态变化
- **默认**: 深灰色背景 + 心脏图标
- **测试中**: 旋转加载图标 + "测试中..." 文案
- **禁用**: 半透明 + 禁止点击

### 6.3 配色规范

基于 Ocean 项目的 macOS 设计风格：

| 用途 | 配色变量 | 颜色值 | 说明 |
|------|----------|--------|------|
| 强调色 | `macos-accent` | #007AFF | 蓝色，用于选中状态、链接 |
| 成功色 | `macos-success` | #34C759 | 绿色，用于成功状态 |
| 错误色 | `macos-error` | #FF3B30 | 红色，用于错误提示 |
| 主文本 | `macos-text` | #1D1D1F | 深灰，主要文字 |
| 次文本 | `macos-text-secondary` | #6E6E73 | 中灰，次要文字 |
| 第三文本 | `macos-text-tertiary` | #8E8E93 | 浅灰，提示文字 |
| 边框 | - | gray-200/300 | 分割线和边框 |
| 背景 | - | gray-50/100 | 卡片背景 |

---

## 五、高级参数

### 5.1 最大迭代次数

- 范围: 1-50
- 默认值: 10
- 说明: AI Agent 单次任务的最大工具调用次数，防止无限循环

### 5.2 超时时间

- 范围: 10-300 秒
- 默认值: 60 秒
- 说明: AI Agent 单次任务的最大执行时间

### 5.3 参数界面

```
最大迭代次数                          10
[━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━]

超时时间（秒）                        60s
[━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━]
```

---

## 六、界面布局

### 6.1 整体结构

```
┌─────────────────────────────────────────────────────────────┐
│  Agentic 设置                    [Agentic 模式已启用] [开关] │  <- 头部
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ LLM 配置                                            │   │  <- 配置卡片
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 工具配置                                            │   │  <- 工具卡片
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 高级参数                                            │   │  <- 参数卡片
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 关于 Agentic 模式                                   │   │  <- 说明卡片
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 头部设计

```
┌─────────────────────────────────────────────────────────────┐
│  [🤖]                    Agentic 模式已启用            [✓]   │
│  Agentic 设置                                              │
│  配置 AI Agent 工具和参数                                   │
└─────────────────────────────────────────────────────────────┘
```

- 左侧: Bot 图标 + 标题 + 副标题
- 右侧: 总开关（带文字说明）
- 图标背景: `bg-gray-100`
- 图标颜色: `text-macos-text-secondary`

---

## 七、与 LLM 设置的联动优化

### 7.1 LLM 设置模型管理优化

为了支持 Agentic 的模型选择，LLM 设置也进行了优化：

#### 推荐模型快捷添加
```
可用模型列表
推荐：[+ gpt-4o] [+ gpt-4o-mini] [+ gpt-4-turbo] [+ gpt-3.5-turbo]

[输入模型名称...] [+ 添加]

┌──────────────────────────────────┐
│ gpt-4o (默认)              [×]   │  <- 已添加模型标签
│ gpt-4o-mini                [×]   │
│ gpt-3.5-turbo              [×]   │
└──────────────────────────────────┘
```

#### 默认模型下拉选择
```
默认模型
[gpt-4o ▼]  <- 从已添加模型中选择
```

### 7.2 各提供商推荐模型

| 提供商 | 推荐模型 |
|--------|----------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo |
| Anthropic | claude-opus-4, claude-sonnet-4, claude-haiku-4 |
| Azure | gpt-4, gpt-4o, gpt-35-turbo |
| Custom | 无（用户手动添加） |

---

## 八、文件清单

### 8.1 核心文件

| 文件路径 | 说明 |
|----------|------|
| `src/types/index.ts` | Agentic 相关类型定义 |
| `src/stores/settingsStore.ts` | Agentic 状态管理 |
| `src/utils/storage.ts` | Agentic 配置存储方法 |
| `electron/main.ts` | 生产环境 IPC 处理程序 |
| `electron/launch.cjs` | 开发环境 IPC 处理程序 |
| `electron/preload.ts` | 生产环境 Preload |
| `electron/preload.dev.cjs` | 开发环境 Preload |

### 8.2 组件文件

| 文件路径 | 说明 |
|----------|------|
| `src/components/settings/AgenticSettings.tsx` | Agentic 设置组件 |
| `src/components/settings/SettingsSidebar.tsx` | 侧边栏更新 |
| `src/components/settings/LLMProviderModal.tsx` | LLM 设置优化 |
| `src/pages/SettingsPage.tsx` | 设置页面路由 |

### 8.3 服务文件

| 文件路径 | 说明 |
|----------|------|
| `src/services/agenticService.ts` | Agentic 服务层 |
| `src/components/ui/Switch.tsx` | Switch 组件优化 |

---

## 九、API 接口

### 9.1 Electron IPC

| 通道 | 方向 | 参数 | 返回值 |
|------|------|------|--------|
| `save-agentic-config` | Renderer → Main | config: AgenticConfig | { success: boolean, error?: string } |
| `load-agentic-config` | Renderer → Main | - | { success: boolean, config: AgenticConfig, error?: string } |

### 9.2 服务层 API

| 函数 | 说明 | 参数 | 返回值 |
|------|------|------|--------|
| `getAgenticLLMProvider` | 获取配置的 LLM 提供商 | config: AgenticConfig | Promise<LLMProvider \| null> |
| `isAgenticAvailable` | 检查 Agentic 是否可用 | config: AgenticConfig | Promise<{ available: boolean, reason?: string }> |
| `executeAgenticTask` | 执行 Agentic 任务 | config, task, contextInfo | Promise<AgenticExecutionResult> |
| `getAgenticStatus` | 获取状态摘要 | config: AgenticConfig | Promise<AgenticStatus> |
| `getModelId` | 获取要使用的模型 ID | config, provider | string |

---

## 十、技术细节说明（v1.1）

### 10.1 IPC 注册问题

#### 问题描述
开发环境使用 `electron/launch.cjs`（CommonJS格式），而生产环境使用 `electron/main.ts`（ESM格式）。如果只在 `main.ts` 中注册 IPC 处理器，开发环境会缺失处理器导致通信失败。

#### 解决方案
在 `electron/launch.cjs` 中同步添加所有 IPC 处理器：
- `save-agentic-config` - 保存配置到 `.ocean/agentic-config.json`
- `load-agentic-config` - 从文件加载配置
- `getAgenticConfigPath()` - 获取配置文件路径的辅助函数

### 10.2 数据源优化

#### 原设计问题
- 从 `settingsStore` 中获取 `llmProviders`
- 过滤只显示 `isEnabled === true` 的提供商
- 与 LLM 设置模块耦合

#### 新设计优势
- 直接从 `llm-config.json` 读取数据
- 显示所有已配置的提供商（不限启用状态）
- Agentic 配置与 LLM 设置完全独立
- 使用本地 state 管理数据

### 10.3 自定义下拉组件实现

#### 核心技术点
1. **状态管理**: 使用 `useState` 管理下拉框开关状态
2. **外部点击检测**: 使用 `useRef` + `useEffect` 监听点击外部关闭
3. **动画效果**: 使用 Tailwind 的 `transition-transform` 实现箭头旋转
4. **状态指示**: 提供商选项前显示启用状态点（CSS条件渲染）

#### 关键代码结构
```typescript
// 状态管理
const [isDropdownOpen, setIsDropdownOpen] = useState(false)
const dropdownRef = useRef<HTMLDivElement>(null)

// 点击外部关闭
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsDropdownOpen(false)
    }
  }
  document.addEventListener('mousedown', handleClickOutside)
  return () => document.removeEventListener('mousedown', handleClickOutside)
}, [])
```

### 10.4 测试功能实现

#### 测试流程
1. 检查配置完整性（提供商、模型）
2. 调用 `window.electronAPI.callLLMApi()` 测试 LLM 连接
3. 如果启用文件读取工具，测试工具调用能力
4. 显示测试结果（成功/失败）

#### 状态管理
```typescript
const [isTesting, setIsTesting] = useState(false)
const [testResult, setTestResult] = useState<{
  success: boolean
  message: string
} | null>(null)
```

### 10.5 测试连通性功能优化（v1.2）

#### 设计目标
- 完整展示测试过程中的思考、工具调用、结果
- 提供丰富的控制台日志便于调试
- 让用户清楚地看到每一步的执行情况

#### 测试步骤类型

```typescript
interface TestStep {
  id: string
  type: 'thinking' | 'tool_call' | 'result' | 'error' | 'info'
  title: string
  content?: string
  timestamp: Date
  status: 'pending' | 'running' | 'success' | 'error'
  details?: {
    request?: string
    response?: string
    duration?: number
  }
}
```

| 步骤类型 | 图标 | 用途 |
|---------|------|------|
| `thinking` | Brain | 思考/规划过程 |
| `tool_call` | Wrench | 工具调用 |
| `result` | Check | 结果展示 |
| `error` | AlertCircle | 错误信息 |
| `info` | MessageSquare | 信息提示 |

#### 测试流程设计

```
步骤1: 检查配置
  ↓ 验证提供商和模型是否配置
步骤2: 测试 LLM 连接
  ↓ 发送测试消息，验证 API 连通性
步骤3: 测试工具调用（可选）
  ↓ 验证 LLM 是否理解工具调用指令
完成: 显示测试结果
```

#### 测试卡片设计

**折叠卡片结构**：
- 标题栏：图标 + 标题 + 状态/耗时 + 展开箭头
- 折叠时：仅显示标题和状态
- 展开时：显示请求和响应详情

**样式规范（macOS 灰色系）**：

| 元素 | 样式 |
|------|------|
| 卡片容器 | `border-gray-200 bg-gray-50` |
| 成功状态 | `border-green-200 bg-green-50` |
| 错误状态 | `border-red-200 bg-red-50` |
| 请求/响应代码块 | `bg-gray-50 border border-gray-200` |
| 等待动画 | `bg-gray-400` 弹跳动画 |

#### 控制台日志输出

```javascript
// 测试开始
console.log('============================================================')
console.log('[Agentic Test] 开始 Agentic 连通性测试')
console.log('[Agentic Test] 提供商:', provider.name)
console.log('[Agentic Test] 模型:', model)
console.log('[Agentic Test] 启用工具:', enabledTools.join(', '))
console.log('============================================================')

// 每个步骤
console.log('[Agentic Test] [TYPE] title content', details)

// 测试完成
console.log('============================================================')
console.log('[Agentic Test] 测试完成，所有检查通过')
console.log('============================================================')
```

#### 文件路径安全

测试工具调用时，文件路径从硬编码改为动态获取当前项目路径：
- 未选择项目时跳过工具测试
- 使用 `${projectPath}` 作为测试目录

#### max_tokens 修复

`electron/launch.cjs` 中的 `max_tokens` 从 `262144` 改为 `4096`，避免超出模型上下文限制。

---

## 十一、后续计划

### 11.1 功能扩展

- [x] **工具调用实现** - 使用 pi-coding-agent 实现真实工具调用（v2.0 已完成）
- [x] **Agent 执行循环** - 实现完整的 Agent Loop（思考 → 行动 → 观察）（v3.0 已完成）
- [x] **运行状态可视化** - 显示 Agent 思考过程、工具调用历史（v3.1 已完成）
- [x] **能力模块集成** - 能力/技能/知识模块 Agentic 创建（v4.0 已完成）
- [x] **全业务模块接入** - 智能体/命令/节点/资源/工作流模块接入 Agentic 创建（v4.2 已完成）
- [ ] **测试功能增强** - 更详细的测试报告、测试历史记录

### 11.2 安全增强

- [ ] **权限控制** - 可访问目录白名单
- [ ] **命令白名单** - 允许执行的终端命令列表
- [ ] **操作确认** - 敏感操作前用户确认
- [ ] **审计日志** - 记录所有工具调用操作

---

## 十二、v2.0 更新说明

### 12.1 变更概述

v2.0 版本将工具系统从手动实现的占位符迁移到 `@mariozechner/pi-coding-agent` 提供的完整工具实现。

### 12.2 依赖包说明

| 包名 | 版本 | 用途 |
|------|------|------|
| `@mariozechner/pi-coding-agent` | ^0.57.1 | 提供完整的文件操作和终端执行工具 |
| `@mariozechner/pi-agent-core` | ^0.57.1 | Agent 核心框架（状态管理、事件流） |
| `@mariozechner/pi-ai` | ^0.57.1 | LLM 集成层 |

### 12.3 文件变更列表

| 文件 | 变更说明 |
|------|----------|
| `src/types/index.ts` | 更新 AgenticToolType 类型定义 |
| `src/stores/settingsStore.ts` | 更新默认工具配置 |
| `src/services/agenticService.ts` | 重写工具创建逻辑，使用 pi-coding-agent 工具 |
| `src/components/settings/AgenticSettings.tsx` | 更新工具图标和标签 |
| `electron/launch.cjs` | 添加 execute-agentic-tool IPC 处理器 |
| `electron/main.ts` | 添加 execute-agentic-tool IPC 处理器 |
| `electron/preload.ts` | 添加 executeAgenticTool API |
| `electron/preload.dev.cjs` | 添加 executeAgenticTool API |

### 12.4 迁移指南

如果之前保存了旧版本的 Agentic 配置，需要手动更新 `agentic-config.json`：

```json
{
  "tools": [
    { "type": "file-read", "enabled": true, "description": "读取文件内容，支持分段读取" },
    { "type": "file-write", "enabled": true, "description": "写入文件，自动创建目录" },
    { "type": "file-edit", "enabled": true, "description": "查找并替换文本" },
    { "type": "file-ls", enabled": true, "description": "列出目录内容" },
    { "type": "file-grep", "enabled": true, "description": "搜索文件内容" },
    { "type": "file-find", "enabled": true, "description": "查找文件" },
    { "type": "bash-execute", "enabled": false, "description": "执行终端命令" }
  ]
}
```

---

## 十三、Agent Loop 设计（v3.0 规划）

### 13.1 核心概念

Agent Loop 是 Agentic 模式的核心执行流程，实现 LLM 驱动的智能工具调用：

```
┌────────────────────────────────────────────────────────────────┐
│                      Agent Loop 流程                            │
│                                                                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│  │ 用户任务 │───▶│ LLM 思考 │───▶│ 工具调用 │───▶│ 结果反馈 │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘ │
│                       ▲                               │        │
│                       └───────────────────────────────┘        │
│                         (继续思考或结束)                        │
└────────────────────────────────────────────────────────────────┘
```

### 13.2 技术架构

使用 `@mariozechner/pi-coding-agent` 提供的组件：

| 组件 | 用途 |
|------|------|
| `AgentSession` | 高级封装，会话管理、消息历史、状态持久化 |
| `agentLoop` | 底层 API，灵活控制执行流程 |
| `Agent` | 来自 `pi-agent-core`，核心 Agent 实现 |

### 13.3 数据结构

```typescript
// Agent 上下文
interface AgentContext {
  systemPrompt: string
  model: Model<any>
  tools: AgentTool<any>[]
  messages: AgentMessage[]
}

// Agent 循环配置
interface AgentLoopConfig {
  model: Model<any>
  tools: AgentTool<any>[]
  convertToLlm: (messages: AgentMessage[]) => Message[]
  maxIterations?: number
  timeout?: number
}

// Agent 事件
type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: AgentMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AgentMessage; toolResults: ToolResult[] }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_update'; message: AgentMessage }
  | { type: 'message_end'; message: AgentMessage }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: any }
  | { type: 'tool_execution_end'; toolCallId: string; result: ToolResult }
```

### 13.4 IPC 通道设计

| 通道 | 方向 | 说明 |
|------|------|------|
| `run-agent-loop` | Renderer → Main | 启动 Agent 循环 |
| `agent-loop-event` | Main → Renderer | 流式返回 Agent 事件 |
| `abort-agent-loop` | Renderer → Main | 中断 Agent 执行 |

### 13.5 UI 设计

```
┌─────────────────────────────────────────────────────────────┐
│  Agent 执行面板                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 任务描述：[输入框]                                   │   │
│  │ "帮我分析 src 目录下的 TypeScript 文件"             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 思考过程                                             │   │
│  │ 我需要先列出 src 目录的内容，然后读取 .ts 文件...   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ▼ 工具调用 #1: ls                                    │   │
│  │   参数: { "path": "src" }                           │   │
│  │   结果: 找到 5 个 TypeScript 文件                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ▶ 工具调用 #2: read                                  │   │
│  │   参数: { "path": "src/index.ts" }                  │   │
│  │   状态: 执行中...                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                              [停止执行] [复制结果]          │
└─────────────────────────────────────────────────────────────┘
```

### 13.6 安全控制

| 控制点 | 实现方式 |
|--------|----------|
| 迭代限制 | 使用 `maxIterations` 配置，默认 10 次 |
| 超时控制 | 使用 `timeout` 配置，默认 60 秒 |
| 工具权限 | 根据用户配置过滤可用工具 |
| 敏感操作 | bash 工具默认禁用，需用户手动开启 |

### 13.7 实现计划

| 阶段 | 任务 | 状态 |
|------|------|------|
| 1 | 研究 `agentLoop` API 和参数结构 | 已完成 |
| 2 | 实现 Agent 服务层 `runAgentLoop` 函数 | 已完成 |
| 3 | 集成 LLM 配置和工具过滤 | 已完成 |
| 4 | 添加 IPC 通道支持流式输出 | 已完成 |
| 5 | UI 界面改造 | 已完成 |
| 6 | 错误处理和边界情况 | 已完成 |
| 7 | 测试和文档更新 | 已完成 |

### 13.8 实现详情（v3.0 已完成）

#### 13.8.1 IPC 通道设计

| 通道 | 方向 | 说明 |
|------|------|------|
| `run-agent-loop` | Renderer → Main | 启动 Agent 循环 |
| `agent-loop-event` | Main → Renderer | 流式返回 Agent 事件 |
| `abort-agent-loop` | Renderer → Main | 中断 Agent 执行 |

#### 13.8.2 核心函数实现

**Electron 主进程（launch.cjs / main.ts）**:

| 函数 | 说明 |
|------|------|
| `sendAgentLoopEvent()` | 向渲染进程发送 Agent 事件 |
| `buildToolsDefinition()` | 构建 LLM function calling 工具定义 |
| `executeToolCallForLoop()` | 执行工具调用，使用 pi-coding-agent |
| `callLLMWithToolsForLoop()` | 调用 LLM API，支持 OpenAI/Anthropic 格式 |

#### 13.8.3 Agent 循环执行流程

```
1. 接收用户任务
2. 构建系统提示词 + 工具定义
3. while (迭代次数 < 最大迭代):
   a. 检查超时/中止信号
   b. 调用 LLM API
   c. 发送 thinking 事件
   d. 如有工具调用:
      - 发送 tool_call 事件
      - 执行工具
      - 发送 tool_result 事件
      - 将结果添加到消息历史
   e. 如无工具调用:
      - 任务完成，退出循环
4. 发送 agent_end 事件
5. 返回最终结果
```

#### 13.8.4 前端 UI 设计

**任务输入区域**:
- 任务描述输入框（3行）
- 开始执行 / 中止执行按钮
- 清除结果按钮

**执行日志展示**:
- 卡片式步骤展示
- 可折叠详情
- 工具调用的输入/输出合并展示
- 思考内容完整显示（max-h-96 限制高度）
- 执行中动画提示

#### 13.8.5 支持的 LLM 格式

**OpenAI 格式**:
```json
{
  "model": "gpt-4o",
  "messages": [...],
  "tools": [...],
  "temperature": 0.2,
  "max_tokens": 4096
}
```

**Anthropic 格式**:
```json
{
  "model": "claude-3-haiku-20240307",
  "system": "...",
  "messages": [...],
  "tools": [...],
  "max_tokens": 4096
}
```

#### 13.8.6 事件类型定义

| 事件类型 | 说明 | 数据字段 |
|---------|------|----------|
| `agent_start` | Agent 开始 | task |
| `turn_start` | 单轮开始 | turnNumber |
| `thinking` | LLM 思考 | content |
| `tool_call` | 工具调用 | toolName, toolArgs |
| `tool_result` | 工具结果 | toolOutput, toolSuccess |
| `turn_end` | 单轮结束 | turnNumber |
| `error` | 错误 | error |
| `agent_end` | Agent 结束 | success, result, totalTurns, totalToolCalls, duration |

#### 13.8.7 前端 UI 展示优化（v3.1）

**灰色系统一**:
- 所有步骤卡片（包括最终结果）统一使用灰色系样式
- 背景: `bg-gray-50`，边框: `border-gray-200`
- 仅错误状态使用红色系

**最终结果卡片**:
- 默认折叠状态，用户可点击展开查看详情
- 展示执行结果内容和统计信息（总轮次、工具调用次数、耗时）

#### 13.8.8 Bug 修复（v3.1）

**问题1: Agent 开始执行一直等待**
- 原因: `agent_start` 步骤状态为 `running`，但没有后续更新
- 解决: 将状态改为 `success`

**问题2: 最终结果卡片丢失**
- 原因: 后端发送 `agent_end` 事件和 `ipcMain.handle` 返回结果是同步的，前端在 finally 块中取消订阅时，`agent_end` 事件可能还未处理
- 解决: 直接使用 `runAgentLoop` 返回结果添加最终步骤，不依赖 `agent_end` 事件
- 防重复: `agent_end` 事件处理器中添加重复检查

#### 13.8.9 页面优化（v3.2）

**卡片折叠功能**:
- 四个大类别卡片（LLM 配置、工具配置、高级参数、Agentic 调试）均可折叠
- 默认全部折叠状态，用户点击标题栏可展开/折叠
- 使用 `collapsedSections` 状态管理折叠状态

**移除测试连通性**:
- 删除选择模型下方的"测试连通性"按钮
- 移除相关函数和状态: `handleTestAgentic`, `isTesting`, `addTestStep`, `updateTestStep`, `clearTestResults`, `testSteps`
- Agentic 调试功能已覆盖测试连通性的需求

**命名优化**:
- "Agent Loop 测试"改为"Agentic 调试"，更简洁直观

---

## 十四、Agent Loop 能力封装（v4.1 已重构）

### 14.1 架构概览

Agent Loop 核心能力已封装为独立的 Hook，供各业务模块复用：

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Loop 架构                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  能力模块    │  │  工作流模块   │  │  其他模块    │      │
│  │ (智能创建)   │  │ (节点执行)   │  │ (待扩展)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           ▼                                 │
│              ┌────────────────────────┐                     │
│              │   useAgentLoop Hook    │                     │
│              │  - 状态管理             │                     │
│              │  - execute()           │                     │
│              │  - abort()             │                     │
│              │  - 直接调用 IPC        │                     │
│              └────────────────────────┘                     │
│                           │                                 │
│                           ▼                                 │
│              ┌────────────────────────┐                     │
│              │   Electron IPC         │                     │
│              │  - runAgentLoop        │                     │
│              │  - abortAgentLoop      │                     │
│              │  - onAgentLoopEvent    │                     │
│              └────────────────────────┘                     │
│                           │                                 │
│                           ▼                                 │
│              ┌────────────────────────┐                     │
│              │ @mariozechner/pi-coding│                     │
│              │      -agent            │                     │
│              │  - 工具执行             │                     │
│              └────────────────────────┘                     │
│                           │                                 │
│                           ▼                                 │
│              ┌────────────────────────┐                     │
│              │   底层 Agent Loop      │                     │
│              │ (LLM + Tools + Events) │                     │
│              └────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

> **重构说明（2026-03-14）**：
> - 移除了 `AgentLoopService` 中间层，简化架构
> - `useAgentLoop` 直接调用 Electron IPC
> - 代码量减少约 228 行，逻辑更清晰

### 14.2 接口设计

#### useAgentLoop Hook 接口

```typescript
// 执行配置
interface AgentLoopExecuteConfig {
  task: string
  tools: AgenticToolConfig[]
  provider: LLMProvider
  model: string
  projectPath: string
  maxIterations?: number
  timeout?: number
}

// 执行结果
interface AgentLoopExecuteResult {
  success: boolean
  result: string
  error?: string
  totalTurns: number
  totalToolCalls: number
  duration: number
}

// Hook 返回值
interface UseAgentLoopReturn {
  // 状态
  steps: AgentLoopStep[]
  isRunning: boolean
  expandedSteps: Set<string>
  error: Error | null
  result: AgentLoopExecuteResult | null

  // 方法
  execute: (config: AgentLoopExecuteConfig) => Promise<AgentLoopExecuteResult>
  abort: () => Promise<void>
  clearSteps: () => void
  toggleStepExpand: (stepId: string) => void
  expandAll: () => void
  collapseAll: () => void
  retry: () => Promise<AgentLoopExecuteResult | null>
}

// 使用示例
function useAgentLoop(options?: {
  onComplete?: (result: AgentLoopExecuteResult) => void
  onError?: (error: Error) => void
}): UseAgentLoopReturn
```

### 14.3 核心组件详细说明

#### 14.3.1 useAgentLoop（React Hook）

**文件**: `src/hooks/useAgentLoop.ts`

**功能**:
- **直接调用 Electron IPC**，无需中间服务层
- 自动管理步骤列表状态
- 提供执行/中止函数
- 支持回调机制
- 事件 → 步骤转换逻辑内聚在 Hook 中

**实现细节**:
```typescript
// 直接调用 IPC，不再经过 Service 层
const result = await window.electronAPI.runAgentLoop({
  provider: config.provider,
  model: config.model,
  tools: config.tools,
  maxIterations: config.maxIterations ?? 10,
  timeout: config.timeout ?? 60,
  projectPath: config.projectPath,
  task: config.task
})
```

**文件**: `src/hooks/useAgentLoop.ts`

**功能**:
- 简化 Agent Loop 的调用
- 自动管理步骤列表
- 提供执行/中止函数
- 支持回调机制

**使用示例**:
```typescript
import { useAgentLoop } from './hooks/useAgentLoop'

function MyComponent() {
  const {
    steps,           // 步骤列表
    isRunning,       // 是否执行中
    expandedSteps,   // 展开状态
    toggleStepExpand, // 切换展开
    expandAll,       // 展开全部
    collapseAll,     // 折叠全部
    execute,         // 执行
    abort,           // 中止
    clearSteps,      // 清除步骤
    retry            // 重试
  } = useAgentLoop({
    onComplete: (result) => {
      console.log('完成:', result)
    },
    onError: (error) => {
      console.error('错误:', error)
    }
  })

  const handleRun = async () => {
    await execute({
      task: '分析代码',
      tools: enabledTools,
      provider: provider,
      model: model,
      projectPath: '/path/to/project'
    })
  }

  return (
    <div>
      <button onClick={handleRun} disabled={isRunning}>
        执行
      </button>
      <AgentLoopLogger
        steps={steps}
        isRunning={isRunning}
        expandedSteps={expandedSteps}
        onToggleExpand={toggleStepExpand}
      />
    </div>
  )
}
```

#### 14.3.2 AgentLoopLogger（UI 组件）

**文件**: `src/components/agent/AgentLoopLogger.tsx`

**功能**:
- 卡片式步骤展示
- 可折叠的详情区域
- 类型图标和颜色
- 状态动画
- 自动滚动到底部

**特性**:
- 保持与 AgenticSettings 中完全一致的样式
- 使用灰色系（macOS 风格）
- 仅错误状态使用红色系
- 默认折叠（用户可展开查看详情）

**使用示例**:
```typescript
import { AgentLoopLogger } from './components/agent/AgentLoopLogger'

function AgentPanel() {
  return (
    <AgentLoopLogger
      steps={steps}
      isRunning={isRunning}
      expandedSteps={expandedSteps}
      onToggleExpand={toggleStepExpand}
      title="执行日志"      // 可选，默认"Agent 执行日志"
      maxHeight={500}       // 可选，默认500
      showStepCount={true}  // 可选，默认true
      autoScroll={true}     // 可选，默认true
    />
  )
}
```

### 14.4 设计规范保持

#### 14.4.1 样式统一

所有使用 Agent Loop 的模块都遵循一致的样式规范：

| 元素 | 样式 |
|------|------|
| 步骤卡片 | `border-gray-200 bg-gray-50` |
| 错误状态 | `border-red-200 bg-red-50` |
| 代码块 | `bg-gray-50 border border-gray-200` |
| 等待动画 | 灰色弹跳动画 |

#### 14.4.2 交互行为

- 步骤卡片默认折叠
- 点击标题切换折叠状态
- 自动滚动到最新步骤

### 14.5 业务模块集成示例

#### 14.5.1 能力模块 - 智能创建

```typescript
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { AgentLoopLogger } from '../../components/agent/AgentLoopLogger'

function AbilitySmartCreateModal() {
  const [description, setDescription] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const {
    steps,
    isRunning,
    expandedSteps,
    toggleStepExpand,
    execute,
    clearSteps
  } = useAgentLoop({
    onComplete: (result) => {
      if (result.success) {
        // 解析结果并创建能力
        createAbilityFromResult(result.result)
        setIsOpen(false)
      }
    }
  })

  const handleCreate = async () => {
    clearSteps()
    await execute({
      task: `根据描述创建能力: ${description}`,
      tools: agenticConfig.tools.filter(t => t.enabled),
      provider: selectedProvider,
      model: selectedModel,
      projectPath: currentProject.path
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
      <div className="space-y-4">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述你想要创建的能力..."
        />
        <button onClick={handleCreate} disabled={isRunning}>
          {isRunning ? '创建中...' : '智能创建'}
        </button>
        {steps.length > 0 && (
          <AgentLoopLogger
            steps={steps}
            isRunning={isRunning}
            expandedSteps={expandedSteps}
            onToggleExpand={toggleStepExpand}
          />
        )}
      </div>
    </Modal>
  )
}
```

#### 14.5.2 工作流模块 - 节点执行

```typescript
import { useAgentLoop } from '../../hooks/useAgentLoop'
import { CompactStepList } from '../../components/agent/AgentLoopLogger'

function NodeExecutionPanel({ node }) {
  const [showDetails, setShowDetails] = useState(false)

  const {
    steps,
    isRunning,
    execute,
    abort
  } = useAgentLoop()

  const handleExecute = async () => {
    await execute({
      task: node.data.taskDescription,
      tools: agenticConfig.tools.filter(t => t.enabled),
      provider: selectedProvider,
      model: selectedModel,
      projectPath: currentProject.path
    })
  }

  return (
    <div className="p-4">
      <div className="flex gap-2">
        <button onClick={handleExecute} disabled={isRunning}>
          执行节点
        </button>
        {isRunning && (
          <button onClick={abort}>中止</button>
        )}
      </div>

      {/* 紧凑模式展示执行步骤 */}
      <CompactStepList
        steps={steps}
        isRunning={isRunning}
        maxHeight={200}
      />
    </div>
  )
}
```

### 14.6 文件清单

| 文件路径 | 说明 | 状态 |
|----------|------|------|
| `src/hooks/useAgentLoop.ts` | useAgentLoop React Hook（直接调用 IPC） | 核心文件 |
| `src/components/agent/AgentLoopLogger.tsx` | AgentLoopLogger 日志组件 | 核心文件 |
| `src/services/agentLoopService.ts` | 工具函数（向后兼容），**AgentLoopService 类已弃用** | 保留兼容 |
| `src/services/index.ts` | 导出类型和工具函数 | 更新 |
| `src/components/settings/AgenticSettings.tsx` | 更新后的设置页面 | 使用 Hook |

### 14.7 重构记录（v4.1 - 2026-03-14）

#### 问题
- `AgentLoopService` 与 `useAgentLoop` 存在逻辑重复
- 三层架构（Hook → Service → IPC）过于复杂
- `useAgentLoop` 内部重复实现了事件→步骤转换

#### 解决方案
- **删除 `AgentLoopService` 类**，直接由 `useAgentLoop` 调用 IPC
- 将类型定义统一放在 `useAgentLoop.ts` 中导出
- `agentLoopService.ts` 仅保留工具函数用于向后兼容

#### 代码量变化
- 删除约 278 行冗余代码
- 架构从三层简化为两层

#### 向后兼容
```typescript
// 仍然可以导入类型（从 hook 文件重新导出）
import type { AgentLoopStep, AgentLoopExecuteConfig } from '../services'

// AgentLoopService 类已弃用，实例化会抛出错误
// 请直接使用 useAgentLoop Hook
```

---

## 十五、UI 精简优化（v3.3 更新）

### 15.1 更新概述

v3.3 版本对 Agentic 设置页面进行了 UI 精简，移除冗余说明文字，简化视觉层级，使界面更加简洁直观。

### 15.2 移除内容

#### 头部区域
- ~~Bot 图标~~
- ~~"Agentic 设置"标题~~
- ~~"配置 AI Agent 工具和参数"描述~~
- **保留**: 右侧总开关，改为右对齐布局

#### LLM 配置区域
- ~~"Agentic 模式使用 LLM 来驱动工具调用决策..."说明文字~~
- ~~"当前配置：使用 xxx 的 xxx 模型驱动 Agentic 模式"配置摘要~~
- ~~测试按钮（已移至其他位置）~~

#### 工具配置区域
- ~~"选择 AI Agent 可以使用的工具..."说明文字~~

#### Agent 调试区域
- ~~"输入一个任务，让 LLM 自动思考并使用工具完成..."说明文字~~

### 15.3 状态指示点变更

**变更前**: 绿色点表示"提供商是否启用"
**变更后**: 绿色点表示"当前是否选中"

| 位置 | 变更前含义 | 变更后含义 |
|------|-----------|-----------|
| LLM 提供商下拉框 | 提供商已启用 | 当前选中的提供商 |
| 模型选择下拉框 | - | 当前选中的模型 |

**设计理由**: 在 Agentic 配置中，用户关心的是"当前选择了什么"，而非"提供商是否启用"。

### 15.4 界面对比

**变更前**:
```
┌─────────────────────────────────────────┐
│ [🤖] Agentic 设置           [开关]      │
│ 配置 AI Agent 工具和参数                 │
├─────────────────────────────────────────┤
│ Agentic 模式使用 LLM...                 │
│ ① 选择 LLM 提供商                       │
│ ...                                     │
│ 当前配置：使用 OpenAI 的 gpt-4o...      │
│ 选择 AI Agent 可以使用的工具...         │
│ 输入一个任务，让 LLM 自动思考...        │
└─────────────────────────────────────────┘
```

**变更后**:
```
┌─────────────────────────────────────────┐
│                             [开关]      │
├─────────────────────────────────────────┤
│ ① 选择 LLM 提供商                       │
│ ● OpenAI [▼]  ← 绿色=当前选中          │
│ ② 选择模型                              │
│ ● gpt-4o [▼]   ← 绿色=当前选中         │
│ [工具卡片网格]                          │
│ [任务输入区域]                          │
└─────────────────────────────────────────┘
```

### 15.5 设计原则

1. **内容优先**: 减少说明文字，让用户直接操作
2. **视觉简洁**: 移除图标和标题，使用更干净的布局
3. **状态明确**: 绿色点明确表示"选中"状态，避免歧义
4. **一致性**: 与 Ocean 平台其他设置页面风格保持一致

---

## 十七、v4.2 全业务模块接入 Agentic（2026-05-30）

### 17.1 变更概述

v4.2 将 Agentic 能力从能力/技能/知识三个模块扩展到全部 8 个业务模块。新增接入的模块包括：

| 模块 | 创建 Modal | Settings 页面 | 模板目录 |
|------|-----------|---------------|---------|
| 智能体（Agent） | AgentModal 增加 Agentic 创建模式 | AgentSettings（Tab: Agentic创建/优化） | `.ocean/template/agent/` |
| 命令（Command） | CommandModal 增加 Agentic 创建模式 | CommandSettings（Tab: Agentic创建/优化） | `.ocean/template/command/` |
| 节点（Node） | NodeModal 增加 Agentic 创建模式 | NodeSettings（Tab: Agentic创建/优化） | `.ocean/template/node/` |
| 资源（Resource） | ResourceModal 增加 Agentic 创建模式 | ResourceSettings（Tab: Agentic创建/优化） | `.ocean/template/resource/` |
| 工作流（Workflow） | CreateWorkflowModal 增加 Agentic 创建模式 | WorkflowSettings（Tab: Agentic创建/优化） | `.ocean/template/workflow/` |

### 17.2 接入模式

每个业务模块的创建 Modal 均采用统一的接入模式：

```
创建方式选择界面
  ├── 手动创建 ──▶ 直接编辑表单（名称、描述、内容）
  └── Agentic创建 ──▶ 输入用户描述 → Agent Loop 执行 → 结果回填表单
```

**核心依赖**:
- `useAgentLoop` Hook — 驱动 Agent Loop 执行
- `AgentLoopLogger` — 执行日志可视化
- `loadXxxTemplateFile('agentic-create')` — 加载模块专属创建模板
- `useSettingsStore` / `useProjectStore` — 获取 Agentic 配置和项目路径

### 17.3 模板文件系统扩展

每个新模块支持两种模板类型，存储在 `.ocean/template/{模块名}/` 下：

| 模板类型 | 文件名 | 占位符 | 用途 |
|---------|--------|--------|------|
| `agentic-create` | `agentic-create.json` | `{{userDescription}}` | Agentic 创建时使用的提示词 |
| `agentic-optimize` | `agentic-optimize.json` | `{{currentContent}}`、`{{optimizeTarget}}` | Agentic 优化时使用的提示词（预留） |

### 17.4 Electron 底层扩展

| 文件 | 新增内容 |
|------|---------|
| `electron/launch.cjs` | 新增 5 组模板文件 IPC handler（save/load-agent-template-file 等） |
| `electron/preload.dev.cjs` | 暴露 10 个新模板 API（saveAgentTemplateFile/loadAgentTemplateFile 等） |
| `src/utils/storage.ts` | 新增 Window.electronAPI 类型声明、10 个默认模板常量、10 个 load/save 函数、10 个 getDefault 导出函数 |
| `src/types/index.ts` | 扩展 `SettingsCategory` 类型新增 5 个分类 |

### 17.5 设置页面结构

所有业务模块的设置页面现在统一采用 Tab 分栏布局：

```
┌─────────────────────────────────────────────────────────┐
│                                          [重置为默认] [保存] │
├─────────────────────────────────────────────────────────┤
│  [Agentic创建模板] [Agentic优化模板]                       │
├─────────────────────────────────────────────────────────┤
│  模板编辑 / 预览区域                                      │
│  使用说明（按 Tab 动态切换）                              │
└─────────────────────────────────────────────────────────┘
```

新模块设置页与既有 AbilitySettings / SkillSettings 结构完全一致，仅 Tab 内容不含 LLM 相关模板。

### 17.6 文件变更清单

| 文件 | 说明 |
|------|------|
| `electron/launch.cjs` | 新增 5 组模板文件 IPC handler |
| `electron/preload.dev.cjs` | 暴露 10 个新模板 API |
| `src/utils/storage.ts` | 新增类型声明、默认模板、load/save/getDefault 函数 |
| `src/types/index.ts` | 扩展 SettingsCategory |
| `src/components/agent/AgentModal.tsx` | 接入 Agentic 创建模式 |
| `src/components/command/CommandModal.tsx` | 接入 Agentic 创建模式 |
| `src/components/node/NodeModal.tsx` | 接入 Agentic 创建模式 |
| `src/components/resource/ResourceModal.tsx` | 接入 Agentic 创建模式 |
| `src/components/workflow/CreateWorkflowModal.tsx` | 接入 Agentic 创建模式 |
| `src/components/settings/AgentSettings.tsx` | 新增（Tab: Agentic创建/优化） |
| `src/components/settings/CommandSettings.tsx` | 新增（Tab: Agentic创建/优化） |
| `src/components/settings/NodeSettings.tsx` | 新增（Tab: Agentic创建/优化） |
| `src/components/settings/ResourceSettings.tsx` | 新增（Tab: Agentic创建/优化） |
| `src/components/settings/WorkflowSettings.tsx` | 新增（Tab: Agentic创建/优化） |
| `src/components/settings/SettingsSidebar.tsx` | 新增 5 个菜单项 |
| `src/components/settings/index.ts` | 导出 5 个新组件 |
| `src/pages/SettingsPage.tsx` | 引入并路由 5 个新设置组件 |

| 版本 | 日期 | 说明 |
|------|------|------|
| v4.2 | 2026-05-30 | 全业务模块接入 Agentic：智能体/命令/节点/资源/工作流五个模块的创建 Modal 接入 Agentic 创建模式；新增对应设置页面管理 Agentic 创建/优化提示词模板 |
| v4.1 | 2026-03-14 | 重构：移除 AgentLoopService 中间层，useAgentLoop 直接调用 IPC，代码量减少 228 行 |
| v4.0 | 2026-03-13 | Agent Loop 能力封装，抽象 AgentLoopService、useAgentLoop、AgentLoopLogger 三层架构 |
| v3.3 | 2026-03-12 | UI 精简优化，移除冗余说明文字，简化视觉层级 |
| v3.2 | 2026-03-11 | LLM 配置管理，支持添加、删除、测试 LLM 提供商 |
| v3.1 | 2026-03-10 | Agentic 配置集成，工具权限管理，调试功能 |
| v3.0 | 2026-03-09 | Agentic 设置页面初始版本 |

---

*本文档持续更新中，如有变更请及时补充。*
