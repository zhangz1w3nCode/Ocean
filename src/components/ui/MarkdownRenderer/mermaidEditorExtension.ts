import { StateField, type Extension, type EditorState } from '@codemirror/state'
import { Decoration, WidgetType, EditorView, type DecorationSet } from '@codemirror/view'
import mermaid from 'mermaid'
import { initMermaid, isValidMermaidCode } from './MermaidBlock'

let widgetIdCounter = 0

class MermaidWidget extends WidgetType {
  private cancelled = false

  constructor(readonly code: string) {
    super()
  }

  eq(other: MermaidWidget): boolean {
    return this.code === other.code
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div')
    container.className = 'cm-mermaid-preview mermaid-container mermaid-svg'

    const render = async () => {
      if (this.cancelled) return
      const trimmed = this.code.trim()
      if (!trimmed || !isValidMermaidCode(trimmed)) return

      try {
        initMermaid()
        const id = `mermaid-cm-${Date.now()}-${++widgetIdCounter}`
        const { svg } = await mermaid.render(id, trimmed)
        if (!this.cancelled) {
          container.innerHTML = svg
        }
      } catch {
        // silent fail
      }
    }
    render()

    container.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const pos = view.posAtDOM(container)
      if (pos < 0) return
      view.focus()
      view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
      })
    })

    return container
  }

  destroy() {
    this.cancelled = true
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click'
  }
}

interface MermaidBlockRange {
  from: number
  to: number
  code: string
}

function findMermaidBlocks(text: string): MermaidBlockRange[] {
  const blocks: MermaidBlockRange[] = []
  const regex = /(^```mermaid[ \t]*\n)([\s\S]*?)(^```)/gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      from: match.index,
      to: match.index + match[0].length,
      code: match[2],
    })
  }
  return blocks
}

function buildMermaidDecorations(state: EditorState): DecorationSet {
  const blocks = findMermaidBlocks(state.doc.toString())
  const ranges: ReturnType<Decoration['range']>[] = []
  const sel = state.selection.main

  for (const block of blocks) {
    if (sel.from >= block.from && sel.to <= block.to) continue

    const startLine = state.doc.lineAt(block.from)
    const endLine = state.doc.lineAt(block.to)

    ranges.push(
      Decoration.replace({
        widget: new MermaidWidget(block.code),
        block: true,
      }).range(startLine.from, endLine.to),
    )
  }

  return Decoration.set(ranges, true)
}

export function mermaidBlocks(): Extension {
  return StateField.define<DecorationSet>({
    create(state: EditorState) {
      return buildMermaidDecorations(state)
    },
    update(deco, tr) {
      if (tr.docChanged || tr.selection !== tr.startState.selection) {
        return buildMermaidDecorations(tr.state)
      }
      return deco
    },
    provide: (f) => EditorView.decorations.from(f),
  })
}
