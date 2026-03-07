// @vitest-environment node

import { describe, expect, it } from 'vitest'

import config from '../vite.config'

describe('vite build config', () => {
  it('emits assets at the bundle root so Xcode resource flattening does not break relative URLs', () => {
    expect(config.build?.assetsDir).toBe('.')
  })
})
