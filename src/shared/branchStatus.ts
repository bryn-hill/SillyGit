import type { BranchInfo } from './types'

/** How the branch list marks branches nobody has touched in a while. */
export interface BranchListSettings {
  /** Tag branches whose last commit is older than `staleDays`. */
  staleEnabled: boolean
  staleDays: number
  /** Tag branches that would conflict with the default branch or the current one. */
  conflictWarnings: boolean
}

export const STALE_DAY_CHOICES = [7, 14, 30, 60, 90, 180, 365]

export const DEFAULT_BRANCH_LIST_SETTINGS: BranchListSettings = {
  staleEnabled: true,
  staleDays: 30,
  conflictWarnings: true
}

/** Fills in anything missing or malformed in stored settings with the defaults. */
export function normalizeBranchListSettings(stored: unknown): BranchListSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<BranchListSettings>
  const d = DEFAULT_BRANCH_LIST_SETTINGS
  const days = s.staleDays
  return {
    staleEnabled: typeof s.staleEnabled === 'boolean' ? s.staleEnabled : d.staleEnabled,
    staleDays: typeof days === 'number' && days >= 1 && days <= 3650 ? Math.round(days) : d.staleDays,
    conflictWarnings: typeof s.conflictWarnings === 'boolean' ? s.conflictWarnings : d.conflictWarnings
  }
}

/**
 * Reads git's `%(upstream:track,nobracket)`: "ahead 1, behind 2", "gone" (the
 * remote branch was deleted and pruned) or "" (in step, or no upstream).
 */
export function parseTrack(track: string): { ahead: number; behind: number; gone: boolean } {
  const t = track.trim()
  if (t === 'gone') return { ahead: 0, behind: 0, gone: true }
  const ahead = /ahead (\d+)/.exec(t)
  const behind = /behind (\d+)/.exec(t)
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0, gone: false }
}

const DAY = 24 * 60 * 60

/** A short age such as "5d", "3w", "4mo" or "2y". */
export function formatAge(seconds: number): string {
  const days = Math.max(0, Math.floor(seconds / DAY))
  if (days < 14) return `${days}d`
  if (days < 60) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

/** The age to show on a stale branch, or null when it's fresh or the tag is off. */
export function staleAge(branch: BranchInfo, nowMs: number, settings: BranchListSettings): string | null {
  if (!settings.staleEnabled || branch.lastCommitAt === undefined) return null
  const age = nowMs / 1000 - branch.lastCommitAt
  return age >= settings.staleDays * DAY ? formatAge(age) : null
}

/** Favourites that still exist, in the order they were starred. */
export function favouriteBranches(branches: BranchInfo[], favourites: string[]): BranchInfo[] {
  const byName = new Map(branches.map((b) => [b.name, b]))
  return favourites.flatMap((name) => byName.get(name) ?? [])
}

/** Stars or unstars a branch, keeping the starred order. */
export function toggleFavourite(favourites: string[], name: string): string[] {
  return favourites.includes(name) ? favourites.filter((n) => n !== name) : [...favourites, name]
}
