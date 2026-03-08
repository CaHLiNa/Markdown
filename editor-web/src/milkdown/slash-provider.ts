import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { posToDOMRect } from '@milkdown/prose'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'

import {
  commandMatchesQuery,
  editorCommandRegistry,
  quickInsertSections,
  type EditorCommand
} from '../commands'
import { supportsMilkdownCommand } from './commands-adapter'

type SlashMenuState = {
  from: number
  to: number
  query: string
  removeTrigger: boolean
}

type CreateSlashMenuProviderOptions = {
  root: HTMLElement
  onRunCommand: (command: EditorCommand) => boolean
}

const slashPattern = /(^|\s)\/([^\s/]*)$/

const createVirtualElement = (view: EditorView, from: number, to: number) => {
  return {
    getBoundingClientRect() {
      return posToDOMRect(view, from, to)
    }
  }
}

export class SlashMenuProvider {
  readonly element: HTMLElement

  #root: HTMLElement
  #view: EditorView | null = null
  #onRunCommand: (command: EditorCommand) => boolean
  #state: SlashMenuState | null = null
  #manualQuery: string | null = null
  #activeIndex = 0
  #activeCommands: EditorCommand[] = []

  constructor({ root, onRunCommand }: CreateSlashMenuProviderOptions) {
    this.#root = root
    this.#onRunCommand = onRunCommand
    this.element = document.createElement('div')
    this.element.className = 'cm-floating-ui cm-quick-insert'
    this.element.hidden = true
    this.#root.append(this.element)
  }

  attach(view: EditorView) {
    if (this.#view === view) {
      return
    }

    this.#detachView()
    this.#view = view
    view.dom.addEventListener('keydown', this.#handleKeydown)
    this.update(view)
  }

  destroy() {
    this.#detachView()
    this.element.remove()
  }

  isOpen() {
    return !this.element.hidden
  }

  openAtSelection(query = '') {
    if (!this.#view) {
      return
    }

    this.#manualQuery = query
    this.update(this.#view)
  }

  close() {
    this.#manualQuery = null
    this.#state = null
    this.#activeCommands = []
    this.element.hidden = true
    this.element.innerHTML = ''
  }

  update(view: EditorView) {
    this.#view = view
    const nextState = this.#resolveState(view)

    if (!nextState) {
      this.close()
      return
    }

    this.#state = nextState
    this.#render(nextState.query)
    if (this.element.hidden) {
      return
    }
    this.#position(view, nextState.from, nextState.to)
  }

  handleKey(key: string) {
    if (!this.isOpen()) {
      return false
    }

    switch (key) {
      case 'ArrowDown':
        this.#moveActive(1)
        return true
      case 'ArrowUp':
        this.#moveActive(-1)
        return true
      case 'Enter':
        return this.#selectActiveCommand()
      case 'Escape':
        this.close()
        return true
      default:
        return false
    }
  }

  #detachView() {
    if (!this.#view) {
      return
    }

    this.#view.dom.removeEventListener('keydown', this.#handleKeydown)
    this.#view = null
  }

  #handleKeydown = (event: KeyboardEvent) => {
    if (!this.handleKey(event.key)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  #resolveState(view: EditorView): SlashMenuState | null {
    const naturalState = this.#readSlashState(view)

    if (naturalState) {
      this.#manualQuery = null
      return naturalState
    }

    if (this.#manualQuery == null) {
      return null
    }

    const selection = view.state.selection
    if (!(selection instanceof TextSelection) || !selection.empty) {
      return null
    }

    return {
      from: selection.from,
      to: selection.to,
      query: this.#manualQuery,
      removeTrigger: false
    }
  }

  #readSlashState(view: EditorView): SlashMenuState | null {
    const selection = view.state.selection

    if (!(selection instanceof TextSelection) || !selection.empty) {
      return null
    }

    const { $from } = selection

    if (!$from.parent.isTextblock) {
      return null
    }

    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, ' ')
    const match = slashPattern.exec(before)

    if (!match) {
      return null
    }

    const prefix = match[1] ?? ''
    const query = match[2] ?? ''
    const slashStartInParent = (match.index ?? 0) + prefix.length
    const from = $from.start() + slashStartInParent

    return {
      from,
      to: selection.from,
      query,
      removeTrigger: true
    }
  }

  #render(query: string) {
    const sections = quickInsertSections
      .map((section) => ({
        ...section,
        commands: section.commands.filter(
          (command) => supportsMilkdownCommand(command) && commandMatchesQuery(command, query)
        )
      }))
      .filter((section) => section.commands.length > 0)

    const visibleCommands = sections.flatMap((section) => section.commands)

    if (visibleCommands.length === 0) {
      this.close()
      return
    }

    this.#activeCommands = visibleCommands
    this.#activeIndex = Math.min(this.#activeIndex, visibleCommands.length - 1)
    this.element.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'cm-command-panel-header'
    header.innerHTML = `
      <span>插入块</span>
      <span class="cm-command-panel-hint">Slash</span>
    `
    this.element.append(header)

    if (query.length > 0) {
      const queryLabel = document.createElement('div')
      queryLabel.className = 'cm-command-panel-hint cm-quick-insert-query'
      queryLabel.textContent = `/${query}`
      this.element.append(queryLabel)
    }

    sections.forEach((section) => {
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
        button.innerHTML = `
          <span class="cm-command-button-icon">${definition.icon}</span>
          <span class="cm-command-button-text">${definition.label}</span>
        `

        if (visibleCommands[this.#activeIndex] === command) {
          button.classList.add('is-active')
        }

        button.addEventListener('click', () => {
          this.#selectCommand(command)
        })

        sectionElement.append(button)
      })

      this.element.append(sectionElement)
    })

    this.element.hidden = false
  }

  async #position(view: EditorView, from: number, to: number) {
    const reference = createVirtualElement(view, from, to)
    const { x, y } = await computePosition(reference, this.element, {
      placement: 'bottom-start',
      middleware: [offset(10), flip(), shift({ padding: 8 })]
    })

    Object.assign(this.element.style, {
      left: `${x}px`,
      top: `${y}px`
    })
  }

  #moveActive(delta: number) {
    if (this.#activeCommands.length === 0) {
      return
    }

    const total = this.#activeCommands.length
    this.#activeIndex = (this.#activeIndex + delta + total) % total
    this.#render(this.#state?.query ?? '')
  }

  #selectActiveCommand() {
    const command = this.#activeCommands[this.#activeIndex]

    if (!command) {
      return false
    }

    this.#selectCommand(command)
    return true
  }

  #selectCommand(command: EditorCommand) {
    const view = this.#view
    const state = this.#state

    if (!view || !state) {
      return
    }

    if (state.removeTrigger) {
      const transaction = view.state.tr.deleteRange(state.from, state.to)
      transaction.setSelection(TextSelection.create(transaction.doc, state.from))
      view.dispatch(transaction.scrollIntoView())
    }

    this.close()
    this.#onRunCommand(command)
    view.focus()
  }
}
