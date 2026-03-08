import { describe, expect, test } from 'vitest'

import {
  convertExternalMathBlocksToInternal,
  convertInternalMathBlocksToExternal,
  INTERNAL_MATH_LANGUAGE
} from './math-markdown'

describe('math markdown conversion', () => {
  test('converts block math fences into internal code blocks without touching inline math', () => {
    const markdown = ['段落', '', '$$', 'a^2 + b^2 = c^2', '$$', '', '行内 $x$'].join('\n')

    expect(convertExternalMathBlocksToInternal(markdown)).toBe(
      ['段落', '', `\`\`\`${INTERNAL_MATH_LANGUAGE}`, 'a^2 + b^2 = c^2', '```', '', '行内 $x$'].join('\n')
    )
  })

  test('converts internal math code blocks back into dollar fences', () => {
    const internalMarkdown = [
      '段落',
      '',
      `\`\`\`${INTERNAL_MATH_LANGUAGE}`,
      'e^{i\\pi} + 1 = 0',
      '```'
    ].join('\n')

    expect(convertInternalMathBlocksToExternal(internalMarkdown)).toBe(
      ['段落', '', '$$', 'e^{i\\pi} + 1 = 0', '$$'].join('\n')
    )
  })
})
