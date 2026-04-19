# 命令模块前端设计规范

> 本文档总结了命令模块的前端UI设计、交互效果和视觉规范，参考工具模块设计规范编写。

---

## 一、设计理念

### 1.1 整体风格
- **简约现代**：采用极简设计风格，减少视觉干扰
- **灰色基调**：以灰色、白色为主色调，营造专业、稳重的视觉感受
- **一致性**：与节点模块、资源文件模块、工具模块保持统一的视觉语言和交互模式

### 1.2 核心原则
- 避免使用过多的彩色，以灰白为主
- 颜色点缀仅用于图标标识
- 反馈及时明确，但不过度打扰用户
- 交互状态变化平滑自然，无抖动

---

## 二、数据持久化设计

### 2.1 存储格式

命令模块采用 **Markdown 文件持久化**，与工具模块类似，但 frontmatter 更简单：

```markdown
---
name: git-commit
description: 执行 git 提交操作...
---
# 命令内容
执行如下步骤完成 git 提交：
1. 使用 `git status` 查看变更
2. 使用 `git add` 暂存文件
...
```

### 2.2 存储位置

```
.workflow-maker/
├── agents/           # 工具文件（sub-agent）存储目录
├── resources/        # 资源文件存储目录
├── commands/         # 命令文件存储目录（新增）
│   └── {name}.md
└── ...
```

### 2.3 Frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 命令名称，作为文件名 |
| description | string | 否 | 命令描述 |

**与工具模块的关键差异**：
- 没有 model 字段（命令不需要选择模型）
- 没有 color 字段（使用统一的图标颜色）
- 结构更简单，只需名称、描述和内容

---

## 三、颜色体系

### 3.1 主色调

```
灰色系（主要使用）：
- 深灰（文字）：#1F2937 / text-gray-800
- 中灰（次要文字）：#6B7280 / text-gray-500
- 浅灰（边框）：#E5E7EB / border-gray-200
- 超浅灰（背景）：#F3F4F6 / bg-gray-100
- 纯白：#FFFFFF
```

### 3.2 命令图标颜色（统一使用深灰色）

| 颜色 | 主色 | 背景色 |
|------|------|--------|
| 深灰 | #374151 | #E5E7EB |

命令模块统一使用深灰色作为标识颜色，与整体主题保持一致。

---

## 四、组件设计

### 4.1 命令卡片 (CommandCard) - 2025-02-25 重新设计

#### 整体布局

