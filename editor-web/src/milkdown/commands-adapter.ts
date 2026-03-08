import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx } from '@milkdown/kit/core'
import { setBlockType, toggleMark, wrapIn } from '@milkdown/kit/prose/commands'
import { mathBlockSchema, mathInlineSchema } from '@milkdown/plugin-math'
import { NodeSelection, TextSelection } from '@milkdown/prose/state'
import {
  blockquoteSchema,
  bulletListSchema,
  codeBlockSchema,
  emphasisSchema,
  headingSchema,
  hrSchema,
  imageSchema,
  inlineCodeSchema,
  linkSchema,
  listItemSchema,
  orderedListSchema,
  paragraphSchema,
  strongSchema
} from '@milkdown/kit/preset/commonmark'
import {
  createTable,
  strikethroughSchema
} from '@milkdown/kit/preset/gfm'

import type { EditorCommand } from '../commands'

type SelectionOffsets = {
  anchor: number
  head: number
}

type MarkdownEdit = {
  markdown: string
  selection: SelectionOffsets
}

type InlineWrapperMatch = {
  from: number
  to: number
  contentFrom: number
  contentTo: number
}

const normalizeRange = (selection: SelectionOffsets) => {
  return selection.anchor <= selection.head
    ? {
        from: selection.anchor,
        to: selection.head
      }
    : {
        from: selection.head,
        to: selection.anchor
      }
}

const replaceSelection = (
  markdown: string,
  selection: SelectionOffsets,
  insert: string,
  nextSelection?: SelectionOffsets
): MarkdownEdit => {
  const { from, to } = normalizeRange(selection)
  const updated = markdown.slice(0, from) + insert + markdown.slice(to)

  return {
    markdown: updated,
    selection:
      nextSelection ?? {
        anchor: from + insert.length,
        head: from + insert.length
      }
  }
}

const wrapSelection = (
  markdown: string,
  selection: SelectionOffsets,
  prefix: string,
  suffix = prefix,
  placeholder = 'text'
): MarkdownEdit => {
  const { from, to } = normalizeRange(selection)
  const selected = markdown.slice(from, to)
  const text = selected.length > 0 ? selected : placeholder
  const insert = `${prefix}${text}${suffix}`
  const cursorStart = from + prefix.length

  return replaceSelection(markdown, selection, insert, {
    anchor: cursorStart,
    head: cursorStart + text.length
  })
}

const currentLineRange = (markdown: string, selection: SelectionOffsets) => {
  const { from, to } = normalizeRange(selection)
  const lineStart = markdown.lastIndexOf('\n', Math.max(0, from - 1)) + 1
  const lineEndIndex = markdown.indexOf('\n', to)
  const lineEnd = lineEndIndex === -1 ? markdown.length : lineEndIndex

  return {
    from: lineStart,
    to: lineEnd,
    text: markdown.slice(lineStart, lineEnd)
  }
}

const transformCurrentLines = (
  markdown: string,
  selection: SelectionOffsets,
  transform: (line: string, index: number) => string
): MarkdownEdit => {
  const range = currentLineRange(markdown, selection)
  const lines = range.text.split('\n')
  const nextText = lines.map(transform).join('\n')

  return replaceSelection(markdown, { anchor: range.from, head: range.to }, nextText, {
    anchor: range.from,
    head: range.from + nextText.length
  })
}

