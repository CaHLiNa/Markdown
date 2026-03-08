import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { NodeSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

type ImagePopoverState = {
  pos: number
  src: string
  alt: string
  title: string
}

type CreateImagePopoverProviderOptions = {
  root: HTMLElement
  onApply: (state: ImagePopoverState) => void
  onReplace: (state: ImagePopoverState) => void
}

export class ImagePopoverProvider {
  readonly element: HTMLElement

  #root: HTMLElement
  #state: ImagePopoverState | null = null
  #onApply: (state: ImagePopoverState) => void
  #onReplace: (state: ImagePopoverState) => void

  constructor({ root, onApply, onReplace }: CreateImagePopoverProviderOptions) {
    this.#root = root
    this.#onApply = onApply
    this.#onReplace = onReplace
    this.element = document.createElement('div')
    this.element.className = 'cm-floating-ui cm-image-popover'
    this.element.hidden = true
    this.#root.append(this.element)
  }

  attach(view: EditorView) {
    this.update(view)
  }

  destroy() {
    this.element.remove()
    this.#state = null
  }

  hide() {
    this.#state = null
    this.element.hidden = true
    this.element.innerHTML = ''
  }

  handleKey(key: string) {
    if (key !== 'Escape' || this.element.hidden) {
      return false
    }

    this.hide()
    return true
  }

  update(view: EditorView) {
    const state = this.#readState(view)

    if (!state) {
      this.hide()
      return
    }

    const nextSignature = JSON.stringify(state)
    const previousSignature = this.#state ? JSON.stringify(this.#state) : null
    this.#state = state

    if (nextSignature !== previousSignature) {
      this.#render(state)
    }

    void this.#position(view, state.pos)
  }

  #readState(view: EditorView): ImagePopoverState | null {
    const { selection } = view.state

    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
      return null
    }

    return {
      pos: selection.from,
      src: String(selection.node.attrs.src ?? ''),
      alt: String(selection.node.attrs.alt ?? ''),
      title: String(selection.node.attrs.title ?? '')
    }
  }

  #render(state: ImagePopoverState) {
    this.element.innerHTML = `
      <div class="cm-command-panel-header">
        <span>编辑图片属性</span>
      </div>
      <label class="cm-popover-field">
        <span class="cm-popover-field-label">Alt</span>
        <input class="cm-popover-input" name="alt" type="text" value="${escapeAttribute(state.alt)}" />
      </label>
      <label class="cm-popover-field">
        <span class="cm-popover-field-label">路径</span>
        <input class="cm-popover-input" name="src" type="text" value="${escapeAttribute(state.src)}" />
      </label>
      <label class="cm-popover-field">
        <span class="cm-popover-field-label">标题</span>
        <input class="cm-popover-input" name="title" type="text" value="${escapeAttribute(state.title)}" />
      </label>
      <div class="cm-popover-actions">
        <button type="button" class="cm-surface-command-button cm-surface-command-button--list" data-image-action="apply">保存属性</button>
        <button type="button" class="cm-surface-command-button cm-surface-command-button--list" data-image-action="replace">替换图片</button>
      </div>
    `

    this.element
      .querySelector<HTMLButtonElement>("[data-image-action='apply']")
      ?.addEventListener('click', () => {
        const payload = this.#collectState()

        if (!payload) {
          return
        }

        this.#onApply(payload)
      })

    this.element
      .querySelector<HTMLButtonElement>("[data-image-action='replace']")
      ?.addEventListener('click', () => {
        const payload = this.#collectState()

        if (!payload) {
          return
        }

        this.#onReplace(payload)
      })

    this.element.hidden = false
  }

  #collectState(): ImagePopoverState | null {
    if (!this.#state) {
      return null
    }

    const alt = this.element.querySelector<HTMLInputElement>("input[name='alt']")?.value ?? ''
    const src = this.element.querySelector<HTMLInputElement>("input[name='src']")?.value ?? ''
    const title = this.element.querySelector<HTMLInputElement>("input[name='title']")?.value ?? ''

    return {
      pos: this.#state.pos,
      alt,
      src,
      title
    }
  }

  async #position(view: EditorView, pos: number) {
    const dom = view.nodeDOM(pos)

    if (!(dom instanceof HTMLElement)) {
      this.hide()
      return
    }

    const { x, y } = await computePosition(dom, this.element, {
      placement: 'bottom-start',
      middleware: [offset(12), flip(), shift({ padding: 8 })]
    })

    Object.assign(this.element.style, {
      left: `${x}px`,
      top: `${y}px`
    })
  }
}

const escapeAttribute = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
