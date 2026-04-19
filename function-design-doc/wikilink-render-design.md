# WikiLink 渲染设计文档

> 本文档描述了 WikiLink 格式 `[[xxx.md|关系]]` 在 Markdown 编辑器和预览中的实现

---

## 零、WikiLink 快捷输入功能（2026-03-03 新增）

### 0.1 功能概述

在 MarkdownEditor 编辑器中，用户可以通过输入 `%` 符号快速插入 WikiLink 格式的引用。

### 0.2 触发方式

- 按 `Shift + 5` 输入 `%` 符号
- 自动弹出引用选择弹窗（复用 ReferenceSelectModal）
- 选择业务功能后先插入不带关系的 WikiLink
- 随后弹出可选的关系输入框

### 0.3 输出格式

```
不带关系：[[`.claude/agents/智能体名.md`]]
带关系：[[`.claude/agents/智能体名.md`|父子]]
```

### 0.4 编辑器内样式

WikiLink 在编辑器中整块显示为黄色高亮：
- 背景色：`#FEF3C7` (yellow-100)
- 文字色：`#D97706` (yellow-600)
- 整个 `[[...]]` 块都是黄色背景，内部路径不再单独高亮

### 0.5 正则匹配

```typescript
// WikiLink 正则（编辑器高亮用）
const WIKI_LINK_PATTERN = /\[\[`([^`]+)`(\|[^\]]+)?\]\]/g
```

### 0.6 交互支持

| 操作 | 功能 |
|------|------|
| 点击 WikiLink | 重新打开选择弹窗编辑 |
| Backspace | 在 WikiLink 末尾时整体删除 |
| 左箭头 | 光标在 WikiLink 末尾时跳到开头 |
| 右箭头 | 光标在 WikiLink 开头时跳到末尾 |

### 0.7 修改文件

| 文件路径 | 说明 |
|----------|------|
| `src/components/ui/MarkdownEditor/MarkdownEditor.tsx` | 添加 WikiLink 快捷输入逻辑 |
| `src/components/ui/MarkdownEditor/referenceHighlight.ts` | 添加 WikiLink 黄色高亮 |

---

## 一、需求背景

### 1.1 问题描述

在知识的 Markdown 内容中，用户使用 WikiLink 格式建立知识之间的关联，例如：

```markdown
[[`.claude/knowledges/审理平台-仓库说明.md`|依赖]]
```

该格式在知识图谱解析时能正确识别关系，但在 Markdown 预览页面中只显示为纯文本，没有美观的渲染效果。

### 1.2 期望效果

将 WikiLink 格式渲染为：
- 带颜色背景的标签样式
- 根据引用类型显示不同颜色（智能体/节点/工作流/资源等）
- 悬浮时有过渡动画效果

---

## 二、技术方案

### 2.1 整体架构

```
MarkdownRenderer.tsx
    ├── preprocessWikiLinks() - 预处理，将 [[xxx.md|关系]] 转换为 <wiki-link> 标签
    ├── ReactMarkdown + rehype-raw - 解析 HTML 标签
    └── WikiLinkElement - 自定义组件渲染 <wiki-link> 标签

WikiLink.tsx
    ├── extractDisplayName() - 从路径提取显示名称
    ├── getReferenceType() - 根据路径判断引用类型和颜色
    └── WIKI_LINK_REGEX - 正则表达式匹配 WikiLink 格式