const clearInlineFormatting = (text: string) => {
  let next = text

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const previous = next

    next = next
      .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
      .replace(/\*([\s\S]+?)\*/g, '$1')
      .replace(/~~([\s\S]+?)~~/g, '$1')
      .replace(/==([\s\S]+?)==/g, '$1')
      .replace(/`([^`]+?)`/g, '$1')
      .replace(/\$([^$\n]+?)\$/g, '$1')
      .replace(/<u>([\s\S]+?)<\/u>/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    if (next === previous) {
      return next
    }
  }

  return next
}

const collectInlineWrapperMatches = (markdown: string) => {
  const matches: InlineWrapperMatch[] = []

  const pushMatches = (pattern: RegExp, contentOffset: (match: RegExpExecArray) => number) => {
    pattern.lastIndex = 0

    for (let match = pattern.exec(markdown); match; match = pattern.exec(markdown)) {
      const full = match[0] ?? ''
      const content = match[1] ?? ''
      const from = match.index
      const contentFrom = from + contentOffset(match)
      matches.push({
        from,
        to: from + full.length,
        contentFrom,
        contentTo: contentFrom + content.length
      })
    }
  }

  pushMatches(/!\[([^\]]*)\]\(([^)]+)\)/g, () => 2)
  pushMatches(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, () => 1)
  pushMatches(/<u>([\s\S]+?)<\/u>/g, () => 3)
  pushMatches(/(?<!\*)\*\*([\s\S]+?)\*\*(?!\*)/g, () => 2)
  pushMatches(/(?<!\*)\*([^*\n][\s\S]*?)\*(?!\*)/g, () => 1)
  pushMatches(/~~([\s\S]+?)~~/g, () => 2)
  pushMatches(/==([\s\S]+?)==/g, () => 2)
  pushMatches(/`([^`\n]+?)`/g, () => 1)
  pushMatches(/\$([^$\n]+?)\$/g, () => 1)

  return matches
}

const selectionTouchesContent = (
  selection: { from: number; to: number },
  match: InlineWrapperMatch
) => {
  if (selection.from === selection.to) {
    return selection.from >= match.contentFrom && selection.from <= match.contentTo
  }

  return selection.to > match.contentFrom && selection.from < match.contentTo
}

const expandSelectionForInlineFormatting = (
  markdown: string,
  selection: SelectionOffsets
) => {
  let current = normalizeRange(selection)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = collectInlineWrapperMatches(markdown)
      .filter((match) => selectionTouchesContent(current, match))
      .filter((match) => match.from <= current.from && match.to >= current.to)
      .sort((left, right) => (left.to - left.from) - (right.to - right.from))[0]

    if (!candidate) {
      return current
    }

    if (candidate.from === current.from && candidate.to === current.to) {
      return current
    }

    current = {
      from: candidate.from,
      to: candidate.to
    }
  }

  return current
}

const runProseCommand = (
  editor: Editor,
  buildCommand: (ctx: Parameters<Editor['action']>[0] extends (ctx: infer T) => unknown ? T : never) => ReturnType<typeof toggleMark>
) => {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const command = buildCommand(ctx)
    return command(view.state, view.dispatch, view)
  })
}

const resolveBlockRange = (editor: Editor) => {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { $from } = view.state.selection

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth)
      if (!node.isBlock) {
        continue
      }

      return {
        view,
        ctx,
        depth,
        node,
        from: $from.before(depth),
        to: $from.after(depth)
      }
    }

    return null
  })
}

const insertBlockMath = (editor: Editor) => {
  return editor.action((ctx) => {
    const block = resolveBlockRange(editor)
    const type = mathBlockSchema.type(ctx)

    if (!block) {
      return false
    }

    const node = type.create({
      value: ''
    })
    const transaction = block.view.state.tr.replaceWith(block.from, block.to, node)
    transaction.setSelection(NodeSelection.create(transaction.doc, block.from))
    block.view.dispatch(transaction.scrollIntoView())
    return true
  })
}

const insertInlineMath = (editor: Editor) => {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { from, to, empty } = view.state.selection
    const selectedText = empty ? 'x' : view.state.doc.textBetween(from, to, ' ')
    const node = mathInlineSchema.type(ctx).create(
      undefined,
      selectedText.length > 0 ? view.state.schema.text(selectedText) : undefined
    )
    const transaction = view.state.tr.replaceSelectionWith(node)
    transaction.setSelection(NodeSelection.create(transaction.doc, from))
    view.dispatch(transaction.scrollIntoView())
    return true
  })
}

