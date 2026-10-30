import type { JSX, ReactNode } from 'react'
import { openHelp } from './openHelp'
import { startTour } from './tourBus'
import { HelpContext } from './useHelp'
import { useTour } from './useTour'
import TourOverlay from './TourOverlay'

/**
 * Provides help to the app and shows the first-use walkthrough, which starts
 * by itself once a repo is open and hasn't been seen yet.
 */
export default function HelpProvider({ repoOpen, children }: { repoOpen: boolean; children: ReactNode }): JSX.Element {
  const tour = useTour(repoOpen)
  return (
    <HelpContext value={{ startTour, openHelp, tourActive: !!tour.step }}>
      {children}
      {tour.step && (
        <TourOverlay
          key={tour.step.id}
          step={tour.step}
          index={tour.index}
          count={tour.count}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
    </HelpContext>
  )
}
