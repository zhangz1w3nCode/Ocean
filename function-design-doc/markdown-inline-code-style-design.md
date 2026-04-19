# Markdown 行内代码块样式优化设计文档

## 概述

本文档记录了 Ocean (Markdown Workflow) 项目中，Agent 详情页面、资源详情页面、命令详情页面的 Markdown 预览功能里，行内代码（\`xx\` 语法）的样式优化实现方案。

---

## 1. 问题描述

### 1.1 优化前的问题

在优化前，Markdown 中的行内代码（使用反引号包裹的 \`xx\` 语法）在预览时：
- 只显示为**加粗的文字**
- 没有背景色区分
- 没有块状视觉效果
- 与普通文字没有明显的视觉区分

### 1.2 优化目标

参考 macOS 系统和主流 Markdown 编辑器（如 Typora、Obsidian、VS Code）的行内代码样式：
- 添加**灰色块背景**，使代码区域清晰可见
- 添加适当的**内边距**，增加代码呼吸空间
- 添加**圆角边框**，视觉更柔和
- 添加**细边框**，增强边界感
- 使用**等宽字体**，代码更易读

---

## 2. 实现方案

### 2.1 核心样式定义

**文件路径**: `flow-editor/src/styles/tailwind.css`

**新增样式代码** (第 60-70 行):

```css
/* Markdown 行内代码样式 - 灰色块背景 */
.prose-code-custom {
  code {
    background-color: #F3F4F6;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 400;
    border: 1px solid #E5E7EB;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.875em;
  }
}
```

### 2.2 Tailwind Typography 插件配置

**文件路径**: `flow-editor/tailwind.config.js`

通过 `@tailwindcss/typography` 插件，自定义行内代码样式：

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: { /* ... */ },
      borderRadius: { /* ... */ },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
```

### 2.3 应用到组件

在以下三个详情弹窗组件中，Markdown 预览容器添加 `prose-code-custom` 类：

**文件列表**:
1. `flow-editor/src/components/agent/AgentDetailModal.tsx`
2. `flow-editor/src/components/resource/ResourceDetailModal.tsx`
3. `flow-editor/src/components/command/CommandDetailModal.tsx`

**修改示例**:

```tsx
<div className="prose prose-custom prose-sm max-w-none prose-headings:text-macos-text prose-p:text-macos-text-secondary prose-li:text-macos-text-secondary prose-code:text-macos-text prose-pre:bg-gray-100 prose-pre:p-3 prose-pre:rounded-lg prose-code-custom">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {agent.content}
  </ReactMarkdown>
</div>
```

---

## 3. 样式参数详解

### 3.1 行内代码样式参数

| 属性 | 值 | 说明 |
|------|-----|------|
| `background-color` | `#F3F4F6` | 浅灰色背景，与 macOS 系统风格一致 |
| `padding` | `2px 6px` | 上下 2px，左右 6px，提供适当呼吸空间 |
| `border-radius` | `4px` | 小圆角，视觉柔和 |
| `border` | `1px solid #E5E7EB` | 细边框，增强边界感 |
| `font-weight` | `400` | 正常字重，不加粗 |
| `font-family` | `ui-monospace, ...` | 等宽字体，代码易读 |
| `font-size` | `0.875em` | 略小于正文字号 |

### 3.2 颜色对照

| 用途 | 颜色值 | Tailwind 类 |
|------|--------|-------------|
| 背景色 | `#F3F4F6` | `bg-gray-100` |
| 边框色 | `#E5E7EB` | `border-gray-200` |
| 文字颜色 | 继承 | `text-macos-text` |

---

## 4. 效果对比

### 4.1 优化前

```
请查看 `agents/工具名.md` 文件

显示效果：请查看 工具名.md（仅加粗）
```

### 4.2 优化后

```
请查看 `agents/工具名.md` 文件

显示效果：请查看 [灰色块包裹的] agents/工具名.md [结束] 文件
```

---

## 5. 兼容性说明

### 5.1 浏览器兼容性

- Chrome/Edge: ✓ 完全支持
- Safari: ✓ 完全支持
- Firefox: ✓ 完全支持

### 5.2 Electron 兼容性

- Electron 28+: ✓ 完全支持

---

## 6. 相关依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `react-markdown` | 10.1.0 | Markdown 解析与渲染 |
| `remark-gfm` | 最新版 | GitHub 风格 Markdown 支持 |
| `@tailwindcss/typography` | 最新版 | Typography 样式插件 |
| `tailwindcss` | 3.4.19 | CSS 框架 |

---

## 7. 设计原则

1. **系统一致性**: 使用与 macOS 系统一致的灰色系配色
2. **视觉层次**: 通过背景色和边框创建清晰的视觉层次
3. **可读性优先**: 等宽字体确保代码可读性
4. **适度呼吸**: 适当的内边距让代码不拥挤
5. **圆角设计**: 统一的圆角设计语言

---

## 8. 文件索引

| 文件路径 | 说明 |
|----------|------|
| `flow-editor/src/styles/tailwind.css` | 行内代码样式定义 |
| `flow-editor/tailwind.config.js` | Tailwind 配置 |
| `flow-editor/src/components/agent/AgentDetailModal.tsx` | Agent 详情弹窗 |
| `flow-editor/src/components/resource/ResourceDetailModal.tsx` | 资源详情弹窗 |
| `flow-editor/src/components/command/CommandDetailModal.tsx` | 命令详情弹窗 |

---

## 9. 关键技术点

### 9.1 区分行内代码和代码块

使用 CSS 选择器 `:not(pre > code)` 排除代码块中的 `code` 元素：

```css
/* 只针对行内代码（排除代码块中的 code） */
.prose :where(code):not(pre > code) {
  background-color: #F3F4F6;
  padding: 2px 6px;
  border-radius: 4px;
  /* ... */
}
```

### 9.2 移除反引号伪元素

同样使用 `:not(pre > code)` 排除代码块：

```css
.prose :where(code):not(pre > code)::before,
.prose :where(code):not(pre > code)::after {
  content: '' !important;
  display: none !important;
}
```

### 9.3 Tailwind Typography 插件配置

在 `tailwind.config.js` 中使用相同的选择器：

```javascript
typography: {
  DEFAULT: {
    css: {
      'code:not(pre > code)::before': {
        content: 'none',
      },
      'code:not(pre > code)::after': {
        content: 'none',
      },
    },
  },
},
```

---

## 10. 更新日志

| 日期 | 操作 | 说明 |
|------|------|------|
| 2025-02-25 | 创建 | 初始样式优化实现 |
| 2025-02-25 | 完成 | 应用到所有详情弹窗组件 |
| 2025-02-25 | 修复 | 区分行内代码和代码块，避免代码块被渲染为灰色块 |

---

## 10. 未来优化建议

1. **主题适配**: 支持深色模式下的行内代码样式
2. **语法高亮**: 考虑为特定格式的代码（如 JSON、CSS）添加简单高亮
3. **复制功能**: 点击行内代码可快速复制内容
4. **自适应字号**: 根据容器大小自动调整字号
