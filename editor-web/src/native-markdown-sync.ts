export type NativeMarkdownSync = {
  schedule: (markdown: string) => void
  flush: () => void
  destroy: () => void
}

export const createNativeMarkdownSync = (
  postMarkdown: (markdown: string) => void,
  delayMs = 250,
  maxWaitMs = 1000
): NativeMarkdownSync => {
  let pendingMarkdown: string | null = null
  let timer: number | null = null
  let lastPostedAt = Date.now()

  const clearTimer = () => {
    if (timer == null) {
      return
    }

    window.clearTimeout(timer)
    timer = null
  }

  const flush = (timestamp = Date.now()) => {
    if (pendingMarkdown == null) {
      clearTimer()
      return
    }

    const markdown = pendingMarkdown
    pendingMarkdown = null
    clearTimer()
    lastPostedAt = timestamp
    postMarkdown(markdown)
  }

  return {
    schedule(markdown) {
      const now = Date.now()
      pendingMarkdown = markdown

      if (maxWaitMs > 0 && now - lastPostedAt >= maxWaitMs) {
        flush(now)
        return
      }

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
