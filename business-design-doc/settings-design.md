# 设置模块设计文档

## 1. 模块概述

### 1.1 模块定位
设置模块是 AI 集成的前置条件,负责配置和管理 LLM 提供商和 CLI Agent,为后续 AI 调用提供基础设施支持。

### 1.2 设计特点
- **不同于其他业务功能**:不是卡片形式展示,而是设置选项列表页面
- **页面布局**:左侧设置项列表 + 右侧配置详情区域
- **导航入口**:左侧导航栏,与其他业务功能同级位置

### 1.3 核心功能
1. **LLM 提供商配置管理**
   - 添加/编辑/删除 LLM 提供商
   - 测试连接状态
   - 设置默认提供商
   - 启用/禁用提供商

2. **CLI Agent 配置管理**
   - 添加/编辑/删除 CLI Agent
   - 测试可执行文件路径
   - 设置默认 Agent
   - 启用/禁用 Agent

3. **其他设置(扩展预留)**
   - 外观设置
   - 通用配置

---

## 2. 页面结构设计

### 2.1 整体布局
```
┌─────────────────────────────────────────────────────────────┐
│                        设置页面                               │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                            │
│  设置项列表      │          配置详情区域                       │
│                 │                                            │
│  ┌───────────┐  │  根据左侧选中项显示不同内容                  │
│  │ LLM 配置  │  │                                            │
│  └───────────┘  │  - LLM 配置详情                             │
│                 │  - CLI Agent 配置详情                       │
│  ┌───────────┐  │  - 其他设置详情                             │
│  │ CLI Agent │  │                                            │
│  └───────────┘  │                                            │
│                 │                                            │
│  ┌───────────┐  │                                            │
│  │ 其他设置  │  │                                            │
│  └───────────┘  │                                            │
│                 │                                            │
└─────────────────┴───────────────────────────────────────────┘
```

### 2.2 左侧设置项列表
**组件**: `SettingsSidebar.tsx`

**设置项定义**:
```typescript
type SettingsCategory = 'llm' | 'cli-agent' | 'other'

interface SettingsItem {
  id: SettingsCategory
  label: string
  icon: React.ComponentType
  description: string
}
```

**设置项列表**:
- LLM 配置
  - 图标: Cloud
  - 描述: 管理 LLM 提供商配置,支持多个 AI 服务商
- CLI Agent 配置
  - 图标: Terminal
  - 描述: 管理 CLI Agent 可执行文件配置
- 其他设置
  - 图标: Settings
  - 描述: 外观、通用配置等

**样式规范**:
- 选中状态:左侧蓝色竖线 + 浅灰背景,与主导航栏一致
- 高度:每项 48px
- 宽度:固定 200px
- 图标大小:20px
- 字体:14px,font-medium

### 2.3 右侧配置详情区域

#### 2.3.1 LLM 配置详情

**组件**: `LLMSettings.tsx`

**页面结构**:
```
┌─────────────────────────────────────────────────────────┐
│  LLM 配置                              [+ 添加提供商]     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  提供商卡片网格                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 提供商卡片 1  │  │ 提供商卡片 2  │  │ 提供商卡片 3  │  │
│  │              │  │              │  │              │  │
│  │ 名称         │  │ 名称         │  │ 名称         │  │
│  │ 类型标签     │  │ 类型标签     │  │ 类型标签     │  │
│  │ 默认模型标签 │  │ 默认模型标签 │  │ 默认模型标签 │  │
│  │ 状态指示     │  │ 状态指示     │  │ 状态指示     │  │
│  │              │  │              │  │              │  │
│  │ [测试][编辑] │  │ [测试][编辑] │  │ [测试][编辑] │  │
│  │ [删除]       │  │ [删除]       │  │ [删除]       │  │
│  │              │  │              │  │              │  │
│  │ 启用:○       │  │ 启用:●       │  │ 启用:○       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**提供商卡片组件**: `LLMProviderCard.tsx`

**卡片内容**:
- 提供商名称(大字体,粗体)
- **标签区域(双标签)**:
  - 类型标签(OpenAI/Anthropic/Azure/Custom)
    - OpenAI: 绿色徽章 `bg-green-100 text-green-700`
    - Anthropic: 紫色徽章 `bg-purple-100 text-purple-700`
    - Azure: 蓝色徽章 `bg-blue-100 text-blue-700`
    - Custom: 灰色徽章 `bg-gray-100 text-gray-700`
  - 默认模型标签 - 深灰色样式 `bg-gray-200 text-gray-700`
- **灰色内容区域**:
  - 启用开关 - 仅保留启用/禁用开关，移除 Base URL 和默认模型文字显示
- 状态指示灯(圆点,绿色=已启用,灰色=未启用)
- 操作按钮组:测试连接、编辑、删除(悬浮显示)

#### 2.3.2 LLM 卡片设计变更记录(2026-03-13)

**变更内容**:
1. **移除 Base URL 显示** - 不再在卡片中显示 Base URL 信息
2. **双标签设计** - 类型标签 + 默认模型标签并排显示
3. **默认模型标签样式** - 深灰色背景 `bg-gray-200 text-gray-700`
4. **简化灰色区域** - 仅保留启用开关，移除其他信息
5. **操作按钮优化** - 改为悬浮显示模式(opacity-0 group-hover:opacity-100)

#### 2.3.2 CLI Agent 配置详情

**组件**: `CLIAgentSettings.tsx`

**页面结构**:
```
┌─────────────────────────────────────────────────────────┐
│  CLI Agent 配置                         [+ 添加 Agent]   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Agent 卡片网格                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Agent 卡片 1 │  │ Agent 卡片 2 │  │ Agent 卡片 3 │  │
│  │              │  │              │  │              │  │
│  │ 名称         │  │ 名称         │  │ 名称         │  │
│  │ 类型标签     │  │ 类型标签     │  │ 类型标签     │  │
│  │ 可执行路径   │  │ 可执行路径   │  │ 可执行路径   │  │
│  │              │  │              │  │              │  │
│  │ [测试][编辑] │  │ [测试][编辑] │  │ [测试][编辑] │  │
│  │ [删除]       │  │ [删除]       │  │ [删除]       │  │
│  │              │  │              │  │              │  │
│  │ 默认:○ 启用:○│  │ 默认:● 启用:●│  │ 默认:○ 启用:○│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Agent 卡片组件**: `CLIAgentCard.tsx`

**卡片内容**:
- Agent 名称(大字体,粗体)
- 类型标签(Claude CLI/Cursor CLI/Custom)
  - Claude CLI:橙色徽章
  - Cursor CLI:蓝色徽章
  - Custom:灰色徽章
- 可执行文件路径(灰色小字体,可能出现省略)
- 状态指示灯(绿色=已启用/已测试,灰色=未启用/未测试)
- 操作按钮组:测试连接、编辑、删除
- 开关组:设为默认、启用/禁用

#### 2.3.3 其他设置详情

**组件**: `OtherSettings.tsx`

