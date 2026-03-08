import {
  extractMarkdownBlocks,
  findHeadingOffset,
  type MarkdownBlock
} from '../markdown-renderer'

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max)
}

export class MarkdownOffsetMapper {
  #markdown: string
  #blocks: MarkdownBlock[]

  constructor(markdown: string) {
    this.#markdown = markdown
    this.#blocks = extractMarkdownBlocks(markdown)
  }

  update(markdown: string) {
    this.#markdown = markdown
    this.#blocks = extractMarkdownBlocks(markdown)
  }

  get blocks() {
    return this.#blocks
  }

  clampSelection(anchor: number, head = anchor) {
    const max = this.#markdown.length

    return {
      anchor: clamp(anchor, 0, max),
      head: clamp(head, 0, max)
    }
  }

  findBlockAtOffset(offset: number) {
    const { anchor } = this.clampSelection(offset)
    return (
      this.#blocks.find((block) => anchor >= block.from && anchor <= block.to) ??
      this.#blocks[this.#blocks.length - 1] ??
      null
    )
  }

  findSelectionForBlock(type: MarkdownBlock['type'], index: number, start: number, end = start) {
    const block = this.#blocks.filter((candidate) => candidate.type === type)[index] ?? null

    if (!block) {
      return null
    }

    return this.clampSelection(block.from + start, block.from + end)
  }

  findSelectionForParagraph(index: number, start: number, end = start) {
    return this.findSelectionForBlock('paragraph', index, start, end)
  }

  findHeading(title: string) {
    const offset = findHeadingOffset(this.#markdown, title)

    if (offset == null) {
      return null
    }

    return this.clampSelection(offset)
  }
}
