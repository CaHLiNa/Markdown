import { afterEach, beforeEach, vi } from 'vitest'

import { createNativeMarkdownSync } from './native-markdown-sync'

describe('native-markdown-sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-09T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes after the debounce delay when typing stops', () => {
    const postMarkdown = vi.fn()
    const sync = createNativeMarkdownSync(postMarkdown, 250, 1000)

    sync.schedule('draft')
    vi.advanceTimersByTime(249)
    expect(postMarkdown).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(postMarkdown).toHaveBeenCalledTimes(1)
    expect(postMarkdown).toHaveBeenCalledWith('draft')
  })

  it('flushes during continuous typing after the max wait interval', () => {
    const postMarkdown = vi.fn()
    const sync = createNativeMarkdownSync(postMarkdown, 250, 1000)

    sync.schedule('a')

    for (const value of ['ab', 'abc', 'abcd', 'abcde', 'abcdef']) {
      vi.advanceTimersByTime(200)
      sync.schedule(value)
    }

    expect(postMarkdown).toHaveBeenCalledTimes(1)
    expect(postMarkdown).toHaveBeenLastCalledWith('abcdef')

    vi.advanceTimersByTime(200)
    sync.schedule('abcdefg')
    vi.advanceTimersByTime(250)

    expect(postMarkdown).toHaveBeenCalledTimes(2)
    expect(postMarkdown).toHaveBeenLastCalledWith('abcdefg')
  })
})