**预留扩展功能**:
- 外观设置(主题、字体大小等)
- 语言设置
- 快捷键配置
- 数据导入/导出

---

## 3. 弹窗设计

### 3.1 添加/编辑 LLM 提供商弹窗

**组件**: `LLMProviderModal.tsx`

**弹窗表单字段**:
```typescript
interface LLMProviderForm {
  id?: string                    // 编辑时存在
  name: string                   // 提供商名称(必填)
  type: 'openai' | 'anthropic' | 'azure' | 'custom'  // 类型
  baseUrl: string                // Base URL(必填)
  apiKey: string                 // API Key(必填)
  defaultModel: string           // 默认模型
  availableModels: string[]      // 可用模型列表
  isDefault: boolean             // 是否默认
  isEnabled: boolean             // 是否启用
}
```

**表单布局**:
```
┌──────────────────────────────────────────┐
│  添加 LLM 提供商                          │
├──────────────────────────────────────────┤
│                                           │
│  提供商名称 *                             │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                           │
│  提供商类型                               │
│  ┌──────────┐ ┌──────────┐              │
│  │ OpenAI   │ │ Anthropic│              │
│  └──────────┘ └──────────┘              │
│  ┌──────────┐ ┌──────────┐              │
│  │ Azure    │ │ Custom   │              │
│  └──────────┘ └──────────┘              │
│                                           │
│  Base URL *                               │
│  ┌────────────────────────────────────┐  │
│  │ https://api.openai.com/v1          │  │
│  └────────────────────────────────────┘  │
│                                           │
│  API Key *                                │
│  ┌────────────────────────────────────┐  │
│  │ •••••••••••••••••••••••••• [显示]   │  │
│  └────────────────────────────────────┘  │
│                                           │
│  默认模型                                 │
│  ┌────────────────────────────────────┐  │
│  │ gpt-4                              │  │
│  └────────────────────────────────────┘  │
│                                           │
│  可用模型列表                             │
│  ┌────────────────────────────────────┐  │
│  │ gpt-4, gpt-3.5-turbo, gpt-4-turbo  │  │
│  └────────────────────────────────────┘  │
│                                           │
│  ☐ 设为默认提供商                         │
│  ☑ 启用此提供商                           │
│                                           │
├──────────────────────────────────────────┤
│            [取消]    [保存]               │
└──────────────────────────────────────────┘
```

**交互细节**:
- 选择提供商类型时自动填充建议的 Base URL
- API Key 输入框默认显示为 `••••`,右侧有"显示"按钮切换明文
- 测试连接按钮在保存前可测试 API Key 和 Base URL 是否可用
- 必填字段验证

### 3.2 添加/编辑 CLI Agent 弹窗

**组件**: `CLIAgentModal.tsx`

**弹窗表单字段**:
```typescript
interface CLIAgentForm {
  id?: string                    // 编辑时存在
  name: string                   // Agent 名称(必填)
  type: 'claude-cli' | 'cursor-cli' | 'custom'  // 类型
  executablePath: string         // 可执行文件路径(必填)
  description: string            // 描述
  isDefault: boolean             // 是否默认
  isEnabled: boolean             // 是否启用
}
```

**表单布局**:
```
┌──────────────────────────────────────────┐
│  添加 CLI Agent                           │
├──────────────────────────────────────────┤
│                                           │
│  Agent 名称 *                             │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                           │
│  Agent 类型                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Claude   │ │ Cursor   │ │ Custom   │ │
│  └──────────┘ └──────────┘ └──────────┘ │
│                                           │
│  可执行文件路径 *                         │
│  ┌────────────────────────────┐ [浏览]   │
│  │ /usr/local/bin/claude      │          │
│  └────────────────────────────┘          │
│                                           │
│  描述                                     │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                           │
│  ☐ 设为默认 Agent                         │
│  ☑ 启用此 Agent                           │
│                                           │
├──────────────────────────────────────────┤
│            [取消]    [保存]               │
└──────────────────────────────────────────┘
```

**交互细节**:
- "浏览"按钮打开文件选择对话框(Electron 环境)
- 测试连接按钮验证可执行文件是否存在并可执行

---

## 4. 数据类型定义

### 4.1 LLM 提供商类型

```typescript
// 提供商类型枚举
export type LLMProviderType = 'openai' | 'anthropic' | 'azure' | 'custom'

// LLM 提供商配置
export interface LLMProvider {
  id: string                     // 唯一标识
  name: string                   // 提供商名称
  type: LLMProviderType          // 提供商类型
  baseUrl: string                // Base URL
  apiKey: string                 // API Key
  defaultModel: string           // 默认模型
  availableModels: string[]      // 可用模型列表
  isEnabled: boolean             // 是否启用
  createdAt: string              // 创建时间
  updatedAt: string              // 更新时间
  lastTestedAt?: string          // 最后测试时间
  testStatus?: 'success' | 'failed' | 'testing'  // 测试状态
}
```

### 4.2 CLI Agent 类型

```typescript
// Agent 类型枚举
export type CLIAgentType = 'claude-cli' | 'cursor-cli' | 'custom'

// CLI Agent 配置
export interface CLIAgent {
  id: string                     // 唯一标识
  name: string                   // Agent 名称
  type: CLIAgentType             // Agent 类型
  executablePath: string         // 可执行文件路径
  description: string            // 描述
  isDefault: boolean             // 是否默认
  isEnabled: boolean             // 是否启用
  createdAt: string              // 创建时间
  updatedAt: string              // 更新时间
  lastTestedAt?: string          // 最后测试时间
  testStatus?: 'success' | 'failed' | 'testing'  // 测试状态
}
```

### 4.3 设置分类类型

```typescript
// 设置分类
export type SettingsCategory = 'llm' | 'cli-agent' | 'other'

// 设置项接口
export interface SettingsItem {
  id: SettingsCategory
  label: string
  icon: string  // Lucide 图标名称
  description: string
}
```

---

## 5. 状态管理设计

### 5.1 SettingsStore

**文件**: `src/stores/settingsStore.ts`

```typescript
import { create } from 'zustand'
import { LLMProvider, CLIAgent } from '../types'

interface SettingsState {
  // LLM 提供商
  llmProviders: LLMProvider[]
  addLLMProvider: (provider: LLMProvider) => void
  updateLLMProvider: (id: string, updates: Partial<LLMProvider>) => void
  deleteLLMProvider: (id: string) => void
  setDefaultLLMProvider: (id: string) => void
  testLLMProvider: (id: string) => Promise<boolean>
  loadLLMProviders: () => Promise<void>

  // CLI Agent
  cliAgents: CLIAgent[]
  addCLIAgent: (agent: CLIAgent) => void
  updateCLIAgent: (id: string, updates: Partial<CLIAgent>) => void
  deleteCLIAgent: (id: string) => void
  setDefaultCLIAgent: (id: string) => void
  testCLIAgent: (id: string) => Promise<boolean>
  loadCLIAgents: () => Promise<void>

  // 当前选中的设置分类
  currentCategory: SettingsCategory
  setCurrentCategory: (category: SettingsCategory) => void
}
```

