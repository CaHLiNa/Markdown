import { describe, expect, it, vi } from 'vitest'

import {
  installNativeBridge,
  persistImageAssetInNative,
  postMarkdownToNative
} from './bridge'

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

  it('registers window.getEditorState and returns the provided editor snapshot', () => {
    const getEditorState = vi.fn(() => ({
      markdown: '# 标题',
      activeBlock: {
        type: 'heading',
        text: '# 标题'
      },
      selection: {
        anchor: 0,
        head: 1
      }
    }))

    installNativeBridge(() => undefined, () => false, getEditorState)

    expect(window.getEditorState?.()).toEqual({
      markdown: '# 标题',
      activeBlock: {
        type: 'heading',
        text: '# 标题'
      },
      selection: {
        anchor: 0,
        head: 1
      }
    })
    expect(getEditorState).toHaveBeenCalledTimes(1)
  })

  it('posts image persistence requests to native and resolves the returned relative path', async () => {
    const postMessage = vi.fn()

    window.webkit = {
      messageHandlers: {
        editorImageAssetRequest: {
          postMessage
        }
      }
    }

    const promise = persistImageAssetInNative(
      new File(['image'], 'chart.png', { type: 'image/png' })
    )

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(1)
    })

    expect(postMessage).toHaveBeenCalledTimes(1)

    const payload = postMessage.mock.calls[0]?.[0] as {
      requestID: string
      filename: string
      mimeType: string
      base64Data: string
    }

    expect(payload.filename).toBe('chart.png')
    expect(payload.mimeType).toBe('image/png')
    expect(payload.base64Data.length).toBeGreaterThan(0)

    window.__resolveEditorAssetRequest?.(payload.requestID, {
      path: 'note.assets/chart.png'
    })

    await expect(promise).resolves.toBe('note.assets/chart.png')
  })

  it('rejects image persistence requests when native responds with an error', async () => {
    const postMessage = vi.fn()

    window.webkit = {
      messageHandlers: {
        editorImageAssetRequest: {
          postMessage
        }
      }
    }

    const promise = persistImageAssetInNative(
      new File(['image'], 'chart.png', { type: 'image/png' })
    )

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(1)
    })

    const payload = postMessage.mock.calls[0]?.[0] as {
      requestID: string
    }

    window.__resolveEditorAssetRequest?.(payload.requestID, {
      error: '无法保存图片'
    })

    await expect(promise).rejects.toThrow('无法保存图片')
  })
})
