import { createContext, useContext } from 'react'
import { openHelp } from './index'
import { startTour } from './tourBus'

export interface Help {
  /** Starts the walkthrough from its first step. */
  startTour: () => void
  /** Opens the help centre, at an article when one is given. */
  openHelp: (articleId?: string) => void
  /** The walkthrough is showing. */
  tourActive: boolean
}

export const HelpContext = createContext<Help>({ startTour, openHelp, tourActive: false })

/** The help entry points, plus whether the walkthrough is showing. */
export function useHelp(): Help {
  return useContext(HelpContext)
}