---

## 6. 数据存储设计

### 6.1 存储位置

**本地存储目录**: `.ocean/settings/`

**文件结构**:
```
.ocean/
└── settings/
    ├── llm-providers.json     # LLM 提供商配置
    └── cli-agents.json        # CLI Agent 配置
```

### 6.2 存储方法扩展

**文件**: `src/utils/storage.ts`

```typescript
// LLM 提供商存储
export const saveLLMProviders = async (providers: LLMProvider[]): Promise<void> => {
  // Electron: IPC 调用保存到 .ocean/settings/llm-providers.json
  // Browser: 保存到 localStorage
}

export const loadLLMProviders = async (): Promise<LLMProvider[]> => {
  // Electron: IPC 调用加载
  // Browser: 从 localStorage 读取
}

// CLI Agent 存储
export const saveCLIAgents = async (agents: CLIAgent[]): Promise<void> => {
  // Electron: IPC 调用保存到 .ocean/settings/cli-agents.json
  // Browser: 保存到 localStorage
}

export const loadCLIAgents = async (): Promise<CLIAgent[]> => {
  // Electron: IPC 调用加载
  // Browser: 从 localStorage 读取
}
```

### 6.3 JSON 文件格式示例

**llm-providers.json**:
```json
{
  "providers": [
    {
      "id": "provider-1",
      "name": "OpenAI GPT-4",
      "type": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "defaultModel": "gpt-4",
      "availableModels": ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo"],
      "isDefault": true,
      "isEnabled": true,
      "createdAt": "2025-03-08T10:00:00Z",
      "updatedAt": "2025-03-08T10:00:00Z"
    }
  ]
}
```

**cli-agents.json**:
```json
{
  "agents": [
    {
      "id": "agent-1",
      "name": "Claude CLI",
      "type": "claude-cli",
      "executablePath": "/usr/local/bin/claude",
      "description": "Claude CLI Agent for AI operations",
      "isDefault": true,
      "isEnabled": true,
      "createdAt": "2025-03-08T10:00:00Z",
      "updatedAt": "2025-03-08T10:00:00Z"
    }
  ]
}
```

---

## 7. Electron IPC 扩展

### 7.1 Main 进程 IPC 处理

**文件**: `electron/main.ts`

```typescript
// 设置文件 IPC 通道
ipcMain.handle('save-llm-providers', async (_, providers: LLMProvider[]) => {
  // 保存到 .ocean/settings/llm-providers.json
})

ipcMain.handle('load-llm-providers', async () => {
  // 从 .ocean/settings/llm-providers.json 加载
})

ipcMain.handle('save-cli-agents', async (_, agents: CLIAgent[]) => {
  // 保存到 .ocean/settings/cli-agents.json
})

ipcMain.handle('load-cli-agents', async () => {
  // 从 .ocean/settings/cli-agents.json 加载
})

ipcMain.handle('test-executable', async (_, path: string) => {
  // 测试可执行文件是否存在并可执行
})

ipcMain.handle('select-file', async () => {
  // 打开文件选择对话框
  return dialog.showOpenDialog({ properties: ['openFile'] })
})
```

### 7.2 Preload 脚本暴露 API

**文件**: `electron/preload.ts`

```typescript
const api = {
  // 设置相关
  saveLLMProviders: (providers: LLMProvider[]) =>
    ipcRenderer.invoke('save-llm-providers', providers),
  loadLLMProviders: () =>
    ipcRenderer.invoke('load-llm-providers'),

  saveCLIAgents: (agents: CLIAgent[]) =>
    ipcRenderer.invoke('save-cli-agents', agents),
  loadCLIAgents: () =>
    ipcRenderer.invoke('load-cli-agents'),

  testExecutable: (path: string) =>
    ipcRenderer.invoke('test-executable', path),
  selectFile: () =>
    ipcRenderer.invoke('select-file'),
}

contextBridge.exposeInMainWorld('electronAPI', api)
```

---

## 8. 导航集成

### 8.1 更新 PageType

**文件**: `src/stores/appStore.ts`

```typescript
export type PageType = 'project' | 'agents' | 'workflows' | 'nodes' |
                       'resources' | 'commands' | 'abilities' | 'knowledges' |
                       'settings'  // 新增
```

### 8.2 更新 Sidebar 导航项

**文件**: `src/components/layout/Sidebar.tsx`

在导航项数组中添加设置入口:
```typescript
const defaultNavItems = [
  { id: 'agents', label: '智能体', icon: Bot },
  { id: 'workflows', label: '工作流', icon: GitBranch },
  { id: 'nodes', label: '节点', icon: Circle },
  { id: 'resources', label: '资源文件', icon: FileText },
  { id: 'commands', label: '命令', icon: Terminal },
  { id: 'abilities', label: '能力', icon: Zap },
  { id: 'knowledges', label: '知识', icon: BookOpen },
  { id: 'settings', label: '设置', icon: Settings },  // 新增
]
```

### 8.3 更新 MainContent 路由映射

**文件**: `src/components/layout/MainContent.tsx`

```typescript
const pageComponents = {
  project: ProjectSelectionPage,
  agents: AgentsPage,
  workflows: WorkflowsPage,
  nodes: NodesPage,
  resources: ResourcesPage,
  commands: CommandsPage,
  abilities: AbilitiesPage,
  knowledges: KnowledgesPage,
  settings: SettingsPage,  // 新增
}
```

---

## 9. 实现步骤规划

### 第一阶段:基础设施(数据层)
1. 更新 `types/index.ts` 添加设置相关类型
2. 实现 `stores/settingsStore.ts` 状态管理
3. 扩展 `utils/storage.ts` 添加设置存储方法
4. Electron 主进程添加 IPC 通道(main.ts, preload.ts)

### 第二阶段:UI 框架
1. 更新 `appStore.ts` 的 `PageType`
2. 更新 `Sidebar.tsx` 添加设置导航项
3. 更新 `MainContent.tsx` 添加路由映射
4. 创建 `pages/SettingsPage.tsx` 主页面框架

### 第三阶段:核心组件
1. 创建 `components/settings/SettingsSidebar.tsx` 左侧列表
2. 创建 `components/settings/LLMSettings.tsx` LLM 配置详情
3. 创建 `components/settings/CLIAgentSettings.tsx` Agent 配置详情
4. 创建 `components/settings/OtherSettings.tsx` 其他设置

### 第四阶段:业务组件
1. 创建 `components/settings/LLMProviderCard.tsx` 提供商卡片
2. 创建 `components/settings/LLMProviderModal.tsx` 添加/编辑弹窗
3. 创建 `components/settings/CLIAgentCard.tsx` Agent 卡片
4. 创建 `components/settings/CLIAgentModal.tsx` 添加/编辑弹窗

