/**
 * Whether the help centre is open and which article it shows. A module-level
 * store, so `openHelp()` works from anywhere (menus, the palette, tour steps)
 * without threading callbacks through the app. Components read it with
 * `useHelpCentre()`.
 */

export interface HelpCentreState {
  open: boolean
  /** The article on show; null shows the home page (search and categories). */
  articleId: string | null
  /** Counts calls to openHelp, so each one starts the help centre afresh. */
  opened: number
}

let state: HelpCentreState = { open: false, articleId: null, opened: 0 }
const listeners = new Set<() => void>()

function set(next: HelpCentreState): void {
  state = next
  for (const listener of listeners) listener()
}

/** Opens the help centre, at an article when given one. */
export function openHelp(articleId?: string): void {
  set({ open: true, articleId: articleId ?? null, opened: state.opened + 1 })
}

export function closeHelp(): void {
  if (state.open) set({ ...state, open: false })
}

export function subscribeHelpCentre(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getHelpCentreState(): HelpCentreState {
  return state
}
