import { describe, expect, it, vi } from 'vitest'

import { installNativeBridge, postMarkdownToNative } from './bridge'

describe('native bridge', () => {
  it('posts markdown updates to the WKWebView bridge when available', () => {
    const postMessage = vi.fn()

    window.webkit = {
      messageHandlers: {
        editorContentChanged: {
          postMessage
        }
      }
    }

    postMarkdownToNative('# math')

    expect(postMessage).toHaveBeenCalledWith('# math')
  })

  it('registers window.loadMarkdown and normalizes invalid values to an empty string', () => {
    const receive = vi.fn()

    installNativeBridge(receive)

    window.loadMarkdown?.('hello')
    window.loadMarkdown?.(null as never)

    expect(receive).toHaveBeenNthCalledWith(1, 'hello')
    expect(receive).toHaveBeenNthCalledWith(2, '')
  })

  it('registers window.runEditorCommand and normalizes invalid values to an empty string', () => {
    const runCommand = vi.fn(() => true)

    installNativeBridge(() => undefined, runCommand)

    expect(window.runEditorCommand?.('bold')).toBe(true)
    expect(window.runEditorCommand?.(null as never)).toBe(true)

    expect(runCommand).toHaveBeenNthCalledWith(1, 'bold')
    expect(runCommand).toHaveBeenNthCalledWith(2, '')
  })
})
