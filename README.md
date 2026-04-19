<div align="center">

# Ocean

**Claude Code Asset & Capability Visualization Management Platform**

A desktop application built with `Electron` + `React` + `TypeScript` that uses Markdown files as the core data carrier. All data is stored locally, providing unified management and visual orchestration for Claude Code assets including agents, commands, abilities, skills, knowledge bases, workflows, and more.

[English](./README.md) | [中文](./README_CN.md)

</div>

---

## Why Ocean

Claude Code is a powerful AI coding agent, but managing its assets (agents, commands, abilities, skills, knowledge, workflows) is fragmented across directories and text files. Ocean provides a unified visual management platform purpose-built for Claude Code, turning these scattered Markdown files into a coherent, manageable system.

- **Reference, not copy** -- Assets are linked through `@` references and `%` WikiLinks instead of being duplicated. A single source of truth means editing an ability or knowledge entry automatically reflects everywhere it is referenced.
- **Knowledge as a graph** -- Knowledge entries are stored as individual Markdown files and connected via WikiLinks with labeled relationships. The entire knowledge network is rendered as an interactive force-directed graph where you can click any node to view details, and tune physics parameters like centripetal force and node distance.
- **Zero data lock-in** -- All data is stored as standard Markdown files in the `.claude/` directory. You can edit them with any text editor or use Ocean's visual interface.
- **Fully local** -- No cloud services, no accounts, no data uploads. Your assets stay on your machine.
- **Visual orchestration** -- Compose complex workflows by dragging and connecting nodes on a canvas. Each node is interactive -- click to configure, drag to reposition, branch to create decision paths. The visual approach makes multi-step workflows tangible and intuitive to build.

## Features

### Asset Management

Ocean manages 8 types of Claude Code assets, each with full CRUD operations, Markdown preview, and reference linking:

| Module | Storage Location | Description |
|--------|-----------------|-------------|
| Agents | `.claude/agents/` | Define AI agent profiles with model selection, role instructions, and icon customization |
| Commands | `.claude/commands/` | Create reusable slash commands with Frontmatter metadata |
| Abilities | `.claude/abilities/` | Define atomic capability units that can be referenced by other assets |
| Skills | `.claude/skills/` | Package complex skills with scripts, references, and examples in a directory structure |
| Knowledge | `.claude/knowledges/` | Manage business knowledge with tags, categories, WikiLink references, and a visual knowledge graph |
| Nodes | `.claude/nodes/` | Define reusable workflow building blocks |
| Resources | `.claude/resources/` | Manage reference resource files |
| Workflows | `.claude/workflows/` | Design and manage workflow definitions |

### Visual Workflow Editor

Build complex multi-step workflows through direct visual manipulation instead of editing configuration files by hand.

- Drag-and-drop flow editor built on React Flow
- 6 node types: Start, End, Process, Decision, Business, Local
- Click any node to open its property panel for inline editing
- Drag to reposition nodes, draw edges to define execution paths
- Branch management for decision nodes with dynamic output handles
- Auto-layout powered by Dagre algorithm
- Grid snapping, multi-select, copy/paste, context menu
- Generates structured WORKFLOW.md output with Mermaid flowcharts and step-by-step execution paths

### Knowledge Graph

Each knowledge entry is a standalone Markdown file. Entries are connected via WikiLinks (`[[file.md|relation]]`) with labeled relationships, and the entire network is visualized as an interactive force-directed graph.

- Force-directed graph visualization powered by D3-force
- WikiLink syntax with relationship labels (e.g., `[[architecture.md|depends-on]]`)
- Click any node to open its detail view directly from the graph
- Dynamic node sizing based on reference count -- highly referenced entries stand out visually
- Interactive hover highlighting with smooth fade animations
- Configurable physics: centripetal force, node link distance, velocity decay, and more
- Relationship labels rendered on edges with toggle visibility
- Node coloring based on in-degree / out-degree to distinguish knowledge hubs from leaf entries

### AI-Powered Creation

Multiple creation modes powered by LLM integration:

- **Manual creation** -- Write content directly
- **LLM creation** -- Generate content using AI with customizable prompt templates
- **Agentic creation** -- AI autonomously creates content using tools and file system access
- **Claude Code CLI** -- Invoke Claude Code directly for content generation

Additional AI features:
- Content optimization with git diff-style comparison
- 20+ LLM provider support via pi-mono SDK
- Configurable model parameters (temperature, max_tokens, etc.)

### Cross-Asset Reference System

Ocean uses a reference-based architecture instead of copying content between assets:

- **`@` reference** -- Type `@` in the Markdown editor to insert a reference to any asset (agents, commands, abilities, skills, knowledge entries, resources, nodes). The referenced content is stored as a file path, not a copy. When the source asset is updated, all references stay in sync.
- **`%` WikiLink** -- Type `%` to insert a WikiLink (`[[file.md|relation]]`) that creates bidirectional links between knowledge entries. These relationships are visualized in the knowledge graph.

This means each piece of content exists in exactly one place. Editing the source automatically reflects across all references -- no version drift, no stale copies. Every improvement to a shared asset compounds across the entire system: the more you reference, the greater the return.

### Markdown Editor & Rendering

- CodeMirror 6-based Markdown editor with syntax highlighting
- GitHub Flavored Markdown rendering (tables, strikethrough, task lists)
- Mermaid diagram rendering
- Code block syntax highlighting (highlight.js)
- Rehype-raw for embedded HTML support

