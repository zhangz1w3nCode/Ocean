# @引用功能设计规范文档

## 功能概述

用户在编辑业务（智能体、命令、节点、工作流、资源文件）时，在输入框中输入@后弹出选择框，包含这5个业务下已创建的内容，选中后写入带反引号的引用路径（如 `` `.claude/agents/智能体名.md` ``）。

这个功能可以让用户在各业务模块之间进行交叉引用，建立知识关联。

---

## 两种引用方式

### @ 引用（蓝色高亮）

- **触发方式**: 输入 `@` 符号
- **输出格式**: `` `.claude/agents/智能体名.md` ``
- **高亮颜色**: 蓝色（`#DBEAFE` 背景 / `#1D4ED8` 文字）

### % WikiLink 引用（黄色高亮）

- **触发方式**: 输入 `%` 符号（Shift + 5）
- **输出格式**:
  - 无关系: `[[`.claude/agents/智能体名.md`]]`
  - 有关系: `[[`.claude/agents/智能体名.md`|关系]]`
- **高亮颜色**: 黄色（`#FEF3C7` 背景 / `#D97706` 文字）

两种引用方式的区别：
- **@ 引用**: 简洁快捷，直接插入路径引用
- **% WikiLink**: 支持添加"关系"描述，用于知识图谱等场景

---

## 文件存储路径

| 业务模块 | 存储路径 |
|---------|---------|
| 智能体 | `.claude/agents/{name}.md` |
| 命令 | `.claude/commands/{name}.md` |
| 节点 | `.claude/nodes/{name}.md` |
| 工作流 | `.claude/workflows/{name}/WORKFLOW.md` |
| 资源文件 | `.claude/resources/{name}.md` |
| 能力 | `.claude/abilities/{name}.md` |

**注意**: 工作流使用文件夹结构存储，每个工作流有独立的目录，主文件为 `WORKFLOW.md`，节点文件存放在 `nodes/` 子目录下。

---

## 引用格式

### 引用具体文件

选中具体文件后，插入的格式为：

```
`.claude/agents/智能体名.md`
```

### 引用整个库

选中整个库后，插入的格式为：

```
`.claude/agents/`
```

使用反引号包裹路径，符合 Markdown 代码语法，便于后续解析和渲染。

---

## WikiLink 引用格式

### WikiLink 基本格式

```
[[`.claude/agents/智能体名.md`]]
```

### WikiLink 带关系格式

```
[[`.claude/agents/智能体名.md`|父子]]
[[`.claude/agents/智能体名.md`|依赖]]
[[`.claude/agents/智能体名.md`|关联]]
```

**格式说明**:
- 使用双中括号 `[[` 和 `]]` 包裹整个引用
- 路径部分仍然使用反引号包裹
- `|` 后面是关系描述，可选
- 整个 WikiLink 块在编辑器中显示为黄色高亮

---

## 引用类型

### 具体文件引用

引用某个具体的业务文件，如某个智能体、某个节点等。

### 库引用

引用整个业务库，用于告诉AI某个业务库的位置。例如：
- 智能体库：`.claude/agents/`
- 节点库：`.claude/nodes/`
- 工作流库：`.claude/workflows/`
- 资源文件库：`.claude/resources/`
- 命令库：`.claude/commands/`
- 能力库：`.claude/abilities/`

---

## 类型定义

### ReferenceItem

```typescript
export interface ReferenceItem {
  id: string
  name: string
  category: 'agents' | 'nodes' | 'workflows' | 'resources' | 'commands' | 'abilities'
  path: string  // 相对路径，如 ".claude/agents/智能体名.md" 或 ".claude/agents/"
  description?: string
  isLibrary?: boolean  // 是否引用整个库
}
```

---

## 核心组件

### useReferenceItems Hook

**文件**: `flow-editor/src/hooks/useReferenceItems.ts`

**功能**:
- 从各业务 Store 获取数据
- 转换为 ReferenceItem 格式
- 支持排除特定路径（excludePath），编辑时排除当前正在编辑的项目

**使用示例**:
```typescript
// 创建模式：不排除任何项目
const referenceItems = useReferenceItems({})

// 编辑模式：排除当前正在编辑的项目
const referenceItems = useReferenceItems({
  excludePath: '.claude/agents/当前智能体名.md'
})
```

---

### ReferenceSelectModal 组件

**文件**: `flow-editor/src/components/ui/ReferenceSelectModal.tsx`

**布局**: 左右分栏
- **左侧**: 分类列表（智能体、节点、工作流、资源文件、命令、能力），每个分类显示数量
- **右侧**: 当前分类下的文件列表，只显示图标和名称