### 第五阶段:功能完善
1. 实现测试连接功能(LLM 和 Agent)
2. 实现默认/启用状态切换
3. 实现数据持久化
4. 添加操作反馈(Toast 提示)
5. 完善表单验证

---

## 10. 交互细节规范

### 10.1 测试连接功能

**LLM 提供商测试**:
- 点击"测试"按钮
- 显示 loading 状态
- 调用提供商 API(使用提供的 Base URL 和 API Key)
- 成功:显示绿色成功提示"连接成功"
- 失败:显示红色错误提示具体错误信息
- 更新 `testStatus` 和 `lastTestedAt`

**CLI Agent 测试**:
- 点击"测试"按钮
- 显示 loading 状态
- 检查可执行文件是否存在
- 检查是否有执行权限
- 成功:显示绿色成功提示"可执行文件有效"
- 失败:显示红色错误提示
- 更新 `testStatus` 和 `lastTestedAt`

### 10.2 默认/启用状态切换

**设为默认**:
- 单选逻辑:同一类型只能有一个默认项
- 点击"设为默认"后,自动取消其他项的默认状态
- 使用开关组件(Switch)

**启用/禁用**:
- 多选逻辑:可以启用/禁用多个项
- 禁用的项不会在实际使用中被选择
- 使用开关组件(Switch)

### 10.3 表单验证

**LLM 提供商表单**:
- 名称:必填,不能为空
- Base URL:必填,必须是有效的 URL 格式
- API Key:必填,不能为空
- 默认模型:可选

**CLI Agent 表单**:
- 名称:必填,不能为空
- 可执行文件路径:必填,必须是有效路径
- 描述:可选

### 10.4 操作反馈

**成功操作**:
- 保存成功:显示 Toast "保存成功"
- 删除成功:显示 Toast "删除成功"
- 测试成功:显示 Toast "测试成功"

**失败操作**:
- 保存失败:显示 Toast 错误信息
- 测试失败:显示 Toast 具体错误原因
- 表单验证失败:在字段下方显示红色错误提示

---

## 11. 样式规范

### 11.1 颜色方案

**类型标签颜色**:
- OpenAI: `bg-green-100 text-green-700`
- Anthropic: `bg-purple-100 text-purple-700`
- Azure: `bg-blue-100 text-blue-700`
- Custom: `bg-gray-100 text-gray-700`

**Agent 类型标签颜色**:
- Claude CLI: `bg-orange-100 text-orange-700`
- Cursor CLI: `bg-blue-100 text-blue-700`
- Custom: `bg-gray-100 text-gray-700`

**状态指示灯**:
- 成功/启用: `bg-green-500`
- 失败/禁用: `bg-gray-300`
- 测试中: `bg-yellow-500`

**卡片样式**:
- 背景: `bg-white`
- 边框: `border border-gray-200`
- 圆角: `rounded-lg`
- 阴影: `shadow-sm`
- 悬浮: `hover:shadow-md`

### 11.2 字体规范

- 页面标题: `text-xl font-semibold`
- 卡片标题: `text-base font-semibold`
- 标签: `text-xs font-medium`
- 正文: `text-sm`
- 辅助文字: `text-xs text-gray-500`

### 11.3 间距规范

- 页面内边距: `p-6`
- 卡片间距: `gap-4`
- 卡片内边距: `p-4`
- 输入框高度: `h-10`
- 按钮高度: `h-9`

---

## 12. 扩展性设计

### 12.1 插件化提供商类型

虽然当前只支持 OpenAI/Anthropic/Azure/Custom 四种类型,但设计时预留扩展空间:

```typescript
// 提供商类型配置
export const LLM_PROVIDER_TYPES = {
  openai: {
    label: 'OpenAI',
    color: 'green',
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: 'OpenAI'
  },
  anthropic: {
    label: 'Anthropic',
    color: 'purple',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    icon: 'Anthropic'
  },
  // ... 可扩展更多
}
```

### 12.2 配置导入/导出

预留配置导入/导出功能:
- 导出为 JSON 文件
- 从 JSON 文件导入配置
- 支持跨设备同步配置

### 12.3 环境变量支持

预留环境变量支持:
- 从 `.env` 文件加载 API Key
- 支持从系统环境变量读取

---

## 13. 安全考虑

### 13.1 API Key 加密存储

**方案一**:使用 Electron 的安全存储
```typescript
// 使用 keytar 或 safeStorage
import { safeStorage } from 'electron'

// 加密存储
const encryptedKey = safeStorage.encryptString(apiKey)
// 解密读取
const decryptedKey = safeStorage.decryptString(encryptedKey)
```

**方案二**:使用操作系统密钥库
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service

### 13.2 API Key 显示控制

- 输入框默认显示为 `••••••••`
- 提供"显示/隐藏"切换按钮
- 在日志和错误信息中屏蔽 API Key

### 13.3 本地存储安全

- 不明文存储 API Key
- JSON 文件权限设置为仅当前用户可读写
- Electron 环境使用用户目录下的 `.ocean` 隐藏目录

---

## 14. 测试计划

### 14.1 功能测试

**LLM 配置**:
- [ ] 添加新提供商
- [ ] 编辑现有提供商
- [ ] 删除提供商
- [ ] 测试连接(成功场景)
- [ ] 测试连接(失败场景)
- [ ] 设置默认提供商
- [ ] 启用/禁用提供商
- [ ] 数据持久化

**CLI Agent 配置**:
- [ ] 添加新 Agent
- [ ] 编辑现有 Agent
- [ ] 删除 Agent
- [ ] 测试可执行文件
- [ ] 设置默认 Agent
- [ ] 启用/禁用 Agent
- [ ] 数据持久化

### 14.2 UI 测试

- [ ] 页面布局正确
- [ ] 左右分栏比例合理
- [ ] 设置项列表显示正确
- [ ] 卡片网格响应式布局
- [ ] 弹窗内容完整
- [ ] 表单验证正确
- [ ] Toast 提示显示

### 14.3 边界测试

- [ ] 空数据状态显示
- [ ] 长文本显示和截断
- [ ] 特殊字符处理
- [ ] 网络异常处理
- [ ] 文件权限异常处理

---

## 15. 后续规划

### 15.1 短期优化

- 批量导入配置
- 提供商模板库(预设常见提供商配置)
- 使用统计(记录每个提供商的使用次数)

### 15.2 中期扩展

- 更多提供商类型支持
- 模型价格配置
- 请求限流配置
- 日志记录

### 15.3 长期规划

- 云端配置同步
- 团队配置共享
- 配置版本管理
- 自动配置导入/迁移

---

## 16. 技术债务与注意事项

### 16.1 当前限制

- API Key 明文存储(需后续加密)
- 缺少配置导入/导出功能
- 测试连接功能仅验证连接,不验证模型可用性

### 16.2 待优化项

- 提供商图标使用文字标签,后续可替换为 Logo
- 错误处理更细化(区分网络错误、认证错误、限流错误等)
- 添加撤销删除功能

### 16.3 兼容性考虑

