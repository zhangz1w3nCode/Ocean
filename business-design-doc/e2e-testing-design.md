# Ocean Agent E2E 测试设计文档

> **版本**: 1.1
> **日期**: 2026-04-13
> **状态**: 已验证

---

## 1. 概述

本文档描述 Ocean 桌面应用基于 agent-browser + Chrome DevTools Protocol (CDP) 的端到端自动化测试方案。通过 Electron 的 `--remote-debugging-port` 参数暴露 CDP 接口，agent-browser 可以直接操控 Electron 主窗口，实现完整的桌面应用自动化测试。

## 2. 技术方案

### 2.1 核心原理

Electron 内嵌 Chromium 渲染引擎，支持 `--remote-debugging-port` 参数开启 CDP 调试协议。agent-browser 基于 Playwright/CDP，可以通过 WebSocket 连接到 Electron 的 BrowserWindow，实现与手动操作桌面应用一致的自动化操控。

### 2.2 两种连接方式对比

| 方式 | 命令 | preload 注入 | electronAPI | 使用场景 |
|------|------|:---:|:---:|----------|
| `open` | `agent-browser --cdp 9222 open URL` | 否 | undefined | 仅测试前端 UI |
| `connect` | `agent-browser --cdp 9222 connect WS_URL` | 是 | 完整可用 | 完整桌面应用测试 |

**关键结论**: 必须使用 `connect` 方式连接 Electron 主窗口，才能保留 preload 脚本注入，使 `window.electronAPI` 完整可用。

### 2.3 连接流程

```
1. pnpm electron:dev (--remote-debugging-port=9222)
        |
2. curl localhost:9222/json/version  (确认 CDP 就绪)
        |
3. curl localhost:9222/json/list     (获取主窗口目标)
        |
4. agent-browser --cdp 9222 connect "ws://localhost:9222/devtools/page/<id>"
        |
5. agent-browser --cdp 9222 eval 'typeof window.electronAPI'  (验证 IPC 可用)
        |
6. snapshot / screenshot / click    (自动化操作)
```

## 3. 配置变更

### 3.1 package.json 修改

在 `electron:dev` 脚本中添加 `--remote-debugging-port=9222`：

```json
{
  "scripts": {
    "electron:dev": "concurrently \"pnpm dev\" \"wait-on http://localhost:5173 && cross-env VITE_DEV_SERVER_URL=http://localhost:5173 electron electron/launch.cjs --remote-debugging-port=9222\""
  }
}
```

> 该参数由 Chromium 层处理，不需要修改任何 Electron 代码。端口可自定义，默认使用 9222。

### 3.2 不需要的改动

以下内容**不需要修改**：
- Electron 主进程代码 (`launch.cjs`)
- Preload 脚本 (`preload.dev.cjs`)
- Vite 配置
- 前端代码

## 4. 测试能力矩阵

### 4.1 支持的测试操作

| 操作类型 | 命令示例 | 说明 |
|----------|----------|------|
| 页面快照 | `snapshot -i` | 获取交互元素及 ref 标识 |
| 截图 | `screenshot --annotate` | 带编号标注的截图 |
| 点击 | `click @e1` | 点击指定元素 |
| 填写 | `fill @e2 "text"` | 清空并输入文本 |
| 滚动 | `scroll down 500` | 页面滚动 |
| 等待 | `wait 1500` | 等待渲染 |
| JS 执行 | `eval 'expression'` | 在页面上下文执行 JS |
| 页面信息 | `get url/title` | 获取页面元信息 |
| 批量执行 | `batch "cmd1" "cmd2"` | 顺序执行多条命令 |

### 4.2 业务模块切换测试

Ocean 包含 9 个业务模块，均可通过侧边栏按钮切换：

| 模块 | 侧边栏文字 | 页面内容 |
|------|-----------|----------|
| 知识 | "知识" | 知识库文件列表 |
| 能力 | "能力" | AI 能力单元列表 |
| 技能 | "技能" | 技能目录列表 |
| 工作流 | "工作流" | 工作流列表 |
| 设置 | "设置" | 应用配置页面 |
| 资源文件 | "资源文件" | 规则/参考/工具文件列表 |
| 智能体 | "智能体" | AI 智能体列表 |
| 节点 | "节点" | 工作流节点模板列表 |
| 命令 | "命令" | 斜杠指令列表 |

### 4.3 IPC 接口验证

