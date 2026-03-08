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
}) => {
  return !event.defaultPrevented && event.button === 0 && event.metaKey
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