## Tech Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Framework | React | 19.2 |
| Language | TypeScript | 5.9 |
| Build Tool | Vite | 5.4 |
| Desktop | Electron | 40.4 |
| Styling | Tailwind CSS | 3.4 |
| Animation | Framer Motion | 12.34 |
| Icons | Lucide React | 0.563 |
| State Management | Zustand | 5.0 |
| Flow Editor | @xyflow/react (React Flow) | 12.10 |
| Auto Layout | Dagre | 2.0 |
| Force Graph | D3-force + react-force-graph-2d | 3.0 / 1.29 |
| Code Editor | CodeMirror 6 (@uiw/react-codemirror) | 4.25 |
| Markdown Rendering | react-markdown + remark-gfm + rehype-highlight | 10.1 |
| Diagrams | Mermaid | 11.12 |
| Drag & Drop | @dnd-kit | 6.3 |
| AI/LLM | pi-mono SDK (pi-agent-core, pi-ai, pi-coding-agent) | 0.57 |
| Package Manager | pnpm | 10.19 |

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8 (recommended: 10.19+)

### Installation

```bash
# Clone the repository
git clone https://github.com/zhangz1w3nCode/ocean.git
cd ocean

# Install dependencies
pnpm install
```

### Development

```bash
# Start the Vite dev server (web mode)
pnpm dev

# Start Electron dev mode (desktop app)
pnpm electron:dev
```

The web dev server starts at `http://localhost:5173`. Electron dev mode launches the desktop app with hot-reload.

### Build

```bash
# Build web assets
pnpm build

# Build and package Electron app
pnpm electron:build
```

Build outputs:
- **Web**: `dist/`
- **macOS**: `release/` (DMG for Apple Silicon arm64)
- **Windows**: `release/` (NSIS installer for x64)

## Project Structure

```
ocean/
├── electron/                    # Electron main process
│   ├── launch.cjs               # Main process entry (IPC handlers, file system ops)
│   └── preload.dev.cjs          # Preload script (exposes electronAPI)
├── src/
│   ├── main.tsx                 # Application entry point
│   ├── App.tsx                  # Root component (routing, layout)
│   ├── pages/                   # Page components
│   │   ├── ProjectSelectionPage.tsx
│   │   ├── AgentsPage.tsx
│   │   ├── CommandsPage.tsx
│   │   ├── AbilitiesPage.tsx
│   │   ├── SkillsPage.tsx
│   │   ├── KnowledgesPage.tsx
│   │   ├── NodesPage.tsx
│   │   ├── ResourcesPage.tsx
│   │   ├── WorkflowsPage.tsx
│   │   ├── FlowEditorPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── LLMSettings.tsx
│   ├── components/              # UI components
│   │   ├── ability/             # Ability module components
│   │   ├── agent/               # Agent module components
│   │   ├── command/             # Command module components
│   │   ├── flow/                # Flow editor components & node types
│   │   ├── knowledge/           # Knowledge module & graph components
│   │   ├── layout/              # Layout components (Sidebar, MainContent)
│   │   ├── node/                # Node module components
│   │   ├── resource/            # Resource module components
│   │   ├── settings/            # Settings page components
│   │   ├── skill/               # Skill module components
│   │   ├── ui/                  # Shared UI components
│   │   │   ├── MarkdownEditor/  # CodeMirror-based Markdown editor
│   │   │   └── MarkdownRenderer/ # Markdown rendering (Mermaid, WikiLink)
│   │   └── workflow/            # Workflow module components
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAgentLoop.ts      # Agent loop execution hook
│   │   └── useAgenticExecutor.tsx # Agentic mode executor hook
│   ├── services/                # Business logic services
│   │   ├── llmService.ts        # LLM API integration
│   │   ├── agentLoopService.ts  # Agent loop execution service
│   │   └── agenticService.ts    # Agentic creation service
│   ├── stores/                  # Zustand state stores (13 stores)
│   ├── types/                   # TypeScript type definitions
│   └── utils/                   # Utility functions
│       ├── storage.ts           # Storage helpers
│       ├── workflow-generator.ts # Workflow document generator
│       └── knowledgeGraphParser.ts # Knowledge graph data parser
├── build/                       # Build assets (app icons)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── LICENSE                      # MIT License
```

## Data Storage

All data is stored as Markdown files within the project's `.claude/` directory:

```
your-project/
└── .claude/
    ├── agents/                  # Agent definitions (*.md)
    ├── commands/                # Command definitions (*.md)
    ├── abilities/               # Ability definitions (*.md)
    ├── skills/                  # Skill packages (directory per skill)
    │   └── skill-name/
    │       ├── SKILL.md
    │       ├── scripts/
    │       ├── references/
    │       └── examples/
    ├── knowledges/              # Knowledge entries (*.md)
    ├── nodes/                   # Node definitions (*.md)
    ├── resources/               # Resource files (*.md)
    └── workflows/               # Workflow definitions
        └── workflow-name/
            ├── flow.json        # Graph structure
            └── WORKFLOW.md      # Generated workflow document
```

Each asset is a standard Markdown file with optional YAML Frontmatter metadata. This means you can version-control your assets with Git and edit them with any text editor.

## License

[MIT](./LICENSE)