```
┌─────────────────────────────────────┐
│  [⌘] 命令名称               [✎] [🗑]  │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ # 命令说明 - 执行git...     │   │  <- 内容预览区 (bg-gray-50)
│  │ - 第一步：检查...           │   │
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
      {/* 左侧：Terminal 图标 + 名称 */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
          <Terminal size={18} className="text-gray-600" strokeWidth={1.5} />
        </div>
        <h3 className="font-bold text-[17px] text-gray-900">
          {command.name}
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
| Terminal 图标 | 32x32 圆角方形 | `bg-gray-100` 背景，`text-gray-600` 图标 |
| 名称字体 | `17px font-bold text-gray-900` | 加粗黑色，比之前更大 |
| 操作按钮 | 右上角，悬浮显示 | 编辑和删除按钮，`opacity-0` → `opacity-100` |
| 内容预览区 | `bg-gray-50` 浅灰背景 | 圆角 `rounded-lg`，内边距 `p-4` |
| 内容文字 | `text-xs text-gray-500` | 12px 灰色文字，最多显示 3 行 |
| 间距关系 | 内容区紧贴头部 `mt-0` | 灰色区域顶部接近图标底部，留小间距 |

#### 内容预览处理

```typescript
// 提取命令内容的前 100 个字符，移除 Markdown 符号
const contentPreview = command.content?.replace(/[#*`]/g, '').slice(0, 100) || ''
```

#### 配色方案

| 元素 | 背景色 | 文字色 | 边框色 |
|------|--------|--------|--------|
| 卡片背景 | `#FFFFFF` | - | `#E5E5E5` |
| Terminal 图标容器 | `#F3F4F6` (gray-100) | - | - |
| Terminal 图标 | - | `#4B5563` (gray-600) | - |
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

### 4.2 命令卡片 (CommandCard) - 旧版设计（已废弃）

> 注：此设计已於 2025-02-25 废弃，改为上方的新设计。

```tsx
// 旧版：彩色图标 + 彩色标签 + 更新时间
<Card className="group relative p-4 cursor-pointer h-full">
  {/* 悬浮显示的操作按钮 */}
  <div className="absolute top-3 right-3 flex items-center gap-1
                  opacity-0 group-hover:opacity-100 transition-opacity z-10">
    <button className="p-1.5 rounded-md hover:bg-gray-100">
      <Edit3 size={14} />
    </button>
    <button className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600">
      <Trash2 size={14} />
    </button>
  </div>

  {/* 内容区域 */}
  <div className="flex items-start gap-4">
    {/* 命令图标 - 统一紫色 */}
    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
         style={{ backgroundColor: '#EDE7F6' }}>
      <Terminal size={22} style={{ color: '#5856D6' }} />
    </div>

    {/* 命令信息 */}
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-sm">命令名称</h3>
      {/* 标签 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: '#EDE7F6', color: '#5856D6' }}>
          command
        </span>
      </div>
      {/* 描述 */}
      <p className="text-xs line-clamp-2">描述内容...</p>
    </div>
  </div>
</Card>
```

### 4.3 卡片悬浮效果

```css
/* 悬浮动效 */
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

/* 过渡 */
transition: transform 0.2s, box-shadow 0.2s;
```

---

## 五、创建/编辑弹窗设计

### 5.1 弹窗结构

```
┌─────────────────────────────────────────┐
│  创建新命令                        × 关闭 │  <- 头部区域
├─────────────────────────────────────────┤
│                                         │
│  命令名称 *                             │
│  [________________________]             │
│                                         │
│  命令描述                               │
│  [________________________]             │
│  [________________________]             │
│                                         │
│  命令内容 *                       编辑│预览│
│  [________________________]             │
│  [________________________]             │
│  [________________________]             │
│                                         │
├─────────────────────────────────────────┤
│                         取消      创建   │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

### 5.2 表单字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 命令名称 | Input | 是 | 唯一标识，编辑时不可修改 |
| 命令描述 | Textarea | 否 | 简要描述命令用途 |
| 命令内容 | Textarea | 是 | 支持 Markdown 格式，支持编辑/预览切换 |

### 5.3 编辑/预览切换

```tsx
// 切换按钮组
<div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
  <button className={viewMode === 'edit' ? 'bg-white shadow-sm' : ''}>
    <Edit3 size={14} /> 编辑
  </button>
  <button className={viewMode === 'preview' ? 'bg-white shadow-sm' : ''}>
    <Eye size={14} /> 预览
  </button>
</div>
```

### 5.4 Markdown 渲染

```tsx
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

// 预览模式 - 支持代码块语法高亮
<div className="prose prose-custom prose-sm max-w-none prose-code-custom">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
  >
    {content}
  </ReactMarkdown>
</div>
```

> 注：预览模式需要添加 `rehypeHighlight` 插件以支持代码块语法高亮，与详情弹窗保持一致。

---

## 五点五、MarkdownEditor 编辑器组件

### 5.5.1 组件定位

`MarkdownEditor` 是命令"命令内容"字段的专用编辑器，提供专业的 Markdown 编辑体验。

### 5.5.2 核心功能

| 功能 | 说明 |
|------|------|
| Markdown 语法高亮 | 使用 `materialLight` 主题，实时高亮标题、加粗、斜体、代码块等 |
| @引用功能 | 输入@符号触发引用选择弹窗，支持引用其他业务内容 |
| 引用块高亮 | 自定义装饰器高亮 `` `commands/xxx.md` `` 格式的引用路径 |
| 表单集成 | 支持表单验证、禁用状态等标准表单属性 |

### 5.5.3 使用示例

```tsx
import { MarkdownEditor } from '../ui'

<MarkdownEditor
  placeholder="在此输入命令内容，支持 Markdown 格式..."
  value={content}
  onChange={(e) => setContent(e.target.value)}
  rows={12}
  invalid={invalidFields.has('content')}
  excludePath={mode === 'edit' && initialData ? `.claude/commands/${initialData.name}.md` : undefined}
/>
```

### 5.5.4 技术选型

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@uiw/react-codemirror` | ^4.25.4 | CodeMirror React 封装 |
| `@codemirror/lang-markdown` | ^6.5.0 | Markdown 语言支持 |
| `@uiw/codemirror-themes-all` | ^4.25.5 | 主题包（使用 materialLight） |

### 5.5.5 语法高亮效果

使用 `materialLight` 主题提供的语法高亮：

| 语法元素 | 高亮效果 |
|---------|---------|
| 标题（#）| 蓝色、加粗 |
| 加粗（**text**）| 加粗显示 |
| 斜体（*text*）| 斜体显示 |
| 代码块（```）| 背景色区分 |
| 内联代码（`code`）| 背景色区分 |
| 引用路径（`xxx.md`）| 蓝色背景 + 蓝色文字 |

### 5.5.6 详细设计文档

完整的技术实现细节请参考：`function-design-doc/markdown-high-light-design-doc.md`

---

## 六、详情弹窗设计

### 6.1 弹窗结构

```
┌─────────────────────────────────────────┐
│  [图标] 命令名称         [command]       │  <- 头部固定区域
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）        │
│                                         │
│  命令描述                               │
│  [描述内容...]                          │
│                                         │
│  命令内容                               │
│  [Markdown 渲染内容...]                 │
│                                         │
├─────────────────────────────────────────┤
│  关闭                         [编辑]    │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

### 6.2 样式规范

```css
/* 头部固定区域 */
.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #F3F4F6;
}

/* 内容区域 - 固定高度滚动 */
.detail-content {
  max-height: 400px;
  overflow-y: auto;
  padding-right: 0.5rem;
}
```

---

## 七、页面布局设计

### 7.1 页面容器

```css
/* 页面外层容器 */
.page-wrapper {
  height: 100%;
  padding: 1rem;
}

/* 白色卡片容器 */
.page-card {
  height: 100%;
  background-color: white;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

### 7.2 头部区域

```css
.page-header {
  height: 4rem;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 不使用 border-bottom，保持简洁 */
}
```

### 7.3 内容区域

```css
.page-content {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}
```

---

## 八、表单验证设计

### 8.1 验证规则

| 字段 | 规则 |
|------|------|
| 命令名称 | 必填，创建时检查唯一性 |
| 命令内容 | 必填 |

### 8.2 验证反馈方式

```tsx
// 1. Toast 提示
addToast('请输入命令名称', 'warning')

// 2. 输入框高亮
setInvalidFields(new Set(['name']))

// 3. 输入框恢复
setTimeout(() => setInvalidFields(new Set()), 3000)
```

### 8.3 未保存退出确认

```tsx
// 检测是否有修改
const hasChanges = () => {
  return getSnapshot() !== initialSnapshot.current
}

// 关闭时确认
const handleClose = (skipConfirm = false) => {
  if (!skipConfirm && hasChanges()) {
    setShowConfirm(true)
    return
  }
  onClose()
}
```

---

## 九、交互状态总结

### 9.1 输入框状态流转

```
默认状态 (border-gray-200)
    ↓ hover
悬浮状态 (border-gray-300)
    ↓ focus
聚焦状态 (border-gray-400 + shadow)
    ↓ blur
回到默认状态
```

### 9.2 卡片状态流转

```
默认状态 (无阴影)
    ↓ hover
悬浮状态 (y: -2px + shadow)
    ↓ leave
回到默认状态
```

---

## 十、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| src/types/index.ts | 修改 | 添加 CommandFile 和 CommandFileType 类型 |
| src/stores/commandStore.ts | 新建 | 命令状态管理 |
| src/utils/storage.ts | 修改 | 添加命令文件存储方法 |
| electron/main.ts | 修改 | 添加命令文件 IPC 通道 |
| electron/preload.ts | 修改 | 暴露命令文件 API |
| electron/launch.cjs | 修改 | 开发环境 IPC |
| electron/preload.dev.cjs | 修改 | 开发环境 API |
| src/components/command/CommandCard.tsx | 新建 | 命令卡片组件 |
| src/components/command/CommandModal.tsx | 新建 | 创建/编辑弹窗组件 |
| src/components/command/CommandDetailModal.tsx | 新建 | 详情查看弹窗组件 |
| src/components/command/index.ts | 新建 | 统一导出 |
| src/pages/CommandsPage.tsx | 新建 | 命令页面组件 |
| src/stores/appStore.ts | 修改 | 添加 'commands' 到 PageType |
| src/components/layout/Sidebar.tsx | 修改 | 添加命令导航项 |

---

## 十一、与工具模块的关键差异

### 11.1 Frontmatter 格式差异

```markdown
<!-- 工具文件 frontmatter -->
---
name: doc-agent
description: ...
model: haiku
color: blue
---

<!-- 命令文件 frontmatter（更简单） -->
---
name: git-commit
description: ...
---
```

### 11.2 存储目录差异

```
.workflow-maker/
├── agents/           # 工具文件（sub-agent）
├── commands/         # 命令文件（新增）
└── resources/        # 资源文件
```

### 11.3 功能差异

| 特性 | 工具文件 | 命令文件 |
|------|----------|----------|
| 类型分类 | sub-agent / mcp | 仅 command |
| 模型选择 | haiku / sonnet / opus | 无 |
| 颜色选择 | 用户自定义 | 统一灰色 |
| 图标 | Bot | Terminal |

---

## 十二、设计检查清单

在开发命令模块时，请检查以下项目：

- [ ] 输入框默认边框是否为 `border-gray-200`
- [ ] 输入框悬浮边框是否为 `border-gray-300`
- [ ] 输入框聚焦边框是否为 `border-gray-400`
- [ ] 按钮是否使用灰色主题
- [ ] 按钮是否移除了蓝色聚焦环
- [ ] 弹窗是否移除了分隔线
- [ ] Toast 是否居中显示
- [ ] 卡片悬浮是否有上浮+阴影效果
- [ ] 命令图标是否统一使用紫色

---

## 十三、Markdown 预览功能参考

命令模块的 Markdown 预览功能（行内代码样式、代码块语法高亮等）与智能体模块保持一致，详细设计规范请参考：

- **行内代码样式**：`business-design-doc/agent-design.md` 第十一章
- **代码块语法高亮**：`business-design-doc/agent-design.md` 第十二章
- **功能设计文档**：`function-design-doc/code-block-syntax-highlight-design.md`

---

## 十四、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.2 | 2025-02-25 | 重新设计 CommandCard 卡片布局：采用与 AgentCard 一致的简约灰白色调，移除彩色元素和 command 标签，改为 Terminal 图标 + 内容预览区设计 |
| 1.2 | 2025-02-25 | 使用 MarkdownEditor 组件替代 ReferenceTextarea，实现编辑模式 Markdown 语法高亮 |
| 1.1 | 2025-02-25 | 新增：代码块语法高亮功能支持，参考 agent-design.md |
| 1.0 | 2025-02-17 | 初始版本，基于工具模块设计规范 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*