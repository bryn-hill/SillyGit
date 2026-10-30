import { useEffect, useState } from 'react'
import type { HelpSettings, TourStep } from '../../../shared/help/types'
import { completedHelpSettings, shouldAutoStartTour } from '../../../shared/help/tour'
import { onStartTour } from './tourBus'
import { TOUR_STEPS } from './tourSteps'

export interface Tour {
  /** The step showing, or null when the walkthrough isn't. */
  step: TourStep | null
  index: number
  count: number
  next: () => void
  back: () => void
  /** Closes the walkthrough and remembers it was seen, whether finished or skipped. */
  close: () => void
}

/**
 * The first-use walkthrough: starts by itself the first time a repo is open
 * (until this tour version is finished or skipped), and again whenever
 * startTour() is called.
 */
export function useTour(repoOpen: boolean, steps: TourStep[] = TOUR_STEPS): Tour {
  const [saved, setSaved] = useState<HelpSettings | null>(null)
  // The step picked by Next/Back or a restart; null leaves it to the auto start.
  const [picked, setPicked] = useState<number | null>(null)
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    let live = true
    window.api.getHelpSettings().then((settings) => live && setSaved(settings))
    return () => {
      live = false
    }
  }, [])
  useEffect(
    () =>
      onStartTour(() => {
        setClosed(false)
        setPicked(0)
      }),
    []
  )

  const autoStart = saved !== null && shouldAutoStartTour(saved, repoOpen)
  const index = closed ? null : (picked ?? (autoStart ? 0 : null))

  const close = (): void => {
    setClosed(true)
    setPicked(null)
    const next = completedHelpSettings()
    setSaved(next)
    window.api.setHelpSettings(next).then((res) => {
      if (!res.ok) console.warn('Could not save the walkthrough state:', res.error)
    })
  }
  return {
    step: index === null ? null : (steps[index] ?? null),
    index: index ?? 0,
    count: steps.length,
    next: () => {
      if (index === null) return
      if (index + 1 < steps.length) setPicked(index + 1)
      else close()
    },
    back: () => index !== null && setPicked(Math.max(0, index - 1)),
    close
  }
}