**尺寸规范**（2026-03-01 更新）:
| 属性 | 值 | 说明 |
|------|------|------|
| 整体宽度 | 520px | 优化后宽度 |
| 左侧分类宽度 | 144px (w-36) | 足够显示"资源文件"等较长名称 |
| 右侧文件列表宽度 | 自适应 | flex-1 填充剩余空间 |
| 弹窗高度 | 288px (h-72) | 固定高度 |

**功能**:
- 搜索过滤功能
- 键盘导航（上下键选择、左右键切换分类、Enter确认、Esc关闭）
- 支持默认选中指定引用项（编辑模式）
- 使用 `useRef` 跟踪初始化状态，避免分类切换时闪烁

**Props**:
```typescript
interface ReferenceSelectModalProps {
  isOpen: boolean
  onClose: () => void
  items: ReferenceItem[]
  onSelect: (item: ReferenceItem) => void
  position?: { x: number; y: number }
  defaultSelectedPath?: string  // 默认选中的引用路径
}
```

---

### MarkdownEditor 组件（推荐）

**文件**: `flow-editor/src/components/ui/MarkdownEditor/MarkdownEditor.tsx`

**基于**: CodeMirror 编辑器

**功能**:
- Markdown 语法高亮（标题、加粗、斜体、代码块等）
- @引用功能（输入@触发选择弹窗）
- 引用块高亮显示
- **退格键整体删除引用块**
- **点击引用块重新编辑**
- **光标跳跃（左箭头从末尾跳到开头，右箭头从开头跳到末尾）**

**Props**:
```typescript
interface MarkdownEditorProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  label?: string
  error?: string
  invalid?: boolean
  excludePath?: string  // 排除特定路径（如 "agents/xxx.md"）
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
}
```

---

### ReferenceTextarea 组件（备用）

**文件**: `flow-editor/src/components/ui/ReferenceTextarea.tsx`

**架构**: 双层渲染
- **底层**: 透明的 textarea 输入层（`text-transparent`），负责输入和光标
- **顶层**: 高亮覆盖层，负责渲染带样式的引用块

**功能**:
- 继承现有 Textarea 属性
- 监听 @ 输入，弹出选择弹窗
- 引用块蓝色高亮显示（`bg-blue-100 text-blue-700`）
- 点击引用块重新打开选择弹窗（编辑模式）
- 光标在引用块边界跳跃（左右箭头键）
- 退格键整体删除引用块
- 选中后光标自动定位到引用块末尾

**Props**:
```typescript
interface ReferenceTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  invalid?: boolean
  excludePath?: string  // 排除特定路径（如 "nodes/xxx.md"）
}
```

---

## 设计规范要点

### 颜色方案

#### @ 引用（蓝色）
- 引用块背景: `#DBEAFE` (blue-100)
- 引用块文字: `#1D4ED8` (blue-700)
- 引用块悬浮: `hover:bg-blue-200`
- 引用块可点击: `cursor: pointer`

#### % WikiLink（黄色）
- WikiLink 背景: `#FEF3C7` (yellow-100)
- WikiLink 文字: `#D97706` (yellow-600)
- WikiLink 悬浮: `hover:bg-yellow-200`
- WikiLink 可点击: `cursor: pointer`

#### 共同规范
- 灰色系主题，不使用蓝色作为边框强调色
- 引用块可点击: `cursor: pointer`

### 动画
- 使用 framer-motion
- duration: `0.15s`
- 入场: `opacity: 0 -> 1, scale: 0.95 -> 1, y: 10 -> 0`
- 出场: 反向动画

### z-index层级
- 遮罩层: `z-[60]`
- 弹窗内容: `z-[70]`

### 圆角
- 小元素: `rounded-lg`
- 弹窗: `rounded-xl`

### 文字对齐
- textarea 和覆盖层使用等宽字体 `font-mono`
- 统一 `lineHeight: 1.5` 和 `letterSpacing: normal`
- 确保引用块后的文字正确对齐

---

## 分类图标映射

| 分类 | 图标组件 | 图标名称 |
|------|---------|---------|
| agents | Bot | 机器人图标 |
| nodes | Box | 盒子图标 |
| workflows | GitBranch | 分支图标 |
| resources | Folder | 文件夹图标 |
| commands | Terminal | 终端图标 |
| abilities | Zap | 闪电图标 |

**注意**: 图标与侧边栏导航保持一致，确保视觉统一。

---

## 分类标签映射

| 分类 | 显示标签 |
|------|---------|
| agents | 智能体 |
| nodes | 节点 |
| workflows | 工作流 |
| resources | 资源文件 |
| commands | 命令 |
| abilities | 能力 |

---

## 各业务模块集成

### AgentModal（智能体）
- 使用 MarkdownEditor 替换 `content` 字段
- 编辑模式：`excludePath: .claude/agents/${initialData.name}.md`
- 创建模式：不排除任何项目