通过 `eval 'typeof window.electronAPI'` 和 `eval 'Object.keys(window.electronAPI)'` 验证 IPC 通道完整性。当前版本确认可用 70+ 个接口方法，覆盖文件操作、项目管理、知识图谱、LLM、Agentic 等功能。

## 5. 知识库模块 E2E 测试用例

> **版本**: 1.1 | **日期**: 2026-04-13 | **测试范围**: 子目录文档识别优化 + 全局索引动态生成

### 5.1 测试用例总览

| 序号 | 测试项 | 验证内容 | 状态 |
|------|--------|----------|------|
| 1 | 知识库页面分类分组展示 | 子目录下 .md 文件正确识别并按分类展示 | PASS |
| 2 | 全局索引弹窗功能 | 树形目录渲染、刷新/保存按钮、toast 提示 | PASS |
| 3 | 新建知识 - 文件夹树形选择器 | CategorySelectModal 多级目录展开、选择、新建子分类 | PASS |
| 4 | 知识详情/编辑/删除 | 子目录文件详情弹窗、编辑弹窗名称锁定、分类显示 | PASS |
| 5 | 知识库搜索功能 | 搜索匹配文件名和文档内容，子目录文件可被搜索到 | PASS |

### 5.2 测试用例详情

#### TC-KN-01: 知识库页面分类分组展示

**前置条件**: 已连接 Electron 主窗口，当前页面为知识库模块

**测试步骤**:
1. 点击侧边栏"知识"按钮切换到知识库页面
2. `snapshot -i` 获取页面交互元素
3. 通过 `eval` 提取所有知识卡片标题

**验证要点**:
- 子目录文件夹下的 .md 文件须正确显示（如 studio-data-*, zhub-*, zmng-*, zportal-*, 审理平台-* 等）
- 根目录文件正常显示（category 为空）
- 卡片按分类前缀自然分组

**关键 agent-browser 命令**:
```bash
agent-browser --cdp 9222 eval --stdin <<'EOF'
JSON.stringify(Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim()), null, 2)
EOF
```

---

#### TC-KN-02: 全局索引弹窗功能

**前置条件**: 知识库页面已加载

**测试步骤**:
1. 点击"全局索引"按钮
2. 验证弹窗打开，检查标题、标签、副标题
3. 验证树形目录内容（box-drawing 字符渲染、文件带 .md 后缀、文件夹不带）
4. 点击"刷新"按钮，验证 toast 提示"刷新成功"
5. 点击"保存"按钮，验证 toast 提示"保存成功"
6. 关闭弹窗

**验证要点**:
- 本地无 INDEX.md 时，副标题显示"自动生成 - 知识库目录结构"
- 本地有 INDEX.md 时，副标题显示"索引内容"
- 树形目录中子目录（如审理平台）展示嵌套结构（├──/└──/│）
- 文件项带 .md 后缀，文件夹不带
- 刷新按钮重新生成内容不写入文件
- 保存按钮将内容写入 INDEX.md

**关键 agent-browser 命令**:
```bash
# 提取树形目录内容
agent-browser --cdp 9222 eval --stdin <<'EOF'
document.querySelector('pre').textContent
EOF

# 验证 toast 提示
agent-browser --cdp 9222 eval --stdin <<'EOF'
(() => {
  const html = document.body.innerHTML;
  return JSON.stringify({ hasRefreshSuccess: html.includes('刷新成功'), hasSaveSuccess: html.includes('保存成功') });
})()
EOF
```

---

#### TC-KN-03: 新建知识 - 文件夹树形选择器

**前置条件**: 知识库页面已加载

**测试步骤**:
1. 点击"新建知识"按钮
2. 在模式选择弹窗中点击"手动创建"
3. 验证创建弹窗字段：知识名称、描述、分类、标签、内容
4. 点击"点击选择分类"按钮打开 CategorySelectModal
5. 验证树形结构默认折叠，只显示根目录
6. 展开根目录，验证子分类（如审理平台）显示
7. 展开审理平台，验证更深层级（专业术语、业务流程、测试-2）
8. 展开业务流程，验证第四级（告警、测试、溯源）
9. 选择"业务流程"分类，验证分类字段更新为"审理平台/业务流程"

**验证要点**:
- 分类字段为按钮触发树形选择器（非文本输入框）
- 根目录默认折叠，需点击展开按钮展开
- 每个节点有"新建子分类"按钮
- 选中分类后，路径用 "/" 分隔显示（如"审理平台/业务流程"）
- 留空表示根目录

