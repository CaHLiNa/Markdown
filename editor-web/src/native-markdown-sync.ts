export type NativeMarkdownSync = {
  schedule: (markdown: string) => void
  flush: () => void
  destroy: () => void
}

export const createNativeMarkdownSync = (
  postMarkdown: (markdown: string) => void,
  delayMs = 250
): NativeMarkdownSync => {
  let pendingMarkdown: string | null = null
  let timer: number | null = null

  const clearTimer = () => {
    if (timer == null) {
      return
    }

    window.clearTimeout(timer)
    timer = null
  }

  const flush = () => {
    if (pendingMarkdown == null) {
      clearTimer()
      return
    }

    const markdown = pendingMarkdown
    pendingMarkdown = null
    clearTimer()
    postMarkdown(markdown)
  }

  return {
    schedule(markdown) {
      pendingMarkdown = markdown
      clearTimer()
      timer = window.setTimeout(() => {
        flush()
      }, delayMs)
    },
    flush,
    destroy() {
      pendingMarkdown = null
      clearTimer()
    }
  }
}
