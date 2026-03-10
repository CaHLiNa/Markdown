import { afterEach, describe, expect, it, vi } from 'vitest'

import { postEditorReadyToNative, postMarkdownToNative } from './bridge'

describe('bridge', () => {
  afterEach(() => {
    delete window.webkit
    delete window.__editorGeneration
  })

  it('posts markdown changes with the current editor generation', () => {
    const postMessage = vi.fn()
    window.__editorGeneration = 7
    window.webkit = {
      messageHandlers: {
        editorContentChanged: {
          postMessage
        }
      }
    }

    postMarkdownToNative('updated markdown')

    expect(postMessage).toHaveBeenCalledWith({
      generation: 7,
      markdown: 'updated markdown'
    })
  })

  it('posts ready events with the current editor generation', () => {
    const postMessage = vi.fn()
    window.__editorGeneration = 11
    window.webkit = {
      messageHandlers: {
        editorReady: {
          postMessage
        }
      }
    }

    postEditorReadyToNative()

    expect(postMessage).toHaveBeenCalledWith({
      ready: true,
      generation: 11
    })
  })
})