const toTaskListItems = (editor: Editor) => {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const wrapInBulletList = wrapIn(bulletListSchema.type(ctx))
    const wrapped = wrapInBulletList(view.state, view.dispatch, view)
    const state = view.state
    const listItemType = listItemSchema.type(ctx)
    const { from, to } = state.selection
    let transaction = state.tr
    let changed = false

    state.doc.descendants((node, pos) => {
      if (node.type !== listItemType) {
        return
      }

      const intersectsSelection = pos < to && pos + node.nodeSize > from
      const containsCursor = from === to && pos < from && pos + node.nodeSize > from

      if (!intersectsSelection && !containsCursor) {
        return
      }

      const nextAttrs = {
        ...node.attrs,
        checked: false,
        label: '•',
        listType: 'bullet'
      }

      if (
        node.attrs.checked === nextAttrs.checked &&
        node.attrs.label === nextAttrs.label &&
        node.attrs.listType === nextAttrs.listType
      ) {
        return
      }

      transaction = transaction.setNodeMarkup(pos, undefined, nextAttrs)
      changed = true
    })

    if (changed) {
      view.dispatch(transaction.scrollIntoView())
    }

    return wrapped || changed
  })
}

const findActiveMarkRange = (
  editor: Editor,
  markType: ReturnType<typeof strongSchema.type>
) => {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const { selection } = view.state

    if (!selection.empty) {
      return null
    }

    const { $from } = selection

    if (!$from.parent.isTextblock) {
      return null
    }

    const children = [] as Array<{
      start: number
      end: number
      hasMark: boolean
    }>
    let offset = 0

    for (let index = 0; index < $from.parent.childCount; index += 1) {
      const child = $from.parent.child(index)
      const start = offset
      const end = offset + child.nodeSize
      children.push({
        start,
        end,
        hasMark: child.marks.some((mark) => mark.type === markType)
      })
      offset = end
    }

    const cursor = $from.parentOffset
    const activeIndex = children.findIndex(
      (child) => child.hasMark && cursor >= child.start && cursor <= child.end
    )

    if (activeIndex === -1) {
      return null
    }

    let start = children[activeIndex]?.start ?? 0
    let end = children[activeIndex]?.end ?? 0

    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      if (!children[index]?.hasMark) {
        break
      }

      start = children[index]?.start ?? start
    }

    for (let index = activeIndex + 1; index < children.length; index += 1) {
      if (!children[index]?.hasMark) {
        break
      }

      end = children[index]?.end ?? end
    }

    return {
      from: $from.start() + start,
      to: $from.start() + end
    }
  })
}

const clearMilkdownFormatting = (editor: Editor) => {
  return editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const markTypes = [
      strongSchema.type(ctx),
      emphasisSchema.type(ctx),
      inlineCodeSchema.type(ctx),
      strikethroughSchema.type(ctx),
      linkSchema.type(ctx)
    ]
    const { selection } = view.state
    let transaction = view.state.tr
    let changed = false

    if (selection.empty) {
      for (const markType of markTypes) {
        const range = findActiveMarkRange(editor, markType)

        if (!range) {
          continue
        }

        transaction = transaction.removeMark(range.from, range.to, markType)
        changed = true
      }
    } else {
      for (const markType of markTypes) {
        if (!view.state.doc.rangeHasMark(selection.from, selection.to, markType)) {
          continue
        }

        transaction = transaction.removeMark(selection.from, selection.to, markType)
        changed = true
      }
    }

    if (!changed) {
      return false
    }

    view.dispatch(transaction.scrollIntoView())
    return true
  })
}

