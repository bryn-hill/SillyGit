import type { PullMode } from '../../../../shared/types'
import type { RunMode } from '../../../../shared/run'
import type { SelfUpdateStatus } from '../../../../shared/selfUpdate'

/** The Update button's tooltip. */
export function updateTitle(status: SelfUpdateStatus, updating: boolean): string {
  if (updating) return 'Updating SillyGit…'
  if (status.behind > 0) return `Update SillyGit: ${status.behind} new commit${status.behind === 1 ? '' : 's'} on main`
  return 'SillyGit is up to date. Click to check again.'
}

export const RUN_OPTIONS: { mode: RunMode; label: string; hint: string }[] = [
  {
    mode: 'isolated',
    label: 'Run in isolation',
    hint: 'Runs the selected commit in a separate checkout; your working tree is left alone'
  },
  {
    mode: 'checkout',
    label: 'Check out and run',
    hint: 'Checks out the selected commit here, then runs it'
  }
]

/** What the Run button's tooltip says it will do. */
export function runTitle(command: string | null, commit: string | null, mode: RunMode, running: boolean): string {
  const what = command ? `“${command}”` : 'a command (you’ll be asked which)'
  if (!commit) return running ? 'Stop the working tree’s run' : `Run ${what} in the working tree`
  const short = commit.slice(0, 7)
  if (mode === 'isolated') {
    return running ? 'Stop the isolated run' : `Run ${what} on ${short} in a separate checkout, leaving your working tree alone`
  }
  return running ? 'Stop the working tree’s run' : `Check out ${short} and run ${what}`
}

export const PULL_OPTIONS: { mode: PullMode; label: string }[] = [
  { mode: 'ff', label: 'Pull (fast-forward if possible)' },
  { mode: 'ff-only', label: 'Pull (fast-forward only)' },
  { mode: 'rebase', label: 'Pull (rebase)' }
]
