// @vitest-environment node

import { describe, expect, it } from 'vitest'

import config from '../vite.config'

describe('vite build config', () => {
  it('emits assets at the bundle root so Xcode resource flattening does not break relative URLs', () => {
    expect(config.build?.assetsDir).toBe('.')
  })

  it('splits the heaviest editor dependencies into stable vendor chunks', () => {
    const output = config.build?.rollupOptions?.output
    const manualChunksApi = {
      getModuleIds: () => [][Symbol.iterator](),
      getModuleInfo: () => null
    }

    if (!output || Array.isArray(output) || typeof output.manualChunks !== 'function') {
      throw new Error('Expected vite build output.manualChunks to be configured.')
    }

    expect(
      output.manualChunks('/workspace/node_modules/@milkdown/kit/lib/index.js', manualChunksApi)
    ).toBe(
      'vendor-milkdown'
    )
    expect(
      output.manualChunks('/workspace/node_modules/prosemirror-view/dist/index.js', manualChunksApi)
    ).toBe(
      'vendor-prosemirror'
    )
    expect(
      output.manualChunks('/workspace/node_modules/@codemirror/view/dist/index.js', manualChunksApi)
    ).toBe(
      'vendor-codemirror'
    )
    expect(
      output.manualChunks('/workspace/node_modules/katex/dist/katex.mjs', manualChunksApi)
    ).toBe(
      'vendor-katex'
    )
  })
})
