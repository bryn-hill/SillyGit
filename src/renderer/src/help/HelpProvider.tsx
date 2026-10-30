import type { JSX, ReactNode } from 'react'
import { openHelp } from './index'
import { startTour } from './tourBus'
import { HelpContext } from './useHelp'

/** Provides help to the app. */
export default function HelpProvider({ children }: { children: ReactNode }): JSX.Element {
  return <HelpContext value={{ startTour, openHelp, tourActive: false }}>{children}</HelpContext>
}
