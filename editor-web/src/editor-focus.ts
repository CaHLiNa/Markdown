const BACKGROUND_FOCUS_TARGET_CLASSES = new Set(['editor-host', 'vditor', 'vditor-content'])

export const isBackgroundFocusTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return false
  }

  for (const className of BACKGROUND_FOCUS_TARGET_CLASSES) {
    if (target.classList.contains(className)) {
      return true
    }
  }

  return false
}
