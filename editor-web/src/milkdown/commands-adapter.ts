import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx } from '@milkdown/kit/core'
import { setBlockType, toggleMark, wrapIn } from '@milkdown/kit/prose/commands'
import { TextSelection } from '@milkdown/prose/state'
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
    case 'code-block':
      return runProseCommand(editor, (ctx) => setBlockType(codeBlockSchema.type(ctx), { language: '' }))
    case 'bold':
      return runProseCommand(editor, (ctx) => toggleMark(strongSchema.type(ctx)))
    case 'italic':
      return runProseCommand(editor, (ctx) => toggleMark(emphasisSchema.type(ctx)))
    case 'inline-code':
      return runProseCommand(editor, (ctx) => toggleMark(inlineCodeSchema.type(ctx)))
    case 'strikethrough':
      return runProseCommand(editor, (ctx) => toggleMark(strikethroughSchema.type(ctx)))
    case 'link':
      return runProseCommand(editor, (ctx) =>
        toggleMark(linkSchema.type(ctx), { href: 'https://example.com' })
      )
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
    case 'code-block':
    case 'bold':
    case 'italic':
    case 'inline-code':
    case 'strikethrough':
    case 'link':
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
      const { from, to } = normalizeRange(selection)
      const selected = markdown.slice(from, to)
      return replaceSelection(markdown, selection, clearInlineFormatting(selected), {
        anchor: from,
        head: from + clearInlineFormatting(selected).length
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