```

### 2.2 依赖安装

```bash
pnpm add rehype-raw
```

`rehype-raw` 允许 ReactMarkdown 解析原始 HTML 标签，从而支持自定义的 `<wiki-link>` 标签。

### 2.3 WikiLink 正则表达式

```typescript
const WIKI_LINK_REGEX = /\[\[([^\]|]+\.(?:md|mdx)`?)(?:\|([^\]]+))?\]\]/g
```

支持的格式：
| 格式 | 说明 |
|------|------|
| `[[知识A.md\|引用]]` | 带关系名称 |
| `[[知识A.md]]` | 不带关系名称 |
| `[[./知识A.md\|引用]]` | 带相对路径 |
| `[[.claude/knowledges/知识A.md\|引用]]` | 完整路径 |
| `[[\`xxx.md\`\|引用]]` | 路径包含反引号 |

### 2.4 预处理流程

```typescript
function preprocessWikiLinks(content: string): string {
  return content.replace(WIKI_LINK_REGEX, (match, path, relation) => {
    const cleanPath = path.trim().replace(/^`+|`+$/g, '')
    const relationAttr = relation ? ` relation="${relation.trim()}"` : ''
    return `<wiki-link path="${cleanPath}"${relationAttr}></wiki-link>`
  })
}
```

将 `[[xxx.md|关系]]` 转换为：
```html
<wiki-link path="xxx.md" relation="关系"></wiki-link>
```

### 2.5 自定义标签渲染

```typescript
// ReactMarkdown components 配置
components={{
  code: CodeBlock,
  // @ts-expect-error - 自定义标签支持
  'wiki-link': WikiLinkElement,
}}
```

---

## 三、样式设计

### 3.1 颜色体系

根据引用类型显示不同颜色：

| 引用类型 | 主色 | 背景色 | 说明 |
|----------|------|--------|------|
| 智能体 (agents) | #9333EA | #F3E8FF | 紫色 |
| 节点 (nodes) | #2563EB | #DBEAFE | 蓝色 |
| 工作流 (workflows) | #DC2626 | #FEE2E2 | 红色 |
| 命令 (commands) | #7C3AED | #EDE9FE | 紫色 |
| 资源 (resources) | #059669 | #D1FAE5 | 绿色 |
| 能力 (abilities) | #D97706 | #FEF3C7 | 黄色 |
| 知识 (knowledges) | #2563EB | #DBEAFE | 蓝色 |
| 默认 | #6B7280 | #F3F4F6 | 灰色 |

### 3.2 CSS 样式

```css
/* WikiLink 样式 - 知识引用链接 */
.wiki-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  vertical-align: middle;
  margin: 0 2px;
}

.wiki-link:hover {
  opacity: 0.85;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
```

### 3.3 渲染效果示例

```
原始文本：[[`.claude/knowledges/审理平台-仓库说明.md`|依赖]]

渲染效果：
┌────────────────────┐
│  依赖:审理平台-仓库说明  │  <- 蓝色背景，蓝色文字
└────────────────────┘
```

---

## 四、文件清单

| 文件路径 | 操作 | 说明 |
|----------|------|------|
| `src/components/ui/MarkdownRenderer/WikiLink.tsx` | 新建 | WikiLink 组件和解析工具 |
| `src/components/ui/MarkdownRenderer/MarkdownRenderer.tsx` | 修改 | 添加预处理和自定义标签渲染 |
| `src/components/ui/MarkdownRenderer/index.ts` | 修改 | 导出 WikiLink 相关组件 |
| `src/styles/tailwind.css` | 修改 | 添加 WikiLink CSS 样式 |
| `package.json` | 修改 | 添加 rehype-raw 依赖 |

---

## 五、使用说明

### 5.1 在知识内容中使用

创建或编辑知识时，使用以下格式建立关联：

```markdown
# 我的文档

这是对其他知识的引用：[[`.claude/knowledges/开发规范.md`|参考规范]]

这是对智能体的引用：[[`.claude/agents/代码助手.md`|工具]]
```

### 5.2 渲染效果

在知识详情页面预览时，上述内容会渲染为带颜色标签的链接样式。

---

## 六、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.1 | 2026-03-03 | 新增编辑器 WikiLink 快捷输入功能（按 `%` 触发），支持关系输入，编辑器内黄色高亮 |
| 1.0 | 2026-03-02 | 初始版本，实现 WikiLink 格式美观渲染 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*