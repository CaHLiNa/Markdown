import { describe, expect, test } from 'vitest'

import {
  defaultEditorPresentation,
  normalizeEditorPresentation
} from './editor-presentation'

describe('editor presentation', () => {
  test('provides a full default presentation snapshot', () => {
    expect(defaultEditorPresentation.theme).toBe('light')
    expect(defaultEditorPresentation.focusMode).toBe(false)
    expect(defaultEditorPresentation.typewriterMode).toBe(false)
    expect(defaultEditorPresentation.fontSize).toBe(17)
    expect(defaultEditorPresentation.lineHeight).toBeCloseTo(1.86)
    expect(defaultEditorPresentation.pageWidth).toBe('860px')
    expect(defaultEditorPresentation.autoPairMarkdownSyntax).toBe(true)
  })

  test('normalizes invalid values back to safe defaults', () => {
    const presentation = normalizeEditorPresentation({
      theme: 'unknown',
      focusMode: 'bad',
      typewriterMode: true,
      fontFamily: '',
      fontSize: -5,
      lineHeight: 0.2,
      pageWidth: '',
      codeFontFamily: '',
      codeFontSize: 999,
      hideQuickInsertHint: 'nope',
      autoPairBracket: false,
      autoPairMarkdownSyntax: 'bad',
      autoPairQuote: false
    })

    expect(presentation.theme).toBe('light')
    expect(presentation.focusMode).toBe(false)
    expect(presentation.typewriterMode).toBe(true)
    expect(presentation.fontFamily).toBe(defaultEditorPresentation.fontFamily)
    expect(presentation.fontSize).toBe(defaultEditorPresentation.fontSize)
    expect(presentation.lineHeight).toBe(defaultEditorPresentation.lineHeight)
    expect(presentation.pageWidth).toBe(defaultEditorPresentation.pageWidth)
    expect(presentation.codeFontFamily).toBe(defaultEditorPresentation.codeFontFamily)
    expect(presentation.codeFontSize).toBe(defaultEditorPresentation.codeFontSize)
    expect(presentation.hideQuickInsertHint).toBe(false)
    expect(presentation.autoPairBracket).toBe(false)
    expect(presentation.autoPairMarkdownSyntax).toBe(true)
    expect(presentation.autoPairQuote).toBe(false)
  })
})