### NodeModal（节点）
- 使用 ReferenceTextarea 替换多个字段: task, inputs, outputs, requiredActions, forbiddenActions, additionalNotes
- 自定义属性 value 字段
- 编辑模式：`excludePath: .claude/nodes/${initialData.name}.md`
- 创建模式：不排除任何项目

### ResourceModal（资源文件）
- 使用 ReferenceTextarea 替换 `content` 字段
- 编辑模式：`excludePath: .claude/resources/${initialData.name}.md`
- 创建模式：不排除任何项目

### CommandModal（命令）
- 使用 MarkdownEditor 替换 `content` 字段
- 编辑模式：`excludePath: .claude/commands/${initialData.name}.md`
- 创建模式：不排除任何项目

### AbilityModal（能力）
- 使用 MarkdownEditor 替换 `content` 字段
- 编辑模式：`excludePath: .claude/abilities/${initialData.name}.md`
- 创建模式：不排除任何项目

---

## 键盘交互

### 编辑器内键盘操作

| 按键 | 功能 |
|------|------|
| `@` | 打开 @ 引用选择弹窗，选择后插入蓝色高亮引用块 |
| `%` (Shift + 5) | 打开 WikiLink 选择弹窗，选择后插入黄色高亮 WikiLink |
| `Backspace` | 在引用块/WikiLink 末尾时整体删除整个块 |
| `左箭头` | 光标在引用块/WikiLink 末尾时跳到开头 |
| `右箭头` | 光标在引用块/WikiLink 开头时跳到末尾 |

### 弹窗内键盘操作

| 按键 | 功能 |
|------|------|
| `上箭头` | 向上选择文件 |
| `下箭头` | 向下选择文件 |
| `左箭头` | 切换到上一个分类 |
| `右箭头` | 切换到下一个分类 |
| `Enter` | 确认选择 |
| `Esc` | 关闭弹窗 |

### 光标跳跃行为
- 光标在引用块末尾时，按左箭头跳到引用块开头
- 光标在引用块开头时，按右箭头跳到引用块末尾
- 光标不会逐字符穿过引用块内部

---

## 引用块渲染

### MarkdownEditor 中

#### @ 引用块（蓝色）
使用 CodeMirror 的 StateField 装饰器高亮引用块，分成三部分：
- 开始反引号：蓝色文字
- 路径部分：蓝色背景 + 蓝色文字 + 圆角 + 可点击光标
- 结束反引号：蓝色文字

#### % WikiLink 块（黄色）
WikiLink 整体渲染为一个黄色高亮块：
- 整个 `[[`.claude/xxx.md`]]` 或 `[[`.claude/xxx.md`|关系]]` 都是黄色背景
- 不再单独高亮内部的路径部分
- 点击可重新编辑

