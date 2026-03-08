import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import type { EditorView } from '@milkdown/prose/view'

import { blockMenuSections, editorCommandRegistry, type EditorCommand } from '../commands'
import { supportsMilkdownCommand } from './commands-adapter'

type CreateBlockHandleProviderOptions = {
  root: HTMLElement
  onInsert: () => void
  onRunCommand: (command: EditorCommand) => boolean
}

const blockSelector = 'p, h1, h2, h3, h4, h5, h6, blockquote, pre, table, li'

const isVisibleBlockCommand = (command: EditorCommand) => {
  return command === 'toggle-global-source-mode' || supportsMilkdownCommand(command)
}

const resolveBlockElement = (
  view: EditorView,
  position: number,
  eventTarget?: EventTarget | null
) => {
  if (eventTarget instanceof Element) {
    const hovered = eventTarget.closest(blockSelector)

    if (hovered && view.dom.contains(hovered)) {
      return hovered as HTMLElement
    }
  }

  const domAtPos = view.domAtPos(position)
  let element =
    domAtPos.node instanceof Element ? domAtPos.node : domAtPos.node.parentElement

  while (element && element !== view.dom) {
    if (element.matches(blockSelector)) {
      return element as HTMLElement
    }

    element = element.parentElement
  }

  return view.dom.querySelector<HTMLElement>(blockSelector)
}

export class BlockHandleProvider {
  readonly gutter: HTMLElement
  readonly menu: HTMLElement

  #root: HTMLElement
  #view: EditorView | null = null
  #onInsert: () => void
  #onRunCommand: (command: EditorCommand) => boolean

  constructor({ root, onInsert, onRunCommand }: CreateBlockHandleProviderOptions) {
    this.#root = root
    this.#onInsert = onInsert
    this.#onRunCommand = onRunCommand

    this.gutter = document.createElement('div')
    this.gutter.className = 'cm-block-gutter'
    this.gutter.hidden = true
    this.gutter.innerHTML = `
      <button
        type="button"
        class="cm-block-gutter-button"
        data-block-action="insert"
        aria-label="插入块"
        title="插入块"
      >+</button>
      <button
        type="button"
        class="cm-block-gutter-button"
        data-block-action="menu"
        aria-label="块操作"
        title="块操作"
      >...</button>
    `

    this.menu = document.createElement('div')
    this.menu.className = 'cm-floating-ui cm-block-menu'
    this.menu.hidden = true

    this.gutter
      .querySelector<HTMLButtonElement>('[data-block-action="insert"]')
      ?.addEventListener('click', () => {
        this.#onInsert()
        this.closeMenu()
      })

    this.gutter
      .querySelector<HTMLButtonElement>('[data-block-action="menu"]')
      ?.addEventListener('click', () => {
        this.toggleMenu()
      })

    this.#root.append(this.gutter, this.menu)
    document.addEventListener('mousedown', this.#handleDocumentPointerDown)
  }

  attach(view: EditorView) {
    if (this.#view === view) {
      return
    }

    this.#detachView()
    this.#view = view
    view.dom.addEventListener('mousemove', this.#handleMouseMove)
    view.dom.addEventListener('keydown', this.#handleKeydown)
    this.update(view)
  }

  destroy() {
    this.#detachView()
    document.removeEventListener('mousedown', this.#handleDocumentPointerDown)
    this.gutter.remove()
    this.menu.remove()
  }

  update(view: EditorView) {
    this.#view = view
    const selection = view.state.selection
    const block = resolveBlockElement(view, selection.from)

    if (!block) {
      this.gutter.hidden = true
      this.closeMenu()
      return
    }

    this.gutter.hidden = false
    void this.#positionGutter(block)

    if (!this.menu.hidden) {
      void this.#positionMenu()
    }
  }

  handleKey(key: string) {
    if (key !== 'Escape' || this.menu.hidden) {
      return false
    }

    this.closeMenu()
    return true
  }

  closeMenu() {
    this.menu.hidden = true
    this.menu.innerHTML = ''
  }

  toggleMenu() {
    if (!this.menu.hidden) {
      this.closeMenu()
      return
    }

    this.#renderMenu()
    this.menu.hidden = false
    void this.#positionMenu()
  }

  #detachView() {
    if (!this.#view) {
      return
    }

    this.#view.dom.removeEventListener('mousemove', this.#handleMouseMove)
    this.#view.dom.removeEventListener('keydown', this.#handleKeydown)
    this.#view = null
  }

  #handleMouseMove = (event: MouseEvent) => {
    if (!this.#view) {
      return
    }

    const block = resolveBlockElement(this.#view, this.#view.state.selection.from, event.target)

    if (!block) {
      return
    }

    this.gutter.hidden = false
    void this.#positionGutter(block)

    if (!this.menu.hidden) {
      void this.#positionMenu()
    }
  }

  #handleKeydown = (event: KeyboardEvent) => {
    if (!this.handleKey(event.key)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  #handleDocumentPointerDown = (event: MouseEvent) => {
    const target = event.target

    if (!(target instanceof Node)) {
      return
    }

    if (this.gutter.contains(target) || this.menu.contains(target)) {
      return
    }

    this.closeMenu()
  }

  #renderMenu() {
    this.menu.innerHTML = ''

    blockMenuSections
      .map((section) => ({
        ...section,
        commands: section.commands.filter(isVisibleBlockCommand)
      }))
      .filter((section) => section.commands.length > 0)
      .forEach((section) => {
        const sectionElement = document.createElement('section')
        sectionElement.className = 'cm-command-section'

        const label = document.createElement('div')
        label.className = 'cm-command-section-label'
        label.textContent = section.label
        sectionElement.append(label)

        section.commands.forEach((command) => {
          const definition = editorCommandRegistry[command]
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'cm-surface-command-button cm-surface-command-button--list'
          button.dataset.command = command
          if (definition.destructive) {
            button.classList.add('is-danger')
          }
          button.innerHTML = `
            <span class="cm-command-button-icon">${definition.icon}</span>
            <span class="cm-command-button-text">${definition.label}</span>
          `
          button.addEventListener('click', () => {
            this.closeMenu()
            this.#onRunCommand(command)
          })
          sectionElement.append(button)
        })

        this.menu.append(sectionElement)
      })
  }

  async #positionGutter(block: HTMLElement) {
    const { x, y } = await computePosition(block, this.gutter, {
      placement: 'left-start',
      middleware: [offset(10), flip(), shift({ padding: 8 })]
    })

    Object.assign(this.gutter.style, {
      left: `${x}px`,
      top: `${y}px`
    })
  }

  async #positionMenu() {
    if (this.gutter.hidden) {
      return
    }

    const { x, y } = await computePosition(this.gutter, this.menu, {
      placement: 'right-start',
      middleware: [offset(10), flip(), shift({ padding: 8 })]
    })

    Object.assign(this.menu.style, {
      left: `${x}px`,
      top: `${y}px`
    })
  }
}
