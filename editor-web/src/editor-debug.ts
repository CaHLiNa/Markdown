type EditorDebugSnapshot = {
  phase: string
  details?: string
  error?: string
  marks: string[]
}

declare global {
  interface Window {
    __editorDebugState?: EditorDebugSnapshot
  }
}

const MAX_MARKS = 24

const nextSnapshot = (
  patch: Partial<EditorDebugSnapshot> & Pick<EditorDebugSnapshot, 'phase'>
): EditorDebugSnapshot => {
  const previous = window.__editorDebugState
  const marks = [...(previous?.marks ?? []), patch.phase].slice(-MAX_MARKS)

  return {
    phase: patch.phase,
    details: patch.details ?? previous?.details,
    error: patch.error ?? previous?.error,
    marks
  }
}

export const setEditorDebugPhase = (
  phase: string,
  details?: string,
  error?: string
) => {
  window.__editorDebugState = nextSnapshot({
    phase,
    details,
    error
  })
}