**关键 agent-browser 命令**:
```bash
# 查看分类选择器树形结构
agent-browser --cdp 9222 snapshot -i | grep "选择分类\|根目录\|审理平台\|新建子分类"
```

---

#### TC-KN-04: 知识详情/编辑/删除

**前置条件**: 知识库页面已加载

**测试步骤**:
1. 点击某个知识卡片（如"Zmng系统"）
2. 验证详情弹窗打开，蓝色主题渲染
3. 验证标题、knowledge 标签、更新时间、描述、标签、内容
4. 验证 Markdown 内容正确渲染，WikiLink 引用正确解析
5. 点击"编辑"按钮
6. 验证编辑弹窗：名称锁定、描述/分类/标签/内容可编辑
7. 点击"取消"返回详情

**验证要点**:
- 详情弹窗蓝色主题（#3B82F6），BookOpen 图标
- knowledge 标签显示
- 子目录文件的分类路径正确（如"审理平台/业务流程"）
- 编辑模式下名称不可修改（disabled）
- 保存/取消按钮可用

**关键 agent-browser 命令**:
```bash
# 检查详情弹窗内容
agent-browser --cdp 9222 eval --stdin <<'EOF'
(() => {
  const overlays = document.querySelectorAll('[class*="fixed"]');
  const info = [];
  overlays.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 100 && rect.height > 100 && el.textContent.length > 10) {
      info.push(el.textContent.substring(0, 300));
    }
  });
  return JSON.stringify(info.slice(0, 2));
})()
EOF
```

---

#### TC-KN-05: 知识库搜索功能

**前置条件**: 知识库页面已加载

**测试步骤**:
1. 在搜索框输入关键词（如"审理平台"）
2. 等待搜索结果过滤
3. 提取过滤后的卡片标题列表
4. 验证结果包含名称中含"审理平台"的文件
5. 验证结果也包含内容中含"审理平台"的关联文件

**验证要点**:
- 搜索同时匹配文件名和文档内容
- 子目录下的文件可被搜索到
- 过滤后的结果保留匹配项

**关键 agent-browser 命令**:
```bash
agent-browser --cdp 9222 fill @e7 "审理平台"
agent-browser --cdp 9222 wait 1500
agent-browser --cdp 9222 eval --stdin <<'EOF'
Array.from(document.querySelectorAll('h3')).map(c => c.textContent.trim()).join('\n')
EOF
```

### 5.3 已知测试发现

| 发现项 | 说明 | 是否 Bug |
|--------|------|----------|
| 根目录文件扁平展示 | 全局索引中根目录下的文件(studio-data.md等)与子目录文件并列展示，仅"审理平台"目录有嵌套结构 | 否，数据结构决定 |
| 搜索匹配文档内容 | 搜索"审理平台"时，名称不含该词但内容含该词的卡片仍显示 | 否，支持内容搜索 |
| 详情弹窗 snapshot 遗漏 | 点击卡片后详情弹窗打开，但 snapshot -i 未捕获弹窗元素 | 是，需用 eval 或 screenshot 补充验证 |
| 多级弹窗关闭困难 | 嵌套弹窗(CategorySelectModal > KnowledgeModal)需多次 Escape | 否，符合设计 |

## 7. 已知限制

| 限制项 | 说明 | 影响范围 |
|--------|------|----------|
| ref 编号不稳定 | `@eN` 编号随页面变化，每次需重新 snapshot | 需在每次页面变化后获取新 ref |
| 目标 ID 变化 | `webSocketDebuggerUrl` 每次启动 Electron 会变化 | 每次需重新执行 `/json/list` |
| CDP 端口冲突 | 如果端口 9222 被占用，Electron 会启动失败 | 需确保端口可用 |
| 多窗口场景 | 目前仅验证单窗口连接 | 多 BrowserWindow 场景待验证 |

## 8. 文件清单

| 文件 | 路径 | 说明 |
|------|------|------|
| E2E 测试文档 | `test/ocean-agent-e2e.md` | 完整操作手册 |
| 本设计文档 | `business-design-doc/e2e-testing-design.md` | 技术方案设计 |
| package.json | `ocean/package.json` | CDP 端口配置 |

## 9. 变更历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.1 | 2026-04-13 | 新增知识库模块 E2E 测试用例（5项），含子目录识别、全局索引、分类选择器、详情编辑、搜索功能 |
| 1.0 | 2026-04-13 | 初始文档，基于 agent-browser + CDP 的 E2E 测试方案 |