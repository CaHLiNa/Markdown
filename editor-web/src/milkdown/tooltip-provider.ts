import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { posToDOMRect } from '@milkdown/prose'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

import {
  editorCommandRegistry,
  formatToolbarPrimaryCommands,
  formatToolbarSecondaryCommands,
  type EditorCommand
} from '../commands'
import { supportsMilkdownCommand } from './commands-adapter'

type CreateSelectionToolbarProviderOptions = {
  root: HTMLElement
  onRunCommand: (command: EditorCommand) => boolean
}

const createVirtualElement = (view: EditorView, from: number, to: number) => {
  return {
    getBoundingClientRect() {
      return posToDOMRect(view, from, to)
    }
  }
}

export class SelectionToolbarProvider {
  readonly element: HTMLElement

  #root: HTMLElement
  #view: EditorView | null = null
  #onRunCommand: (command: EditorCommand) => boolean
  #secondaryVisible = false

  constructor({ root, onRunCommand }: CreateSelectionToolbarProviderOptions) {
    this.#root = root
    this.#onRunCommand = onRunCommand
    this.element = document.createElement('div')
    this.element.className = 'cm-floating-ui cm-format-toolbar'
    this.element.hidden = true
    this.#root.append(this.element)
  }

  attach(view: EditorView) {
    this.#view = view
    view.dom.addEventListener('keydown', this.#handleKeydown)
    this.update(view)
  }

  destroy() {
    if (this.#view) {
      this.#view.dom.removeEventListener('keydown', this.#handleKeydown)
    }

    this.element.remove()
    this.#view = null
  }

  update(view: EditorView) {
    this.#view = view
    const selection = view.state.selection
    const selectedText = view.state.doc.textBetween(selection.from, selection.to)

    if (
      !(selection instanceof TextSelection) ||
      selection.empty ||
      selectedText.trim().length === 0
    ) {
      this.hide()
      return
    }

    this.#render()
    void this.#position(view, selection.from, selection.to)
  }

  handleKey(key: string) {
    if (key !== 'Escape' || this.element.hidden) {
      return false
    }

    this.hide()
    return true
  }

  hide() {
    this.element.hidden = true
    this.#secondaryVisible = false
    this.element.innerHTML = ''
  }

  #handleKeydown = (event: KeyboardEvent) => {
    if (!this.handleKey(event.key)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  #render() {
    this.element.innerHTML = ''

    const primaryRow = document.createElement('div')
    primaryRow.className = 'cm-format-toolbar-primary'
    formatToolbarPrimaryCommands
      .filter(supportsMilkdownCommand)
      .forEach((command) => {
        primaryRow.append(this.#createButton(command))
      })

    const moreButton = document.createElement('button')
    moreButton.type = 'button'
    moreButton.className = 'cm-format-more-trigger'
    moreButton.textContent = '...'
    if (this.#secondaryVisible) {
      moreButton.classList.add('is-active')
    }
    moreButton.addEventListener('click', () => {
      this.#secondaryVisible = !this.#secondaryVisible
      this.#render()
      if (this.#view) {
        this.update(this.#view)
      }
    })
    primaryRow.append(moreButton)

    const secondaryRow = document.createElement('div')
    secondaryRow.className = 'cm-format-toolbar-secondary'
    secondaryRow.hidden = !this.#secondaryVisible
    formatToolbarSecondaryCommands
      .filter(supportsMilkdownCommand)
      .forEach((command) => {
        secondaryRow.append(this.#createButton(command))
      })

    this.element.append(primaryRow, secondaryRow)
    this.element.hidden = false
  }

  #createButton(command: EditorCommand) {
    const definition = editorCommandRegistry[command]
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-surface-command-button cm-surface-command-button--toolbar'
    button.dataset.command = command
    button.title = definition.label
    button.setAttribute('aria-label', definition.label)
    button.innerHTML = `
      <span class="cm-command-button-icon">${definition.icon}</span>
      <span class="cm-command-button-text cm-command-button-text--sr-only">${definition.label}</span>
    `
    button.addEventListener('click', () => {
      this.#onRunCommand(command)
      this.#view?.focus()
    })
    return button
  }

  async #position(view: EditorView, from: number, to: number) {
    const reference = createVirtualElement(view, from, to)
    const { x, y } = await computePosition(reference, this.element, {
      placement: 'top',
      middleware: [offset(12), flip(), shift({ padding: 8 })]
    })

    Object.assign(this.element.style, {
      left: `${x}px`,
      top: `${y}px`
    })
  }
}
