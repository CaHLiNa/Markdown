const getEventElement = (target: EventTarget | null): Element | null => {
  if (target instanceof Element) {
    return target
  }

  return target instanceof Node ? target.parentElement : null
}

export const shouldActivateLinkOnCommandClick = (event: {
  button: number
  metaKey: boolean
  defaultPrevented: boolean
}, requireCommand = true) => {
  return !event.defaultPrevented && event.button === 0 && (requireCommand ? event.metaKey : true)
}

export const getCommandClickLinkHref = (target: EventTarget | null) => {
  const element = getEventElement(target)
  const linkNode = element?.closest<HTMLElement>("span[data-type='a'].vditor-ir__node")

  if (!linkNode) {
    return null
  }

  const href = linkNode.querySelector<HTMLElement>('.vditor-ir__marker--link')?.textContent?.trim()
  return href && href.length > 0 ? href : null
}

export const normalizeDocumentBaseURL = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return null
  }

  try {
    return new URL(trimmed, window.location.href).toString()
  } catch {
    return null
  }
}

export const resolveLinkURL = (href: string, documentBaseURL: string | null) => {
  try {
    return new URL(href, documentBaseURL ?? window.location.href).toString()
  } catch {
    return href
  }
}

const WORD_CHARACTER_AFTER_PATTERN = /^[\p{L}\p{N}]/u
const WORD_CHARACTER_BEFORE_PATTERN = /[\p{L}\p{N}]$/u

const getAdjacentSiblingText = (node: ChildNode | null, direction: 'previous' | 'next') => {
  let sibling = direction === 'previous' ? node?.previousSibling : node?.nextSibling

  while (sibling) {
    const text = sibling.textContent ?? ''

    if (text.length > 0) {
      return text
    }

    sibling = direction === 'previous' ? sibling.previousSibling : sibling.nextSibling
  }

  return ''
}

const ensureLeadingSpaceBeforeLink = (linkNode: HTMLElement) => {
  const previousText = getAdjacentSiblingText(linkNode, 'previous')

  if (
    previousText.length === 0 ||
    /\s$/u.test(previousText) ||
    !WORD_CHARACTER_BEFORE_PATTERN.test(previousText)
  ) {
    return false
  }

  const previousSibling = linkNode.previousSibling

  if (previousSibling?.nodeType === Node.TEXT_NODE) {
    previousSibling.textContent = `${previousSibling.textContent ?? ''} `
  } else {
    linkNode.before(document.createTextNode(' '))
  }

  return true
}

const ensureTrailingSpaceAfterLink = (linkNode: HTMLElement) => {
  const nextText = getAdjacentSiblingText(linkNode, 'next')

  if (
    nextText.length === 0 ||
    /^\s/u.test(nextText) ||
    !WORD_CHARACTER_AFTER_PATTERN.test(nextText)
  ) {
    return false
  }

  const nextSibling = linkNode.nextSibling

  if (nextSibling?.nodeType === Node.TEXT_NODE) {
    nextSibling.textContent = ` ${nextSibling.textContent ?? ''}`
  } else {
    linkNode.after(document.createTextNode(' '))
  }

  return true
}

export const normalizeTableLinkSpacing = (root: ParentNode | null) => {
  if (!root) {
    return false
  }

  let changed = false
  const linkNodes = root.querySelectorAll<HTMLElement>("td span[data-type='a'].vditor-ir__node, th span[data-type='a'].vditor-ir__node")

  for (const linkNode of linkNodes) {
    changed = ensureLeadingSpaceBeforeLink(linkNode) || changed
    changed = ensureTrailingSpaceAfterLink(linkNode) || changed
  }

  return changed
}
