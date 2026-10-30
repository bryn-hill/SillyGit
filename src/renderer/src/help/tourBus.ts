/**
 * `startTour()` can be called from anywhere (palette commands, the Help menu);
 * the HelpProvider listens and shows the walkthrough.
 */

const listeners = new Set<() => void>()

/** Listens for requests to start the walkthrough; returns the unsubscribe. */
export function onStartTour(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Starts the first-use walkthrough from its first step. */
export function startTour(): void {
  for (const listener of listeners) listener()
}