### 正则匹配
```typescript
// @ 引用正则
const REFERENCE_PATTERN = /`([^`\n]+(\.md|\/))`/g

// % WikiLink 正则
const WIKI_LINK_PATTERN = /\[\[`([^`]+)`(\|[^\]]+)?\]\]/g
```

### ReferenceTextarea 中
使用双层渲染，引用块分成三部分渲染：

```tsx
<span className="text-blue-700">`</span>
<span className="bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors cursor-pointer">
  {path}
</span>
<span className="text-blue-700">`</span>
```

这样设计的好处：
- 光标在引用块边界时不会被背景色遮挡
- 反引号保持透明，视觉上更清晰
- 引用块可点击，提示用户可以重新编辑

---

## 点击编辑功能

- 点击引用块内部（不包括开始和结束边界）可重新打开选择弹窗
- 弹窗默认选中当前引用项所在的分类和具体项
- 选择新项后自动替换原引用
- 点击引用块后面的位置不会触发弹窗

---

## 排除逻辑

### 设计原则
编辑时应该只排除当前正在编辑的项目，而不是整个分类。

### 实现方式
- 使用 `excludePath` 参数指定要排除的路径
- 创建模式：不传递 `excludePath`，可以引用所有项目
- 编辑模式：传递当前项目的路径，排除自己但保留同类型的其他项目

### 示例
```typescript
// 编辑名为 "ant-doc-agent" 的智能体时
<MarkdownEditor
  excludePath=".claude/agents/ant-doc-agent.md"
  // 其他智能体仍可出现在引用列表中
/>
```

---

## 实现文件清单

| 文件路径 | 说明 |
|---------|------|
| `src/hooks/useReferenceItems.ts` | 引用数据 Hook |
| `src/components/ui/ReferenceSelectModal.tsx` | 引用选择弹窗 |
| `src/components/ui/ReferenceTextarea.tsx` | 引用输入框（备用） |
| `src/components/ui/MarkdownEditor/MarkdownEditor.tsx` | Markdown 编辑器（推荐） |
| `src/components/ui/MarkdownEditor/referenceHighlight.ts` | 引用块高亮扩展 |
| `src/components/agent/AgentModal.tsx` | 智能体编辑弹窗 |
| `src/components/node/NodeModal.tsx` | 节点编辑弹窗 |
| `src/components/resource/ResourceModal.tsx` | 资源编辑弹窗 |
| `src/components/command/CommandModal.tsx` | 命令编辑弹窗 |
| `src/components/ability/AbilityModal.tsx` | 能力编辑弹窗 |

---

## 更新日志

### 2026-04-06
- **修复 @ 和 % 引用弹窗反复触发的 Bug**
  - 问题描述：编辑器内容中已有 `@` 或 `%` 字符时，后续不管输入什么都会反复弹出选择弹窗
  - 根本原因：`handleEditorChange` 使用 `value.lastIndexOf('@')` 搜索整个文本，文本中任何位置的 `@`/`%` 后跟空白都会触发
  - 修复方案：改为通过 `editorRef.current` 获取当前光标位置，只检查光标前一个字符是否为触发字符
  - 修正 `useCallback` 依赖数组，补充 `editingWikiLink` 依赖
  - 影响范围：所有使用 MarkdownEditor 的业务模块

### 2026-03-14 (第二次更新)
- **WikiLink 关系输入弹窗优化**
  - 将"跳过"按钮改为"返回"按钮
  - 点击返回后：
    - 新建模式：不删除已插入的 WikiLink，重新打开文件选择弹窗，重新选择后替换原位置
    - 编辑模式：关闭弹窗回到编辑器
  - 遮罩层点击行为改为返回
  - Enter 键直接确认（关系为空则生成不带关系的 WikiLink）
  - 修复返回后重新选择文件时 WikiLink 位置错误的问题

### 2026-03-14
- **工作流引用路径修复**
  - 工作流目录结构已变更为文件夹格式：`.claude/workflows/{name}/WORKFLOW.md`
  - 更新 `useReferenceItems.ts` 中的路径生成逻辑
  - 更新文档中文件存储路径表格
- **WikiLink 关系输入校验修复**
  - 不输入关系直接点"确认"时，自动视为跳过处理
  - 避免生成错误格式 `[[\`path\`|]]`
  - Enter 键也遵循校验逻辑

### 2026-03-03
- **新增 % WikiLink 引用功能**
  - 按 `%`（Shift + 5）触发 WikiLink 选择弹窗
  - 选择后先插入不带关系的 WikiLink：`[[.claude/xxx.md`]]`
  - 随后弹出关系输入框，用户可选填关系
  - WikiLink 整块显示为黄色高亮（`#FEF3C7` / `#D97706`）
- **复用 ReferenceSelectModal 弹窗**
  - WikiLink 和 @ 引用共用同一个选择弹窗
- **WikiLink 交互支持**
  - 点击 WikiLink 可重新编辑
  - 退格键支持整体删除 WikiLink
  - 光标跳跃支持 WikiLink 边界

### 2026-03-01
- 新增能力（abilities）分类支持
- 图标统一：引用弹窗图标与侧边栏保持一致（智能体 Bot、节点 Box、资源文件 Folder、能力 Zap）
- 宽度优化：左侧分类列表从 112px 加宽到 144px，整体弹窗从 480px 调整到 520px
- 项目选择页面 Logo 调整：从橙色改为灰色系

### 2025-03-01
- 引用路径添加 `.claude/` 前缀，所有引用路径改为完整相对路径格式
- 新增库引用功能，支持引用整个业务库（如 `.claude/agents/`、`.claude/nodes/` 等）
- 引用选择弹窗中库引用项显示特殊样式（蓝色文件夹图标 + 蓝色文字）
- ReferenceItem 类型新增 `isLibrary` 字段标识库引用

### 2025-02-25
- 将 `excludeCategory` 改为 `excludePath`，编辑时只排除当前项目而非整个分类
- MarkdownEditor 添加退格键整体删除引用块功能
- MarkdownEditor 添加点击引用块重新编辑功能
- MarkdownEditor 添加光标跳跃功能
- 修复点击边界问题，只有点击引用块内部才会触发弹窗
- ReferenceSelectModal 使用 `useRef` 跟踪初始化状态，避免分类切换时闪烁

---

## 未来扩展

1. **引用预览**: 悬浮显示引用内容预览
2. **引用跳转**: 点击引用路径跳转到对应业务详情
3. **引用验证**: 检测引用路径是否存在
4. **引用统计**: 统计每个业务模块被引用的次数