- 确保浏览器环境和 Electron 环境功能一致
- 文件选择对话框在浏览器环境降级为手动输入路径
- 测试可执行文件在浏览器环境跳过

---

## 17. 参考资源

### 17.1 相关设计文档
- `todo.md` - 项目任务清单
- `ui-components-design.md` - UI 组件库设计规范

### 17.2 技术文档
- Zustand 状态管理文档
- Electron IPC 通信文档
- Tailwind CSS 设计规范

### 17.3 API 文档
- OpenAI API 文档
- Anthropic API 文档
- Azure OpenAI API 文档

---

## 18. 实现记录

### 18.1 实现日期
- **开始日期**: 2026-03-08
- **完成日期**: 2026-03-08

### 18.2 实现内容

#### 阶段一: 基础设施(数据层)
- [x] `types/index.ts` - 添加 `LLMProvider`, `CLIAgent`, `SettingsCategory` 类型定义
- [x] `stores/settingsStore.ts` - Zustand 状态管理实现
- [x] `utils/storage.ts` - 扩展存储方法

#### 阶段二: UI 框架
- [x] `appStore.ts` - PageType 添加 'settings'
- [x] `Sidebar.tsx` - 添加设置导航项
- [x] `MainContent.tsx` - 添加路由映射
- [x] `pages/SettingsPage.tsx` - 创建主页面框架

#### 阶段三: 核心组件
- [x] `components/settings/SettingsSidebar.tsx` - 左侧设置项列表
- [x] `components/settings/LLMSettings.tsx` - LLM 配置详情
- [x] `components/settings/CLIAgentSettings.tsx` - CLI Agent 配置详情
- [x] `components/settings/OtherSettings.tsx` - 其他设置(预留)

#### 阶段四: 业务组件
- [x] `components/settings/LLMProviderCard.tsx` - LLM 提供商卡片
- [x] `components/settings/LLMProviderModal.tsx` - 添加/编辑弹窗
- [x] `components/settings/CLIAgentCard.tsx` - CLI Agent 卡片
- [x] `components/settings/CLIAgentModal.tsx` - 添加/编辑弹窗

#### 阶段五: 功能完善
- [x] 测试连接功能实现
- [x] 默认/启用状态切换
- [x] 数据持久化
- [x] Toast 操作反馈
- [x] 表单验证

### 18.3 Electron IPC 实现

#### 开发环境
- `electron/launch.cjs` - 添加 `test-llm-connection` 和 `test-executable-path` IPC 处理器
- `electron/preload.dev.cjs` - 暴露 `testLLMConnection` 和 `testExecutablePath` API

#### 生产环境
- `electron/main.ts` - 添加 IPC 处理器
- `electron/preload.ts` - 暴露 API

### 18.4 测试连接功能实现

**实现原理**:
1. 前端调用 `window.electronAPI.testLLMConnection(provider)`
2. 通过 IPC 通信发送到 Electron 主进程
3. 主进程使用 Node.js `fetch` 发送 HTTP 请求到 `/models` 端点
4. 绕过浏览器的 CORS 限制
5. 返回响应状态和详细信息

**支持类型**:
- OpenAI: 使用 `Authorization: Bearer {apiKey}` 认证头
- Anthropic: 使用 `x-api-key: {apiKey}` 认证头
- Azure: 使用 `api-key: {apiKey}` 认证头
- Custom: 支持 OpenAI 兼容格式

**浏览器环境降级**:
- 检测配置完整性(Base URL + API Key)
- 验证通过则认为配置有效

### 18.5 已知问题与解决方案

#### 问题 1: CORS 跨域错误
**现象**: 浏览器环境测试连接时报 CORS 错误

**原因**: 浏览器同源策略阻止跨域请求

**解决**: 通过 Electron 主进程发送请求绕过 CORS

#### 问题 2: 设置导航项不显示
**现象**: 新增的设置入口在导航栏不显示

**原因**: 用户保存的导航顺序配置中没有 'settings' 项

**解决**: 在 `initSidebarNavOrder` 函数中添加自动合并逻辑,将新导航项追加到末尾

#### 问题 3: IPC 处理器未注册
**现象**: 开发环境报错 "No handler registered for 'test-llm-connection'"

**原因**: 开发环境使用 `launch.cjs` 而非编译后的 `main.js`,需要在两个文件中分别添加 IPC 处理器

**解决**: 在 `electron/launch.cjs` 中添加与 `electron/main.ts` 相同的 IPC 处理器

### 18.6 文件清单

**前端文件**:
- `src/types/index.ts` - 类型定义
- `src/stores/settingsStore.ts` - 状态管理
- `src/utils/storage.ts` - 存储方法
- `src/pages/SettingsPage.tsx` - 主页面
- `src/components/settings/` - 所有组件

**Electron 文件**:
- `electron/main.ts` - 生产环境主进程
- `electron/launch.cjs` - 开发环境主进程
- `electron/preload.ts` - 生产环境 preload
- `electron/preload.dev.cjs` - 开发环境 preload

**设计文档**:
- `business-design-doc/settings-design.md` - 本文档

### 18.8 弹窗交互优化记录（2026-03-08）

#### 优化目标
统一设置弹窗的表单验证和交互方式，与知识创建等其他业务功能保持一致。

#### 优化内容

##### 1. 表单验证方式
参考知识创建表单验证交互，统一验证体验：

- **验证状态管理**：
  - 使用 `invalidFields: Set<string>` 标记验证失败字段
  - 验证失败时调用 `addToast('请输入提供商名称', 'warning')`
  - 3秒后自动清除验证状态：`setTimeout(() => setInvalidFields(new Set()), 3000)`

- **输入框错误状态**：
  - 通过 `invalid={invalidFields.has('name')}` 控制边框颜色
  - 边框变红提示验证错误
  - 用户开始输入时自动清除该字段验证状态

- **验证流程**：
  ```typescript
  // 验证示例
  if (!formData.name.trim()) {
    setInvalidFields(new Set(['name']))
    addToast('请输入提供商名称', 'warning')
    setTimeout(() => setInvalidFields(new Set()), 3000)
    return
  }
  ```

- **移除红色必填标记**：
  - 不再显示 `<span className="text-red-500">*</span>`
  - 通过输入框边框颜色和 Toast 提示表达必填要求

##### 2. 删除确认弹窗
- 删除操作时弹出 `ConfirmModal` 确认
- 弹窗标题："确认删除"
- 提示文本："确定要删除这个 LLM 提供商吗？此操作不可恢复。"
- 按钮：「删除」（确认）、「取消」（取消）

##### 3. 编辑退出确认功能
- 检测表单是否有修改（`hasChanges()` 对比数据快照）
- 有修改时关闭弹窗，显示确认提示
- 弹窗标题："确认退出"
- 提示文本："当前有未保存的修改，确定要退出吗？"
- 按钮：「退出」（确认）、「继续编辑」（取消）

##### 4. 弹窗样式统一
- **底部按钮**：
  - 取消：`variant="ghost" size="sm"`
  - 保存：`bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg`

