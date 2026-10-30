import { useSyncExternalStore } from 'react'
import { getHelpCentreState, subscribeHelpCentre, type HelpCentreState } from './helpCentreStore'

/** The help centre's open state and article, re-rendering when `openHelp()` or `closeHelp()` runs. */
export function useHelpCentre(): HelpCentreState {
  return useSyncExternalStore(subscribeHelpCentre, getHelpCentreState)
}
