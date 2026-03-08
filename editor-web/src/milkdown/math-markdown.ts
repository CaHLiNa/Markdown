export const INTERNAL_MATH_LANGUAGE = 'milkdown-math'

const openingMathFencePattern = /^\s{0,3}\$\$\s*$/
const codeFencePattern = /^(\s{0,3})(`{3,}|~{3,})(.*)$/

const startsCodeFence = (line: string) => {
  const match = codeFencePattern.exec(line)

  if (!match) {
    return null
  }

  return {
    marker: match[2],
    info: match[3].trim()
  }
}

const closesCodeFence = (line: string, marker: string) => {
  const match = codeFencePattern.exec(line)

  if (!match) {
    return false
  }

  return match[2][0] === marker[0] && match[2].length >= marker.length
}

export const convertExternalMathBlocksToInternal = (markdown: string) => {
  const lines = markdown.split('\n')
  const converted: string[] = []
  let activeFence: string | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (activeFence) {
      converted.push(line)

      if (closesCodeFence(line, activeFence)) {
        activeFence = null
      }

      continue
    }

    const codeFence = startsCodeFence(line)

    if (codeFence) {
      activeFence = codeFence.marker
      converted.push(line)
      continue
    }

    if (!openingMathFencePattern.test(line)) {
      converted.push(line)
      continue
    }

    let closingIndex = index + 1

    while (closingIndex < lines.length && !openingMathFencePattern.test(lines[closingIndex])) {
      closingIndex += 1
    }

    if (closingIndex >= lines.length) {
      converted.push(line)
      continue
    }

    converted.push(`\`\`\`${INTERNAL_MATH_LANGUAGE}`)

    for (let contentIndex = index + 1; contentIndex < closingIndex; contentIndex += 1) {
      converted.push(lines[contentIndex])
    }

    converted.push('```')
    index = closingIndex
  }

  return converted.join('\n')
}

export const convertInternalMathBlocksToExternal = (markdown: string) => {
  const lines = markdown.split('\n')
  const converted: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const codeFence = startsCodeFence(line)

    if (!codeFence || codeFence.info !== INTERNAL_MATH_LANGUAGE) {
      converted.push(line)
      continue
    }

    let closingIndex = index + 1

    while (closingIndex < lines.length && !closesCodeFence(lines[closingIndex], codeFence.marker)) {
      closingIndex += 1
    }

    if (closingIndex >= lines.length) {
      converted.push(line)
      continue
    }

    converted.push('$$')

    for (let contentIndex = index + 1; contentIndex < closingIndex; contentIndex += 1) {
      converted.push(lines[contentIndex])
    }

    converted.push('$$')
    index = closingIndex
  }

  return converted.join('\n')
}

export const isInternalMathLanguage = (language: unknown): language is string => {
  return typeof language === 'string' && language.trim().toLowerCase() === INTERNAL_MATH_LANGUAGE
}