export const runMilkdownCommand = (editor: Editor, command: EditorCommand) => {
  switch (command) {
    case 'paragraph':
      return runProseCommand(editor, (ctx) => setBlockType(paragraphSchema.type(ctx)))
    case 'heading-1':
      return runProseCommand(editor, (ctx) => setBlockType(headingSchema.type(ctx), { level: 1 }))
    case 'heading-2':
      return runProseCommand(editor, (ctx) => setBlockType(headingSchema.type(ctx), { level: 2 }))
    case 'heading-3':
      return runProseCommand(editor, (ctx) => setBlockType(headingSchema.type(ctx), { level: 3 }))
    case 'heading-4':
      return runProseCommand(editor, (ctx) => setBlockType(headingSchema.type(ctx), { level: 4 }))
    case 'heading-5':
      return runProseCommand(editor, (ctx) => setBlockType(headingSchema.type(ctx), { level: 5 }))
    case 'heading-6':
      return runProseCommand(editor, (ctx) => setBlockType(headingSchema.type(ctx), { level: 6 }))
    case 'blockquote':
      return runProseCommand(editor, (ctx) => wrapIn(blockquoteSchema.type(ctx)))
    case 'bullet-list':
      return runProseCommand(editor, (ctx) => wrapIn(bulletListSchema.type(ctx)))
    case 'ordered-list':
      return runProseCommand(editor, (ctx) => wrapIn(orderedListSchema.type(ctx), { order: 1 }))
    case 'task-list':
      return toTaskListItems(editor)
    case 'code-block':
      return runProseCommand(editor, (ctx) => setBlockType(codeBlockSchema.type(ctx), { language: '' }))
    case 'math-block':
      return insertBlockMath(editor)
    case 'bold':
      return runProseCommand(editor, (ctx) => toggleMark(strongSchema.type(ctx)))
    case 'italic':
      return runProseCommand(editor, (ctx) => toggleMark(emphasisSchema.type(ctx)))
    case 'inline-code':
      return runProseCommand(editor, (ctx) => toggleMark(inlineCodeSchema.type(ctx)))
    case 'inline-math':
      return insertInlineMath(editor)
    case 'strikethrough':
      return runProseCommand(editor, (ctx) => toggleMark(strikethroughSchema.type(ctx)))
    case 'link':
      return runProseCommand(editor, (ctx) =>
        toggleMark(linkSchema.type(ctx), { href: 'https://example.com' })
      )
    case 'clear-format':
      return clearMilkdownFormatting(editor)
    case 'horizontal-rule':
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const node = hrSchema.type(ctx).create()
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
        return true
      })
    case 'image':
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const node = imageSchema.type(ctx).create({
            src: 'assets/image.png',
            alt: 'image',
            title: ''
        })
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
        return true
      })
    case 'table':
      return editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const node = createTable(ctx, 3, 3)
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
        return true
      })
    case 'new-paragraph':
      return editor.action((ctx) => {
        const block = resolveBlockRange(editor)
        if (!block) {
          return false
        }
        const node = paragraphSchema.type(ctx).createAndFill()
        if (!node) {
          return false
        }
        const transaction = block.view.state.tr.insert(block.to, node)
        transaction.setSelection(TextSelection.create(transaction.doc, block.to + 1))
        block.view.dispatch(transaction.scrollIntoView())
        return true
      })
    case 'duplicate-block':
      return editor.action(() => {
        const block = resolveBlockRange(editor)
        if (!block) {
          return false
        }

        block.view.dispatch(block.view.state.tr.insert(block.to, block.node.copy(block.node.content)).scrollIntoView())
        return true
      })
    case 'delete-block':
      return editor.action(() => {
        const block = resolveBlockRange(editor)
        if (!block) {
          return false
        }

        block.view.dispatch(block.view.state.tr.deleteRange(block.from, block.to).scrollIntoView())
        return true
      })
    case 'upgrade-heading':
    case 'degrade-heading':
      return editor.action(() => {
        const block = resolveBlockRange(editor)
        if (!block || block.node.type.name !== 'heading') {
          return false
        }

        const currentLevel = Number(block.node.attrs.level ?? 1)
        const nextLevel =
          command === 'upgrade-heading'
            ? Math.min(6, currentLevel + 1)
            : Math.max(1, currentLevel - 1)

        block.view.dispatch(block.view.state.tr.setNodeMarkup(block.from, block.node.type, {
          ...block.node.attrs,
            level: nextLevel
        }).scrollIntoView())
        return true
      })
    default:
      return false
  }
}

export const supportsMilkdownCommand = (command: EditorCommand) => {
  switch (command) {
    case 'paragraph':
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6':
    case 'upgrade-heading':
    case 'degrade-heading':
    case 'blockquote':
    case 'bullet-list':
    case 'ordered-list':
    case 'task-list':
    case 'code-block':
    case 'math-block':
    case 'bold':
    case 'italic':
    case 'inline-code':
    case 'inline-math':
    case 'strikethrough':
    case 'link':
    case 'clear-format':
    case 'horizontal-rule':
    case 'image':
    case 'table':
    case 'duplicate-block':
    case 'new-paragraph':
    case 'delete-block':
      return true
    default:
      return false
  }
}

