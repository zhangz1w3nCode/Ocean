# 命令模块开发文档

> 本文档详细记录了命令模块的开发过程、实现细节和设计决策，供后续开发参考。

---

## 一、需求背景

### 1.1 用户需求

用户需要一个新的命令业务功能，用于管理和复用常用的操作指令。需求要点：

1. 参考现有的资源文件模块和工具模块的设计规范
2. 支持命令的创建、更新、删除操作
3. 首页采用卡片形式展示
4. 创建命令时填写：命令名称、命令描述、命令内容
5. 命令内容支持 Markdown 编辑和预览，与工具模块的角色指令内容一样

### 1.2 设计决策

基于需求分析，做出以下设计决策：

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 数据格式 | Markdown 文件 | 与工具模块保持一致 |
| 存储目录 | `.workflow-maker/commands/` | 与 agents 目录分离 |
| 图标选择 | Terminal | 符合命令的语义 |
| 颜色方案 | 深灰色 (#374151) | 与整体主题保持一致 |
| 表单字段 | 名称、描述、内容 | 简化版，无需模型和颜色选择 |

---

## 二、开发流程

### 2.1 任务分析阶段

在开始开发前，进行了以下分析：

1. **查看 todo.md**：了解项目当前进度和整体结构
2. **查阅设计规范**：阅读 `business-design-doc/tool-design.md` 和 `resources-design.md`
3. **分析现有实现**：阅读工具模块的源代码作为参考
   - `ToolCard.tsx` - 卡片组件实现
   - `ToolModal.tsx` - 创建/编辑弹窗实现
   - `ToolDetailModal.tsx` - 详情弹窗实现
   - `toolStore.ts` - 状态管理实现
   - `storage.ts` - 存储层实现

### 2.2 设计规范编写

首先创建了 `business-design-doc/command-design.md` 设计规范文档，明确了：

- 数据持久化设计（Markdown + frontmatter）
- 颜色体系（灰色主题）
- 组件设计规范
- 页面布局设计
- 表单验证设计
- 与工具模块的差异对比

### 2.3 开发实施顺序

按照以下顺序逐步实现：

```
1. 类型定义 (types/index.ts)
      ↓
2. 状态管理 (commandStore.ts)
      ↓
3. 存储层 (storage.ts)
      ↓
4. Electron IPC (main.ts, preload.ts, launch.cjs, preload.dev.cjs)
      ↓
5. 组件实现 (CommandCard, CommandModal, CommandDetailModal)
      ↓
6. 页面实现 (CommandsPage.tsx)
      ↓
7. 导航集成 (appStore.ts, Sidebar.tsx, MainContent.tsx)
```

---

## 三、实现细节

### 3.1 类型定义

在 `src/types/index.ts` 中添加：

```typescript
// 命令文件类型
export type CommandFileType = 'command'

// 命令文件定义
export interface CommandFile {
  id: string
  name: string          // 从 frontmatter 的 name 字段读取
  type: CommandFileType // 固定为 'command'
  description: string   // 从 frontmatter 的 description 字段读取
  content: string       // frontmatter 后的内容
  createdAt: string
  updatedAt: string     // 从文件系统获取
}
```

**与工具模块的差异**：去掉了 `model` 和 `color` 字段，简化数据结构。

### 3.2 状态管理

创建 `src/stores/commandStore.ts`：

```typescript
import { create } from 'zustand'
import type { CommandFile } from '../types'
import {
  saveCommandFilesToLocal,
  loadCommandFilesFromLocal,
  deleteCommandFileFromLocal,
} from '../utils/storage'

interface CommandState {
  commandFiles: CommandFile[]
  isLoaded: boolean
  setCommandFiles: (commands: CommandFile[]) => void
  addCommandFile: (command: CommandFile) => void
  updateCommandFile: (id: string, updates: Partial<CommandFile>) => void
  deleteCommandFile: (id: string) => void
  loadCommandFiles: () => Promise<void>
}

export const useCommandStore = create<CommandState>((set) => ({
  commandFiles: [],
  isLoaded: false,
  // ... 实现细节
}))
```

**复用模式**：完全参考 `toolStore.ts` 的实现模式。

### 3.3 存储层实现

在 `src/utils/storage.ts` 中添加：

#### 3.3.1 IPC 类型定义

```typescript
// 命令文件相关（Markdown 格式，存储在 commands 目录）
saveCommandFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
loadCommandFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>
deleteCommandFile: (name: string) => Promise<{ success: boolean; error?: string }>
loadAllCommandFiles: () => Promise<{ success: boolean; files?: string[]; error?: string }>
```

#### 3.3.2 Frontmatter 解析

```typescript
// 解析命令 frontmatter（包含 name, description）
const parseCommandFrontmatter = (content: string): { metadata: Record<string, any>; body: string } => {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (match) {
    const frontmatterLines = match[1].split('\n')
    const metadata: Record<string, any> = {}

    for (const line of frontmatterLines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        metadata[key] = value
      }
    }

    return { metadata, body: match[2] }
  }

  return { metadata: {}, body: content }
}
```

#### 3.3.3 Frontmatter 生成

```typescript
// 生成命令格式的 Markdown
const generateCommandMarkdown = (
  metadata: { name: string; description: string },
  content: string
): string => {
  return `---
name: ${metadata.name}
description: ${metadata.description}
---
${content}`
}
```

#### 3.3.4 文件格式示例

```markdown
---
name: git-commit
description: 执行 git 提交操作
---
# 命令内容
执行如下步骤完成 git 提交：
1. 使用 `git status` 查看变更
2. 使用 `git add` 暂存文件
...
```

### 3.4 Electron IPC 实现

#### 3.4.1 main.ts（生产环境）

添加命令文件存储目录：

```typescript
// 命令文件存储目录（commands）
const getCommandsDir = () => {
  const dataDir = path.join(getProjectRoot(), '.workflow-maker', 'commands')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}
```

添加 IPC 处理函数：

```typescript
// 保存命令文件
ipcMain.handle('save-command-file', (_, name: string, content: string) => { ... })

// 加载命令文件
ipcMain.handle('load-command-file', (_, name: string) => { ... })

// 删除命令文件
ipcMain.handle('delete-command-file', (_, name: string) => { ... })

// 加载所有命令文件列表
ipcMain.handle('load-all-command-files', () => { ... })
```

#### 3.4.2 preload.ts（生产环境）

```typescript
// 命令文件数据持久化（Markdown 格式，存储在 commands 目录）
saveCommandFile: (name: string, content: string) =>
  ipcRenderer.invoke('save-command-file', name, content),
loadCommandFile: (name: string) => ipcRenderer.invoke('load-command-file', name),
deleteCommandFile: (name: string) => ipcRenderer.invoke('delete-command-file', name),
loadAllCommandFiles: () => ipcRenderer.invoke('load-all-command-files'),
```

#### 3.4.3 launch.cjs 和 preload.dev.cjs（开发环境）

与生产环境保持相同逻辑，适配 CommonJS 模块格式。

### 3.5 组件实现

#### 3.5.1 CommandCard.tsx

**关键实现**：

```tsx
// 命令统一使用深灰色，与主题保持一致
const colorConfig = {
  color: '#374151',
  bgColor: '#E5E7EB',
}

export const CommandCard: FC<CommandCardProps> = ({ command, onClick, onEdit, onDelete }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="group relative p-4 cursor-pointer h-full" onClick={onClick}>
        {/* 悬浮显示的操作按钮 */}
        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button onClick={(e) => { e.stopPropagation(); onEdit?.() }}>
            <Edit3 size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete?.() }}>
            <Trash2 size={14} />
          </button>
        </div>

        {/* 命令图标 */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
             style={{ backgroundColor: colorConfig.bgColor }}>
          <Terminal size={22} style={{ color: colorConfig.color }} />
        </div>

        {/* 命令信息 */}
        <div className="flex-1 min-w-0">
          <h3>{command.name}</h3>
          <span className="px-2 py-0.5 rounded text-xs">command</span>
          <p className="line-clamp-2">{command.description}</p>
          <p className="text-xs text-macos-text-tertiary">
            更新于 {formatDate(command.updatedAt)}
          </p>
        </div>
      </Card>
    </motion.div>
  )
}
```

**颜色调整历程**：
1. 初始选择：紫色 `#5856D6` / 背景 `#EDE7F6`
2. 第一次调整：灰色 `#6B7280` / 背景 `#F3F4F6`
3. 最终选择：深灰 `#374151` / 背景 `#E5E7EB`（用户反馈灰色太浅）

#### 3.5.2 CommandModal.tsx

**关键功能**：
- 编辑/预览模式切换
- 表单验证（名称必填、内容必填、名称唯一性检查）
- 未保存退出确认

**核心代码**：

```tsx
// 编辑/预览切换
const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

// 验证失败的字段
const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

// 检测是否有修改
const hasChanges = () => {
  return getSnapshot() !== initialSnapshot.current
}

// 表单验证
const handleSubmit = () => {
  if (!name.trim()) {
    setInvalidFields(new Set(['name']))
    addToast('请输入命令名称', 'warning')
    return
  }

  if (mode === 'create' && existingNames.includes(name.trim())) {
    addToast('命令名称已存在，请使用其他名称', 'warning')
    return
  }

  if (!content.trim()) {
    setInvalidFields(new Set(['content']))
    addToast('请输入命令内容', 'warning')
    return
  }

  onConfirm({ name, description, content })
  addToast(mode === 'create' ? '命令创建成功' : '命令更新成功', 'success')
  handleClose(true)
}
```

#### 3.5.3 CommandDetailModal.tsx

**布局设计**：
- 头部固定区域：图标、名称、标签、更新时间
- 内容区域：固定高度 400px，超出滚动
- 底部按钮区域：关闭、编辑

### 3.6 页面实现

CommandsPage.tsx 整体结构与 ToolsPage.tsx 保持一致：

```tsx
export const CommandsPage: FC = () => {
  const { commandFiles, addCommandFile, updateCommandFile, deleteCommandFile, loadCommandFiles } =
    useCommandStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [viewingCommand, setViewingCommand] = useState<CommandFile | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingCommand, setEditingCommand] = useState<CommandFile | undefined>()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingCommandId, setDeletingCommandId] = useState<string | null>(null)

  // 首次加载时从本地读取命令数据
  useEffect(() => {
    loadCommandFiles()
  }, [loadCommandFiles])

  // ... 事件处理函数

  return (
    <div className="h-full p-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {/* 页面头部 */}
        <div className="h-16 px-6 flex items-center justify-between">
          <h1>命令</h1>
          {/* 搜索框 + 新建按钮 */}
        </div>

        {/* 页面内容 */}
        <div className="flex-1 p-6 overflow-y-auto">
          {filteredCommands.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCommands.map((command) => (
                <CommandCard ... />
              ))}
            </div>
          ) : (
            /* 空状态 */
            <div>还没有命令</div>
          )}
        </div>
      </div>

      {/* 弹窗组件 */}
      <CommandModal ... />
      <ConfirmModal ... />
      <CommandDetailModal ... />
    </div>
  )
}
```

### 3.7 导航集成

#### 3.7.1 appStore.ts

```typescript
export type PageType = 'tools' | 'workflows' | 'nodes' | 'resources' | 'commands'
```

#### 3.7.2 Sidebar.tsx

```typescript
import { Terminal } from 'lucide-react'

const navItems: { id: PageType; label: string; icon: typeof Wrench }[] = [
  { id: 'tools', label: '工具', icon: Wrench },
  { id: 'commands', label: '命令', icon: Terminal },  // 新增
  { id: 'workflows', label: '工作流', icon: FolderGit2 },
  { id: 'nodes', label: '节点', icon: SquareStack },
  { id: 'resources', label: '资源文件', icon: Folder },
]
```

#### 3.7.3 MainContent.tsx

```typescript
import { CommandsPage } from '../../pages/CommandsPage'

const pageComponents: Record<PageType, FC> = {
  workflows: WorkflowsPage,
  nodes: NodesPage,
  tools: ToolsPage,
  resources: ResourcesPage,
  commands: CommandsPage,  // 新增
}
```

---

## 四、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/types/index.ts` | 修改 | 添加 CommandFile 和 CommandFileType 类型 |
| `src/stores/commandStore.ts` | 新建 | 命令状态管理 |
| `src/utils/storage.ts` | 修改 | 添加命令文件存储方法和 IPC 类型定义 |
| `electron/main.ts` | 修改 | 添加命令文件 IPC 通道和 getCommandsDir |
| `electron/preload.ts` | 修改 | 暴露命令文件 API |
| `electron/launch.cjs` | 修改 | 开发环境 IPC |
| `electron/preload.dev.cjs` | 修改 | 开发环境 API |
| `src/components/command/CommandCard.tsx` | 新建 | 命令卡片组件 |
| `src/components/command/CommandModal.tsx` | 新建 | 创建/编辑弹窗组件 |
| `src/components/command/CommandDetailModal.tsx` | 新建 | 详情查看弹窗组件 |
| `src/components/command/index.ts` | 新建 | 统一导出 |
| `src/pages/CommandsPage.tsx` | 新建 | 命令页面组件 |
| `src/stores/appStore.ts` | 修改 | 添加 'commands' 到 PageType |
| `src/components/layout/Sidebar.tsx` | 修改 | 添加命令导航项 |
| `src/components/layout/MainContent.tsx` | 修改 | 添加命令页面路由 |
| `business-design-doc/command-design.md` | 新建 | 设计规范文档 |

---

## 五、与工具模块的差异对比

### 5.1 数据结构差异

```typescript
// 工具文件
interface ToolFile {
  id: string
  name: string
  type: ToolFileType
  description: string
  model: string      // 命令无此字段
  color: string      // 命令无此字段
  content: string
  createdAt: string
  updatedAt: string
}

// 命令文件
interface CommandFile {
  id: string
  name: string
  type: CommandFileType
  description: string
  // 无 model 字段
  // 无 color 字段
  content: string
  createdAt: string
  updatedAt: string
}
```

### 5.2 表单字段差异

| 字段 | 工具模块 | 命令模块 |
|------|----------|----------|
| 名称 | 有 | 有 |
| 描述 | 有 | 有 |
| 模型选择 | 有 | 无 |
| 颜色选择 | 有 | 无 |
| 内容 | 有 | 有 |

### 5.3 存储目录差异

```
.workflow-maker/
├── agents/       # 工具文件
├── commands/     # 命令文件（新增）
└── resources/    # 资源文件
```

### 5.4 视觉元素差异

| 元素 | 工具模块 | 命令模块 |
|------|----------|----------|
| 图标 | Bot | Terminal |
| 颜色 | 用户自定义（6种预设） | 固定深灰色 |
| 标签 | sub-agent + 模型名 | command |

---

## 六、开发过程中的调整

### 6.1 颜色调整

**初始设计**：使用紫色作为命令的标识色
- 主色：`#5856D6`
- 背景色：`#EDE7F6`

**用户反馈**：颜色与主题不协调，希望使用灰色

**第一次调整**：
- 主色：`#6B7280` (text-gray-500)
- 背景色：`#F3F4F6` (bg-gray-100)

**用户反馈**：灰色太浅，希望深一点

**最终调整**：
- 主色：`#374151` (text-gray-700)
- 背景色：`#E5E7EB` (bg-gray-200)

---

## 七、测试验证

开发完成后，通过以下方式验证功能：

1. **创建命令**：填写名称、描述、内容，验证保存成功
2. **查看详情**：点击卡片查看命令详情，Markdown 渲染正常
3. **编辑命令**：修改描述和内容，名称不可编辑
4. **删除命令**：确认弹窗后删除，文件同步删除
5. **搜索过滤**：关键词搜索功能正常
6. **持久化**：重启应用后数据正常加载

---

## 八、经验总结

### 8.1 设计模式复用

命令模块完全复用了工具模块的设计模式和代码结构，大大提高了开发效率。主要复用点：

- Zustand 状态管理模式
- Markdown 文件持久化模式
- 组件结构（Card + Modal + DetailModal）
- 表单验证和交互模式

### 8.2 简化原则

命令模块相比工具模块进行了简化：
- 去掉了模型选择
- 去掉了颜色选择
- 使用固定颜色方案

这符合"最小必要功能"原则，避免过度设计。

### 8.3 一致性保证

保持与现有模块的视觉和交互一致性：
- 相同的卡片布局
- 相同的弹窗结构
- 相同的表单验证方式
- 相同的 Toast 提示位置和样式

---

## 九、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.1 | 2026-05-30 | Agentic 接入：创建弹窗增加 Agentic 创建模式，支持输入描述后由 Agent Loop 自动生成命令文档内容 |
| 1.0 | 2025-02-17 | 初始版本，完成命令模块全部功能 |

---

## Agentic 创建模式（2026-05-30）

### 接入说明
命令模块的创建弹窗已接入 Agentic 能力：选择"Agentic 创建"后，输入命令描述，Agent Loop 自动查看已有命令文档并生成新的命令文档内容。模板可在 **设置 → 命令** 页面中配置。

---

*本文档记录了命令模块的完整开发过程，供后续开发参考。*