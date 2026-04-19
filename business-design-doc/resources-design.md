# 资源文件模块前端设计规范

> 本文档总结了资源文件管理模块的前端UI设计、交互效果和视觉规范，供其他模块复用参考。

---

## 重要说明

**资源文件模块的数据持久化方式与其他模块不同：**

- **持久化格式**：Markdown 文件（`.md`）
- **文件命名**：以资源名称命名，如 `节点命名规范.md`
- **元数据存储**：使用 Markdown frontmatter 存储
- **存储位置**：`.workflow-maker/resources/` 目录

**如果其他模块需要参考资源文件模块的设计，请注意持久化方式的差异。**

---

## 一、设计理念

### 1.1 整体风格
- **简约现代**：采用极简设计风格，减少视觉干扰
- **灰色基调**：以灰色、白色为主色调，营造专业、稳重的视觉感受
- **一致性**：所有组件保持统一的视觉语言和交互模式

### 1.2 核心原则
- 避免使用过多的彩色，以灰白为主
- 反馈及时明确，但不过度打扰用户
- 交互状态变化平滑自然，无抖动

---

## 二、颜色体系

### 2.1 主色调

```
灰色系（主要使用）：
- 深灰（文字）：#1F2937 / text-gray-800
- 中灰（次要文字）：#6B7280 / text-gray-500
- 浅灰（边框）：#E5E7EB / border-gray-200
- 超浅灰（背景）：#F3F4F6 / bg-gray-100
- 纯白：#FFFFFF

左侧菜单选中背景：#E5E7EB
```

### 2.2 资源类型颜色

| 类型 | 标签 | 主色 | 背景色 |
|------|------|------|--------|
| 规则说明 | rule | #007AFF | #E3F2FD |
| 参考文档 | reference | #5856D6 | #EDE7F6 |
| 工具说明 | tool | #34C759 | #E8F5E9 |

---

## 三、Markdown 持久化设计

### 3.1 文件格式

资源文件以 Markdown 格式存储，包含 frontmatter 元数据：

```markdown
---
id: resource-1234567890
type: rule
description: 这是规则说明
---

# 标题

资源内容...
```

### 3.2 Frontmatter 字段

| 字段 | 说明 | 示例 |
|------|------|------|
| id | 资源唯一标识 | resource-1234567890 |
| type | 资源类型 | rule / reference / tool |
| description | 资源描述 | 这是规则说明 |

### 3.3 时间处理

**注意：不存储时间字段**

- `createdAt` 和 `updatedAt` 从文件系统获取（文件修改时间）
- 使用 `fs.statSync().mtime` 获取实际修改时间

### 3.4 文件操作

```typescript
// 保存资源文件
saveResourceFile(name: string, content: string)

// 加载资源文件
loadResourceFile(name: string) => { content, mtime }

// 删除资源文件
deleteResourceFile(name: string)

// 获取所有资源文件列表
loadAllResourceFiles() => string[]// 返回文件名列表
```

---

## 四、组件设计

### 4.1 ResourceCard 组件 - 2025-02-25 重新设计

#### 整体布局

