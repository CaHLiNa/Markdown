import { describe, expect, it } from 'vitest'

import { shouldStopBlockMathEvent, shouldStopInlineMathEvent } from './math-nodeviews'

describe('math nodeview event guards', () => {
  it('only stops block math events from the embedded source editor', () => {
    const sourceShell = document.createElement('div')
    const sourceInner = document.createElement('div')
    const preview = document.createElement('div')

    sourceShell.append(sourceInner)

    expect(shouldStopBlockMathEvent(sourceShell, sourceInner)).toBe(true)
    expect(shouldStopBlockMathEvent(sourceShell, sourceShell)).toBe(true)
    expect(shouldStopBlockMathEvent(sourceShell, preview)).toBe(false)
  })

  it('only stops inline math events from the text input itself', () => {
    const input = document.createElement('input')
    const preview = document.createElement('span')

    expect(shouldStopInlineMathEvent(input, input)).toBe(true)
    expect(shouldStopInlineMathEvent(input, preview)).toBe(false)
  })
})
