import { useEffect, useSyncExternalStore } from 'react'
import type { JiraSite } from '../../../shared/jira'

/**
 * The signed-in Jira sites and their project keys, asked for once and shared
 * by everything that links issue keys. Empty without a Jira account.
 */
const NO_SITES: JiraSite[] = []
let sites: JiraSite[] = NO_SITES
let loading: Promise<void> | null = null
// Bumped by resetJiraSites, so an answer to an older request is dropped.
let generation = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function load(): void {
  const asked = generation
  loading ??= window.api.jiraSites().then((res) => {
    if (asked !== generation) return
    sites = res.ok && res.data.length > 0 ? res.data : NO_SITES
    for (const listener of listeners) listener()
  })
}

/** Asks for the sites again, e.g. after a Jira account is added or removed. */
export function resetJiraSites(): void {
  generation++
  loading = null
  load()
}

/** Jira sites to link issue keys to; loads them the first time. */
export function useJiraSites(): JiraSite[] {
  const current = useSyncExternalStore(subscribe, () => sites)
  useEffect(load, [])
  return current
}
