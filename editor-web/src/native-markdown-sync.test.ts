import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { createNativeMarkdownSync } from './native-markdown-sync'

describe('native markdown sync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('debounces markdown posts and only sends the latest payload', () => {
    const post = vi.fn()
    const sync = createNativeMarkdownSync(post, 250)

    sync.schedule('# one')
    sync.schedule('# two')

    vi.advanceTimersByTime(249)
    expect(post).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('# two')
  })

  test('flushes pending markdown immediately', () => {
    const post = vi.fn()
    const sync = createNativeMarkdownSync(post, 250)

    sync.schedule('# flushed')
    sync.flush()

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('# flushed')
  })
})
