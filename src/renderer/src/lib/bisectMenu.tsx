import { createContext, useContext } from 'react'
import { bisectFinished, type BisectState, type BisectVerdict } from '../../../shared/bisect'
import type { ContextMenuItem } from '../components/ContextMenu'

/** What the commit menus and the graph need from a bisect. */
export interface BisectControls {
  state: BisectState | null
  start: (hash: string, verdict: 'bad' | 'good') => void
  mark: (verdict: BisectVerdict, hash?: string) => void
}

export const BisectContext = createContext<BisectControls>({ state: null, start: () => {}, mark: () => {} })

/** The bisect in progress, if any, for the graph's markers. */
export function useBisectState(): BisectState | null {
  return useContext(BisectContext).state
}

/**
 * The bisect items of a commit's right-click menu: start a bisect from it,
 * or, while one is going, mark it. Returns a function, so menus built in
 * event handlers can call it.
 */
export function useBisectMenu(): (hash: string) => ContextMenuItem[] {
  const { state, start, mark } = useContext(BisectContext)
  return (hash) => {
    if (!state) {
      return [
        { id: 'bisect-start-bad', label: 'Start bisect: this commit is bad', onSelect: () => start(hash, 'bad') },
        { id: 'bisect-start-good', label: 'Start bisect: this commit is good', onSelect: () => start(hash, 'good') }
      ]
    }
    if (bisectFinished(state)) return []
    const { bad, good } = state.terms
    return [
      { id: 'bisect-mark-bad', label: `Bisect: mark this commit ${bad}`, onSelect: () => mark('bad', hash) },
      { id: 'bisect-mark-good', label: `Bisect: mark this commit ${good}`, onSelect: () => mark('good', hash) },
      { id: 'bisect-mark-skip', label: 'Bisect: skip this commit', onSelect: () => mark('skip', hash) }
    ]
  }
}