export const runSourceCommand = (
  command: EditorCommand,
  markdown: string,
  selection: SelectionOffsets
): MarkdownEdit | null => {
  switch (command) {
    case 'bold':
      return wrapSelection(markdown, selection, '**')
    case 'italic':
      return wrapSelection(markdown, selection, '*')
    case 'underline':
      return wrapSelection(markdown, selection, '<u>', '</u>')
    case 'highlight':
      return wrapSelection(markdown, selection, '==')
    case 'inline-code':
      return wrapSelection(markdown, selection, '`')
    case 'inline-math':
      return wrapSelection(markdown, selection, '$')
    case 'strikethrough':
      return wrapSelection(markdown, selection, '~~')
    case 'link':
      return wrapSelection(markdown, selection, '[', '](https://example.com)', 'link')
    case 'image':
      return replaceSelection(markdown, selection, '![alt](assets/image.png)')
    case 'horizontal-rule':
      return replaceSelection(markdown, selection, '\n\n---\n\n')
    case 'front-matter':
      return replaceSelection(
        markdown,
        { anchor: 0, head: 0 },
        '---\ntitle: 标题\ntags: []\n---\n\n',
        { anchor: 4, head: 6 }
      )
    case 'code-block':
      return replaceSelection(markdown, selection, '```\n\n```', {
        anchor: normalizeRange(selection).from + 4,
        head: normalizeRange(selection).from + 4
      })
    case 'math-block':
      return replaceSelection(markdown, selection, '$$\n\n$$', {
        anchor: normalizeRange(selection).from + 3,
        head: normalizeRange(selection).from + 3
      })
    case 'clear-format': {
      const { from, to } = expandSelectionForInlineFormatting(markdown, selection)
      const selected = markdown.slice(from, to)
      const cleared = clearInlineFormatting(selected)
      return replaceSelection(markdown, { anchor: from, head: to }, cleared, {
        anchor: from,
        head: from + cleared.length
      })
    }
    case 'blockquote':
      return transformCurrentLines(markdown, selection, (line) => `> ${line}`)
    case 'bullet-list':
      return transformCurrentLines(markdown, selection, (line) => `- ${line}`)
    case 'ordered-list':
      return transformCurrentLines(markdown, selection, (line, index) => `${index + 1}. ${line}`)
    case 'task-list':
      return transformCurrentLines(markdown, selection, (line) => `- [ ] ${line}`)
    case 'heading-1':
      return transformCurrentLines(markdown, selection, (line) => `# ${line.replace(/^\s{0,3}#{1,6}\s+/, '')}`)
    case 'heading-2':
      return transformCurrentLines(markdown, selection, (line) => `## ${line.replace(/^\s{0,3}#{1,6}\s+/, '')}`)
    case 'heading-3':
      return transformCurrentLines(markdown, selection, (line) => `### ${line.replace(/^\s{0,3}#{1,6}\s+/, '')}`)
    case 'heading-4':
      return transformCurrentLines(markdown, selection, (line) => `#### ${line.replace(/^\s{0,3}#{1,6}\s+/, '')}`)
    case 'heading-5':
      return transformCurrentLines(markdown, selection, (line) => `##### ${line.replace(/^\s{0,3}#{1,6}\s+/, '')}`)
    case 'heading-6':
      return transformCurrentLines(markdown, selection, (line) => `###### ${line.replace(/^\s{0,3}#{1,6}\s+/, '')}`)
    case 'paragraph':
      return transformCurrentLines(markdown, selection, (line) =>
        line
          .replace(/^\s{0,3}#{1,6}\s+/, '')
          .replace(/^\s{0,3}>\s?/, '')
          .replace(/^\s{0,3}(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/, '')
      )
    case 'new-paragraph':
      return replaceSelection(markdown, selection, '\n\n')
    default:
      return null
  }
}
