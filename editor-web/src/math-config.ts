import katex, { type KatexOptions } from 'katex'

export const sharedKatexMacros: NonNullable<KatexOptions['macros']> = {}

export const sharedKatexOptions: KatexOptions = {
  macros: sharedKatexMacros,
  throwOnError: false,
  strict: 'ignore'
}

export const renderKatexToString = (expression: string, displayMode: boolean) => {
  return katex.renderToString(expression, {
    ...sharedKatexOptions,
    displayMode
  })
}