- **类型选择按钮**：
  - 选中：`border-gray-400 bg-gray-100 text-gray-800`
  - 未选中：`border-macos-border hover:border-gray-300 hover:bg-gray-50 text-macos-text-secondary`
  - 过渡：`transition-all`

- **复选框**：
  - 强调色：`accent-gray-600`
  - 搭配图标显示：`CheckCircle`、`Power`

- **标签样式**：
  - 图标 + 文字形式
  - 图标颜色：`text-macos-text-secondary`
  - 文字颜色：`text-macos-text`

##### 5. Toast 提示规范
- **验证失败**：`addToast('请输入提供商名称', 'warning')`
- **操作成功**：`addToast('创建成功', 'success')`
- **提示文案**：简洁明了，统一风格

### 18.7 UI样式优化记录（2026-03-08）

#### 优化目标
统一设置界面UI样式，与首页工作流、节点、知识等页面保持一致。

#### 优化内容

##### 1. 左侧设置项列表样式
- **选中状态样式**：
  - 背景色：bg-[#E5E7EB]（浅灰色）
  - 左侧竖线：w-1 h-5 bg-black rounded-full（黑色圆角竖线）
  - 边框：border border-gray-300
  - 字体：text-sm font-medium

- **悬浮效果**：
  - hover:bg-gray-100

- **图标**：
  - LLM 配置：Cpu（芯片）图标
  - CLI Agent：Bot（机器人）图标

- **布局**：
  - 移除描述信息，保持简洁
  - 移除"其他设置"选项
  - 无边框分割线

##### 2. 页面头部布局
- 移除页面标题，右对齐布局（justify-end）
- 添加搜索框：支持按名称、类型筛选
  ```
  pl-9 pr-4 py-2 w-56 text-sm
  border border-gray-200 rounded-lg
  hover:border-gray-300
  focus:border-gray-400
  focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
  ```
- 按钮样式：bg-[#E5E7EB] border-gray-300 text-gray-700

##### 3. 卡片组件样式
- 参考首页 WorkflowCard 设计
- 容器：`group border border-gray-200 rounded-lg p-0 bg-white hover:shadow-md`
- 头部区域：`px-4 pb-0 pt-4`
- 内容预览区：`mx-4 mb-4 p-4 rounded-lg bg-gray-50`
- 操作按钮：悬浮显示 `opacity-0 group-hover:opacity-100`

##### 4. 布局结构
```
外层容器：
- h-full pl-2 pr-4 pt-4 pb-4
- bg-white rounded-2xl shadow-sm flex overflow-hidden

左侧设置项：
- w-52 pt-4 pb-4 pl-2（留出灰色背景间距）

右侧内容区：
- flex-1 pl-2 pt-4 pb-4 pr-4
```

#### 优化效果
- 设置界面与首页其他业务页面视觉风格完全统一
- 灰色主题贯穿始终，简洁专业
- 交互反馈清晰，操作流畅自然

---

### 18.9 完整UI设计规范参考

#### 1. 设计原则

**极简主义**：
- 移除冗余标题和文字引导
- 使用图标和交互反馈代替文字说明
- 保持界面干净，减少视觉噪音

**一致性**：
- 所有业务功能遵循相同的UI规范
- 卡片、按钮、输入框等组件样式统一
- 交互模式和反馈机制一致

**即时反馈**：
- 悬浮效果即时响应（0.2s过渡）
- Toast 提示操作结果
- 验证错误即时显示

#### 2. 页面布局规范

**标准页面结构**：
```
┌─────────────────────────────────────────┐
│              页面头部 (h-16)              │ ← 右侧搜索 + 新建按钮
├─────────────────────────────────────────┤
│                                         │
│              卡片网格区域                  │ ← 主要内容
│                                         │
└─────────────────────────────────────────┘
```

**代码模板**：
```tsx
<div className="h-full pl-2 pr-4 pt-4 pb-4">
  <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
    {/* 页面头部 */}
    <div className="h-16 px-6 flex items-center justify-end">
      <div className="flex items-center gap-3">
        {/* 搜索框 */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
          <input
            type="text"
            placeholder=""
            className="pl-9 pr-4 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg
                       placeholder:text-macos-text-tertiary focus:outline-none
                       hover:border-gray-300 focus:border-gray-400
                       focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                       transition-[border-color,box-shadow] duration-200"
          />
        </div>
        {/* 新建按钮 */}
        <Button variant="outline" className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-3 py-2 text-sm">
          <Plus size={16} className="mr-1.5" />
          新建
        </Button>
      </div>
    </div>

    {/* 页面内容 */}
    <div className="flex-1 p-6 overflow-y-auto">
      {/* 卡片网格或空状态 */}
    </div>
  </div>
</div>
```

#### 3. 卡片组件规范

**悬浮效果**：
```tsx
// Card 基础组件使用原生事件实现即时响应
const handleMouseEnter = (e) => {
  e.currentTarget.style.transform = 'translateY(-2px)'
  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
}

const handleMouseLeave = (e) => {
  e.currentTarget.style.transform = 'translateY(0)'
  e.currentTarget.style.boxShadow = 'none'
}

style={{ transition: 'transform 0.2s, box-shadow 0.2s' }}
```

**操作按钮悬浮显示**：
```tsx
<Card className="group relative">
  {/* 悬浮显示的操作按钮 */}
  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
    <button className="p-1.5 rounded-md hover:bg-gray-100 text-macos-text-secondary">
      <Edit3 size={14} />
    </button>
    <button className="p-1.5 rounded-md hover:bg-red-50 text-macos-text-secondary hover:text-macos-error">
      <Trash2 size={14} />
    </button>
  </div>
</Card>
```

#### 4. 弹窗组件规范

**Modal 结构**：
```tsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title={mode === 'create' ? '创建新能力' : '编辑能力'}
  size="xl" // sm | md | lg | xl
  footer={
    <div className="flex justify-end gap-3">
      <Button variant="ghost" size="sm" onClick={handleClose}>取消</Button>
      <Button variant="outline" size="sm" onClick={handleSubmit} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg">
        {mode === 'create' ? '创建' : '保存'}
      </Button>
    </div>
  }
>
  <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
    {/* 表单内容 */}
  </div>
</Modal>
```

**标签样式**：
```tsx
<label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
  <Type size={16} className="text-macos-text-secondary" />
  能力名称
</label>
```

**类型选择按钮**：
```tsx
<button className={`
  px-3 py-2 text-sm font-medium rounded-lg border transition-all
  ${isSelected
    ? 'border-gray-400 bg-gray-100 text-gray-800'
    : 'border-macos-border hover:border-gray-300 hover:bg-gray-50 text-macos-text-secondary'
  }
`}>
  选项文字
</button>
```

#### 5. 表单验证规范

**验证状态管理**：
```tsx
// 验证失败的字段集合
const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

// 验证时设置错误状态
if (!name.trim()) {
  setInvalidFields(new Set(['name']))
  addToast('请输入名称', 'warning')
  setTimeout(() => setInvalidFields(new Set()), 3000)
  return
}

// 输入框显示错误状态
<Input
  invalid={invalidFields.has('name')}
  onChange={(e) => {
    setName(e.target.value)
    if (invalidFields.has('name')) setInvalidFields(new Set())
  }}
/>
```

**验证流程**：
1. 点击保存时进行验证
2. 验证失败时标记字段、显示 Toast、3秒后清除
3. 用户开始输入时自动清除该字段验证状态
4. 输入框边框变红提示错误

#### 6. 交互反馈规范

**Toast 提示**：
```tsx
// 成功提示
addToast('创建成功', 'success')

// 警告提示（验证失败）
addToast('请输入名称', 'warning')

// 错误提示
addToast('删除失败', 'error')
```

**确认弹窗**：
```tsx
// 删除确认
<ConfirmModal
  isOpen={deleteConfirmOpen}
  title="确认删除"
  message="确定要删除这个能力吗？此操作不可恢复。"
  confirmText="删除"
  cancelText="取消"
  onConfirm={handleConfirmDelete}
  onCancel={handleCancelDelete}
/>

// 编辑退出确认
<ConfirmModal
  isOpen={showConfirm}
  title="确认退出"
  message="当前有未保存的修改，确定要退出吗？"
  confirmText="退出"
  cancelText="继续编辑"
  onConfirm={handleConfirmClose}
  onCancel={handleCancelClose}
/>
```

#### 7. 颜色系统

**主要颜色变量**：
| 用途 | 颜色值 | Tailwind类 |
|------|--------|-----------|
| 主要文字 | #1F2937 | text-macos-text |
| 次要文字 | #6B7280 | text-macos-text-secondary |
| 三级文字 | #9CA3AF | text-macos-text-tertiary |
| 边框 | #E5E7EB | border-macos-border |
| 悬浮背景 | #F3F4F6 | bg-gray-100 |
| 选中背景 | #E5E7EB | bg-[#E5E7EB] |
| 错误 | #EF4444 | text-macos-error |

**强调色使用**：
- 选中状态：深灰色（#E5E7EB + border-gray-400）
- 按钮：浅灰色（bg-[#E5E7EB]）
- 复选框：gray-600（accent-gray-600）
- 不使用蓝色作为主题色

#### 8. 响应式断点

| 断点 | 宽度 | 卡片列数 |
|------|------|---------|
| 默认 | < 640px | 1列 |
| sm | 640px+ | 2列 |
| lg | 1024px+ | 3列 |
| xl | 1280px+ | 4列 |

#### 9. 动画规范

**悬浮效果**：
- 过渡时间：0.2s
- 上浮距离：2px
- 阴影：0 4px 12px rgba(0,0,0,0.08)

**弹窗动画**：
- 打开：scale 0.95 → 1, opacity 0 → 1
- 关闭：scale 1 → 0.95, opacity 1 → 0
- 持续时间：0.15s

**按钮点击**：
- scale 0.97
- 使用 framer-motion whileTap

---

## 19. 能力配置功能（2026-03-10 新增，2026-03-15 更新）

### 19.1 功能概述

在设置页面添加"能力"分类，用于配置能力模块的各类提示词模板，包括 LLM 和 Agentic 两种方式的创建与优化模板。

### 19.2 页面布局

```
┌─────────────────────────────────────────────────────────┐
│                                          [重置为默认] [保存] │
├─────────────────────────────────────────────────────────┤
│  [LLM创建模板] [LLM优化模板] [Agentic创建模板] [Agentic优化模板] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📄 能力 LLM 创建提示词模板                                │
│  配置 LLM 创建能力时使用的提示词模板...                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │                                                    │ │
│  │  (提示词模板编辑框，支持 Markdown 编辑/预览)          │ │
│  │                                                    │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  使用说明                                                │
│  • LLM 创建能力时，系统会将用户输入的描述替换模板中的占位符   │
│  • LLM 会根据提示词生成能力名称、描述和详细内容              │
│  • 生成后用户可以二次编辑，确认后才会保存                   │
│  • 建议在模板中明确输出格式（如 JSON），便于解析             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 19.3 模板类型说明

| 模板类型 | 说明 | 占位符 |
|----------|------|--------|
| `llm-create` | LLM 创建能力模板 | `{{userDescription}}` |
| `llm-optimize` | LLM 优化能力模板 | `{{currentContent}}`, `{{optimizeTarget}}` |
| `agentic-create` | Agentic 创建能力模板 | `{{userDescription}}`, `{{fileName}}` |
| `agentic-optimize` | Agentic 优化能力模板 | `{{filePath}}`, `{{currentContent}}`, `{{optimizeTarget}}` |

### 19.4 提示词模板占位符

| 占位符 | 说明 | 适用模板 |
|--------|------|----------|
| `{{userDescription}}` | 用户输入的能力描述 | llm-create, agentic-create |
| `{{currentContent}}` | 当前能力内容 | llm-optimize, agentic-optimize |
| `{{optimizeTarget}}` | 优化目标 | llm-optimize, agentic-optimize |
| `{{fileName}}` | 临时文件名 | agentic-create |
| `{{filePath}}` | 能力文件路径 | agentic-optimize |

### 19.5 默认模板示例

#### LLM 创建模板
```
你是一个专业的AI能力设计助手。请根据用户提供的描述，生成一个结构化的能力定义。

## 用户描述
{{userDescription}}

## 输出要求
请以JSON格式输出，包含以下字段：
1. name: 能力名称
2. description: 能力描述
3. content: 能力详情
```

#### Agentic 创建模板
```
请帮我创建一个能力文档并保存到本地。能力描述：{{userDescription}}

任务步骤：
1. 首先使用 ls 工具查看 .claude/abilities/ 目录下是否已有能力文档
2. 如果有，使用 read 工具读取参考这些文档的格式和风格
3. 根据用户描述，生成一个符合规范的能力文档
...
- 使用 write 工具直接将文件保存到 .claude/abilities/{{fileName}}.md
```

### 19.6 设置侧边栏

| 图标 | 名称 | 说明 |
|------|------|------|
| Cpu | LLM | LLM 提供商配置 |
| Bot | Cli Agent | CLI Agent 配置 |
| Zap | 能力 | 能力模块模板配置 |

### 19.7 数据存储

模板文件存储在项目目录 `.ocean/template/ability/` 下：

```
.ocean/template/ability/
├── llm-create.json
├── llm-optimize.json
├── agentic-create.json
└── agentic-optimize.json
```

每个文件格式：
```json
{
  "content": "模板内容...",
  "updatedAt": "2026-03-15T10:00:00Z"
}
```

### 19.8 相关文件

| 文件 | 说明 |
|------|------|
| src/components/settings/AbilitySettings.tsx | 能力设置组件（四个 Tab） |
| src/components/settings/SettingsSidebar.tsx | 添加能力导航项 |
| src/pages/SettingsPage.tsx | 添加能力设置路由 |
| src/utils/storage.ts | 模板存储方法（saveAbilityTemplateFile, loadAbilityTemplateFile） |
| electron/main.ts | IPC 处理程序 |
| electron/preload.ts | IPC API 定义 |

---

## 20. LLM 提供商配置优化（2026-03-11）

### 20.1 移除"设为默认"概念

**背景**：
原有的"设为默认"功能与"启用"功能重复，增加了用户理解成本和维护复杂度。

**优化内容**：
- 从 `LLMProvider` 类型中移除 `isDefault` 字段
- 移除 LLMProviderCard 卡片中的"设为默认"开关
- 移除 LLMProviderModal 弹窗中的相关复选框
- 删除 `setDefaultLLMProvider` 函数和相关接口
- 移除默认提供商标识显示

### 20.2 启用互斥机制

**设计原理**：
同一时间只能有一个 LLM 提供商处于启用状态，启用某个提供商时自动禁用其他所有提供商。

**实现逻辑**：

```typescript
// settingsStore.ts
updateLLMProvider: async (id, updates) => {
  const state = get()

  // 如果更新的是启用状态且要设置为 true，则需要互斥处理
  if (updates.isEnabled === true) {
    // 构建新的提供商列表（启用当前，禁用其他）
    const newProviders = state.llmProviders.map((p) =>
      p.id === id
        ? { ...p, ...updates, updatedAt: new Date().toISOString() }
        : { ...p, isEnabled: false }
    )

    // 一次性保存所有更改到文件
    if (isElectron() && window.electronAPI?.saveLLMConfig) {
      await window.electronAPI.saveLLMConfig({ providers: newProviders })
    }

    set({ llmProviders: newProviders })
  } else {
    // 正常更新...
  }
}
```

**互斥保证**：
- 单次保存操作，避免竞态条件
- 内存状态和文件状态同步更新
- 原子性操作确保数据一致性

### 20.3 LLM 提供商选择逻辑

**修改 `getDefaultLLMProvider` 函数**：

```typescript
// storage.ts
export const getDefaultLLMProvider = async (): Promise<LLMProvider | null> => {
  const providers = await loadLLMProvidersFromFile()
  // 返回第一个启用的提供商
  return providers.find(p => p.isEnabled) || null
}
```

**选择规则**：
1. 加载所有提供商配置
2. 查找第一个 `isEnabled: true` 的提供商
3. 如果没有启用的提供商，返回 `null`

### 20.4 智能创建能力校验增强

**完整校验流程**：

```typescript
// AbilityModal.tsx
const handleSmartGenerate = async () => {
  // 1. 校验是否有启用的提供商
  const defaultProvider = await getDefaultLLMProvider()
  if (!defaultProvider) {
    addToast('请先在设置中配置并启用 LLM 提供商', 'warning')
    return
  }

  // 2. 校验 Base URL
  if (!defaultProvider.baseUrl) {
    addToast('请先配置 Base URL', 'warning')
    return
  }

  // 3. 校验 API Key
  if (!defaultProvider.apiKey) {
    addToast('请先配置 API Key', 'warning')
    return
  }

  // 4. 校验默认模型
  if (!defaultProvider.defaultModel) {
    addToast('请先配置默认模型', 'warning')
    return
  }

  // 调用 LLM...
}
```

**校验规则**：
- 必须有至少一个启用的提供商
- Base URL 必须配置
- API Key 必须配置
- 默认模型必须配置
- 不再校验连接测试状态（允许未测试也可使用）

### 20.5 交互优化

**提示信息**：

| 操作 | 提示信息 |
|------|---------|
| 创建提供商 | "创建成功" |
| 更新提供商 | "更新成功" |
| 启用提供商 | "已启用" |
| 禁用提供商 | "已禁用" |

**默认状态**：
- 创建新提供商时，`isEnabled` 默认为 `false`
- 用户需要手动启用所需的提供商

### 20.6 Bug 修复记录

#### 问题1：互斥逻辑配置文件未更新

**现象**：启用某个提供商时，其他提供商的启用状态在内存中更新了，但配置文件中仍然是旧值。

**原因**：
- 在 `set()` 函数内部循环调用异步函数 `updateLLMProviderInFile`
- 每次调用都会重新加载配置文件并保存，导致后面的操作覆盖前面的更改
- 没有使用 `await` 等待异步操作完成

**解决方案**：
- 构建完整的新提供商列表（包含所有更改）
- 只调用一次 `saveLLMConfig` 保存所有状态
- 避免竞态条件，确保数据一致性

#### 问题2：更新提供商时弹出两次提示

**现象**：更新提供商信息时，弹出两次"更新成功"提示。

**原因**：
- `LLMSettings.tsx` 的 `handleSave` 中有 `addToast`
- `LLMProviderModal.tsx` 的 `handleSubmit` 中也有 `addToast`

**解决方案**：
- 移除 `LLMSettings.tsx` 中的重复提示
- 保留 `LLMProviderModal.tsx` 中的提示

### 20.7 相关文件

| 文件 | 修改说明 |
|------|---------|
| src/types/index.ts | 移除 `isDefault` 字段 |
| src/stores/settingsStore.ts | 实现启用互斥逻辑，移除 setDefaultLLMProvider |
| src/utils/storage.ts | 修改 getDefaultLLMProvider 逻辑 |
| src/pages/LLMSettings.tsx | 移除默认相关逻辑，优化提示 |
| src/components/settings/LLMProviderCard.tsx | 移除"设为默认"开关 |
| src/components/settings/LLMProviderModal.tsx | 移除相关复选框和提示 |
| src/components/ability/AbilityModal.tsx | 增强校验逻辑 |

---

## 21. UI 细节优化（2026-03-13）

### 21.1 LLM 提供商卡片优化

| 优化项 | 变更前 | 变更后 |
|--------|--------|--------|
| 信息展示 | 显示 Base URL + 默认模型文字 | 移除 Base URL，默认模型改为标签展示 |
| 标签设计 | 单标签（类型标签） | 双标签（类型标签 + 默认模型标签） |
| 默认模型标签 | 灰色文字 | 深灰色标签 `bg-gray-200 text-gray-700` |
| 灰色区域 | 包含 Base URL、默认模型、启用开关 | 仅保留启用开关 |
| 操作按钮 | 始终显示 | 悬浮显示（hover 时显示） |

**相关文件**：
- `src/components/settings/LLMProviderCard.tsx`

### 21.2 Agentic 设置页面图标优化

| 卡片 | 图标 | 变更说明 |
|------|------|----------|
| LLM 配置 | Cpu | 保持不变 |
| 工具配置 | Wrench | 从 Settings2 改为 Wrench（扳手） |
| 高级参数 | SlidersHorizontal | 新增图标 |
| Agentic 调试 | Zap | 保持不变 |

**相关文件**：
- `src/components/settings/AgenticSettings.tsx`

**图标导入**：
```typescript
import { ..., Wrench, SlidersHorizontal } from 'lucide-react'
```