```
┌─────────────────────────────────────┐
│  [📄] 资源名称               [✎] [🗑]  │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ # 资源内容预览...           │   │  <- 内容预览区 (bg-gray-50)
│  │ 这是一个规则说明...         │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### 设计规范

```tsx
<Card className="group relative p-0 cursor-pointer h-full flex flex-col">
  {/* 头部区域 */}
  <div className="px-4 pb-0 pt-4">
    <div className="flex items-start justify-between mb-2">
      {/* 左侧：FileText 图标 + 名称 */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
          <FileText size={18} className="text-gray-600" strokeWidth={1.5} />
        </div>
        <h3 className="font-bold text-[17px] text-gray-900">
          {resource.name}
        </h3>
      </div>

      {/* 右侧：操作按钮（悬浮显示） */}
      <div className="flex items-center gap-1">
        <button className="opacity-0 group-hover:opacity-100">
          <Edit3 size={14} />
        </button>
        <button className="opacity-0 group-hover:opacity-100">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  </div>

  {/* 内容预览区 - 浅灰色背景 */}
  <div className="flex-1 mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
      {contentPreview}
    </p>
  </div>
</Card>
```

#### 设计要点

| 元素 | 规范 | 说明 |
|------|------|------|
| 卡片容器 | `p-0` | 移除默认 padding，内部自定义布局 |
| 头部区域 | `pt-4 pb-0 px-4` | 顶部 16px，底部无 padding，左右 16px |
| FileText 图标 | 32x32 圆角方形 | `bg-gray-100` 背景，`text-gray-600` 图标 |
| 名称字体 | `17px font-bold text-gray-900` | 加粗黑色，比之前更大 |
| 操作按钮 | 右上角，悬浮显示 | 编辑和删除按钮，`opacity-0` → `opacity-100` |
| 内容预览区 | `bg-gray-50` 浅灰背景 | 圆角 `rounded-lg`，内边距 `p-4` |
| 内容文字 | `text-xs text-gray-500` | 12px 灰色文字，最多显示 3 行 |
| 间距关系 | 内容区紧贴头部 `mt-0` | 灰色区域顶部接近图标底部，留小间距 |

#### 内容预览处理

```typescript
// 提取资源内容的前 100 个字符，移除 Markdown 符号
const contentPreview = resource.content?.replace(/[#*`]/g, '').slice(0, 100) || ''
```

#### 配色方案

| 元素 | 背景色 | 文字色 | 边框色 |
|------|--------|--------|--------|
| 卡片背景 | `#FFFFFF` | - | `#E5E5E5` |
| FileText 图标容器 | `#F3F4F6` (gray-100) | - | - |
| FileText 图标 | - | `#4B5563` (gray-600) | - |
| 名称文字 | - | `#111827` (gray-900) | - |
| 内容预览区 | `#F9FAFB` (gray-50) | `#6B7280` (gray-500) | - |
| 操作按钮 | hover: `#F3F4F6` | `#6B7280` | - |
| 删除按钮 | hover: `#FEF2F2` | hover: `#FF3B30` | - |

#### 交互状态

| 状态 | 效果 |
|------|------|
| 默认 | 卡片无边框阴影，操作按钮隐藏 |
| 悬浮 | 卡片上浮 2px + 阴影，操作按钮显示 |
| 点击 | 触发 `onClick`，打开详情弹窗 |

---

### 4.1 ResourceCard 组件 - 旧版设计（已废弃）

> 注：此设计已於 2025-02-25 废弃，改为上方的新设计。

资源卡片组件，展示资源基本信息。

**Props 接口**：
```typescript
interface ResourceCardProps {
  resource: ResourceFile
  onClick?: () => void// 点击卡片 - 查看详情
  onEdit?: () => void// 编辑按钮
  onDelete?: () => void// 删除按钮
}
```

**交互行为**：
- 点击卡片：打开详情弹窗（只读查看）
- 悬浮显示：编辑、删除按钮
- 动画效果：悬浮上浮 2px

**样式规范**：
```css
/* 卡片基础 */
background-color: white;
border: 1px solid #E5E7EB;
border-radius: 0.75rem;/* rounded-xl */

/* 悬浮效果 */
transform: translateY(-2px);
box-shadow: 0 4px 12px rgba(0,0,0,0.08);
```

### 4.2 ResourceModal 组件

创建/编辑资源的弹窗组件。

**Props 接口**：
```typescript
interface ResourceModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (resource: Omit<ResourceFile, 'id' | 'createdAt' | 'updatedAt'>) => void
  mode: 'create' | 'edit'
  initialData?: ResourceFile
  existingNames?: string[]
}
```

**表单字段**：
- 资源名称（必填，编辑时不可修改）
- 资源类型（三选一：规则说明/参考文档/工具说明）
- 资源描述
- 资源内容（必填，支持 Markdown）

**编辑/预览切换**：
```tsx
{/* 编辑/预览切换按钮 */}
<div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
  <button onClick={() => setViewMode('edit')}>编辑</button>
  <button onClick={() => setViewMode('preview')}>预览</button>
</div>
```

---

### 4.2.1 MarkdownEditor 编辑器组件

#### 组件定位

`MarkdownEditor` 是资源文件"资源内容"字段的专用编辑器，提供专业的 Markdown 编辑体验。

#### 核心功能

| 功能 | 说明 |
|------|------|
| Markdown 语法高亮 | 使用 `materialLight` 主题，实时高亮标题、加粗、斜体、代码块等 |
| @引用功能 | 输入@符号触发引用选择弹窗，支持引用其他业务内容 |
| 引用块高亮 | 自定义装饰器高亮 `` `resources/xxx.md` `` 格式的引用路径 |
| 表单集成 | 支持表单验证、禁用状态等标准表单属性 |

#### 使用示例

```tsx
import { MarkdownEditor } from '../ui'

<MarkdownEditor
  placeholder="在此输入资源文件的详细内容，支持 Markdown 格式..."
  value={content}
  onChange={(e) => setContent(e.target.value)}
  rows={12}
  invalid={invalidFields.has('content')}
  excludePath={mode === 'edit' && initialData ? `.claude/resources/${initialData.name}.md` : undefined}
/>
```

#### 技术选型

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@uiw/react-codemirror` | ^4.25.4 | CodeMirror React 封装 |
| `@codemirror/lang-markdown` | ^6.5.0 | Markdown 语言支持 |
| `@uiw/codemirror-themes-all` | ^4.25.5 | 主题包（使用 materialLight） |

#### 语法高亮效果

使用 `materialLight` 主题提供的语法高亮：

| 语法元素 | 高亮效果 |
|---------|---------|
| 标题（#）| 蓝色、加粗 |
| 加粗（**text**）| 加粗显示 |
| 斜体（*text*）| 斜体显示 |
| 代码块（```）| 背景色区分 |
| 内联代码（`code`）| 背景色区分 |
| 引用路径（`xxx.md`）| 蓝色背景 + 蓝色文字 |

#### 详细设计文档

完整的技术实现细节请参考：`function-design-doc/markdown-high-light-design-doc.md`

### 4.3 ResourceDetailModal 组件

资源详情查看弹窗（只读）。

**Props 接口**：
```typescript
interface ResourceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  resource: ResourceFile | null
}
```

**Markdown 渲染**：
```tsx
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeHighlight]}
  className="prose prose-custom prose-sm max-w-none prose-code-custom..."
>
  {resource.content}
</ReactMarkdown>
```

> 注：预览模式和详情弹窗都需要添加 `rehypeHighlight` 插件以支持代码块语法高亮。

---

## 五、页面布局设计

### 5.1 页面结构

```
┌─────────────────────────────────────────┐
│ 页面头部│
│标题搜索框│ 新建按钮│
├─────────────────────────────────────────┤
││
│页面内容区域│
│ - 资源卡片网格│
│ - 或空状态提示│
││
└─────────────────────────────────────────┘
```

### 5.2 空状态设计

```tsx
{/* 空状态 */}
<div className="h-full flex flex-col items-center justify-center text-center">
  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
    <FileText size={32} className="text-macos-text-tertiary" />
  </div>
  <h3>还没有资源文件</h3>
  <p>创建资源文件来管理你的规则、参考文档和工具说明</p>
</div>
```

**注意**：空状态下不显示"创建"按钮，用户通过页面头部的"新建资源"按钮创建。

---

## 六、状态管理

### 6.1 ResourceStore

```typescript
interface ResourceState {
  resourceFiles: ResourceFile[]
  isLoaded: boolean
  setResourceFiles: (resources: ResourceFile[]) => void
  addResourceFile: (resource: ResourceFile) => void
  updateResourceFile: (id: string, updates: Partial<ResourceFile>) => void
  deleteResourceFile: (id: string) => void
  loadResourceFiles: () => Promise<void>
}
```

### 6.2 数据流

```
用户操作 → Store方法 → storage.ts → Electron IPC → 文件系统
                                    ↘ localStorage（浏览器环境）
```

---

## 七、类型定义

```typescript
// 资源文件类型
export type ResourceFileType = 'rule' | 'reference' | 'tool'

// 资源文件定义
export interface ResourceFile {
  id: string
  name: string
  type: ResourceFileType
  description?: string
  content?: string
  createdAt: string// 从文件系统获取
  updatedAt: string// 从文件系统获取
}
```

---

## 八、依赖库

### 8.1 Markdown 渲染

```bash
pnpm add react-markdown remark-gfm rehype-highlight highlight.js
```

- `react-markdown`：Markdown 渲染库
- `remark-gfm`：支持 GitHub 风格 Markdown（表格、删除线等）
- `rehype-highlight`：代码块语法高亮 rehype 插件
- `highlight.js`：提供语法高亮样式（支持 190+ 语言）

### 8.2 Tailwind Typography

```bash
pnpm add -D @tailwindcss/typography
```

tailwind.config.js 配置：
```javascript
plugins: [
  require('@tailwindcss/typography'),
],
```

### 8.3 使用示例

```tsx
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

<div className="prose prose-custom prose-sm max-w-none prose-headings:text-macos-text prose-p:text-macos-text-secondary prose-code-custom">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
  >
    {content}
  </ReactMarkdown>
</div>
```

---

## 九、常见问题与解决方案

### 9.1 文件名与资源名称

**问题**：资源名称修改后，文件名如何同步？

**解决方案**：
```typescript
// 保存时对比现有文件列表
const existingFiles = await loadAllResourceFiles()
const currentNames = resources.map(r => r.name)

// 删除不再需要的文件
for (const fileName of existingFiles) {
  const resourceName = fileName.replace(/\.md$/, '')
  if (!currentNames.includes(resourceName)) {
    await deleteResourceFile(resourceName)
  }
}
```

### 9.2 文件修改时间获取

**问题**：如何获取文件的实际修改时间？

**解决方案**：
```typescript
// Electron 主进程
ipcMain.handle('load-resource-file', (_, name) => {
  const stats = fs.statSync(filePath)
  return {
    success: true,
    content,
    mtime: stats.mtime.toISOString()
  }
})
```

### 9.3 Markdown 内容中的特殊字符

**问题**：frontmatter 与内容分隔

**解决方案**：
```typescript
// 解析 frontmatter
const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
const match = content.match(frontmatterRegex)

if (match) {
  const metadata = parseFrontmatterLines(match[1])
  const body = match[2]
  return { metadata, body }
}
```

---

## 十、设计检查清单

在开发类似模块时，请检查以下项目：

- [ ] 输入框默认边框是否为 `border-gray-200`
- [ ] 输入框悬浮边框是否为 `border-gray-300`
- [ ] 输入框聚焦边框是否为 `border-gray-400`
- [ ] 输入框聚焦是否有阴影效果
- [ ] 按钮是否使用灰色主题
- [ ] 按钮是否移除了蓝色聚焦环
- [ ] 弹窗是否移除了分隔线
- [ ] 卡片悬浮是否有上浮+阴影效果
- [ ] 空状态是否完全居中
- [ ] 空状态是否移除了"创建"按钮

---

## 十一、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.3 | 2025-02-25 | 重新设计 ResourceCard 卡片布局：采用与 AgentCard 一致的简约灰白色调 |
| 1.3 | 2025-02-25 | 使用 MarkdownEditor 组件替代 ReferenceTextarea |
| 1.2 | 2025-02-25 | 新增：代码块语法高亮功能支持 |
| 1.1 | 2025-02-14 | 新增详情弹窗固定高度滚动设计 |
| 1.0 | 2025-02-14 | 初始版本，基于资源文件模块设计规范 |

---

## 十二、详情弹窗设计

### 12.1 弹窗结构

```
┌─────────────────────────────────────────┐
│  [图标] 资源名称     [类型标签] [时间] │  <- 头部固定区域
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）        │
│                                         │
│  [资源描述]                             │
│  [资源内容 - Markdown 渲染]             │
│                                         │
├─────────────────────────────────────────┤
│  关闭                       [编辑]      │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

### 12.2 样式规范

```css
/* 头部固定区域 */
.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;                     /* gap-4 */
  padding-bottom: 1rem;          /* pb-4 */
  margin-bottom: 1rem;           /* mb-4 */
  border-bottom: 1px solid #F3F4F6;  /* border-gray-100 */
}

/* 内容区域 - 固定高度滚动 */
.detail-content {
  max-height: 400px;             /* max-h-[400px] */
  overflow-y: auto;
  padding-right: 0.5rem;         /* pr-2 - 滚动条空间 */
}
```

### 12.3 完整示例代码

```tsx
// ResourceDetailModal 组件
<Modal isOpen={isOpen} onClose={onClose} title="" size="xl">
  {/* 头部信息 - 固定在顶部 */}
  <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
    {/* 资源图标 */}
    <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
         style={{ backgroundColor: config.bgColor }}>
      <Icon size={28} style={{ color: config.color }} />
    </div>

    {/* 资源信息 */}
    <div className="flex-1 min-w-0">
      <h2 className="text-xl font-semibold text-macos-text mb-1">{resource.name}</h2>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: config.bgColor, color: config.color }}>
          {config.label}
        </span>
        <span className="text-sm text-macos-text-tertiary">{formatDate(resource.updatedAt)}</span>
      </div>
    </div>
  </div>

  {/* 内容区域 - 固定高度，超出滚动 */}
  <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
    {/* 资源描述 */}
    {resource.description && (
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <MessageSquare size={16} />
          资源描述
        </label>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-macos-text-secondary">{resource.description}</p>
        </div>
      </div>
    )}

    {/* 资源内容 */}
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
        <FileText size={16} />
        资源内容
      </label>
      <div className="bg-gray-50 rounded-lg p-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
        >
          {resource.content}
        </ReactMarkdown>
      </div>
    </div>
  </div>
</Modal>
```

---

## Markdown 预览功能参考

资源文件模块的 Markdown 预览功能（行内代码样式、代码块语法高亮等）与智能体模块保持一致，详细设计规范请参考：

- **行内代码样式**：`business-design-doc/agent-design.md` 第十一章
- **代码块语法高亮**：`business-design-doc/agent-design.md` 第十二章
- **功能设计文档**：`function-design-doc/code-block-syntax-highlight-design.md`

---

## 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.3 | 2025-02-25 | 重新设计 ResourceCard 卡片布局：采用与 AgentCard 一致的简约灰白色调，移除彩色元素和类型标签，改为 FileText 图标 + 内容预览区设计 |
| 1.3 | 2025-02-25 | 使用 MarkdownEditor 组件替代 ReferenceTextarea，实现编辑模式 Markdown 语法高亮 |
| 1.2 | 2025-02-25 | 新增：代码块语法高亮功能支持，参考 agent-design.md |
| 1.1 | 2025-02-14 | 新增详情弹窗固定高度滚动设计 |
| 1.0 | 2025-02-14 | 初始版本，基于资源文件模块设计规范 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*