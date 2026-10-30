// Pushing: where to, and making sense of git's refusals.

export interface PushOptions {
  /** The remote to push to; the branch's upstream, or `origin`, when left out. */
  remote?: string
  /** The branch to update on the remote; the upstream's branch, or the same name, when left out. */
  branch?: string
  /** Overwrite the remote branch with `--force-with-lease --force-if-includes`. */
  force?: boolean
}

export interface PushResult {
  /** Git refused because the remote branch has commits this one doesn't; a force push would replace them. */
  rejected: boolean
  remote: string
  branch: string
}

/**
 * Why git refused a push, from its error output: `diverged` when the remote
 * branch has moved on or the local one was rewritten (amend, rebase, fixup),
 * `stale` when a force push was stopped because the remote branch has
 * commits this one hasn't seen or built on (someone pushed since), or null
 * for anything else.
 */
export function pushRejection(message: string): 'diverged' | 'stale' | null {
  if (/\[rejected\][^\n]*\((stale info|remote ref updated since checkout)\)/.test(message)) return 'stale'
  if (/\[rejected\][^\n]*\((non-fast-forward|fetch first)\)/.test(message)) return 'diverged'
  return null
}

/** The remote and branch a push goes to by default: the upstream if there is one, else the same name on `origin`. */
export function defaultPushTarget(
  branch: string,
  upstream: string | null | undefined,
  remotes: string[]
): { remote: string; branch: string } | null {
  if (upstream) {
    // Remote names can contain slashes, so match the longest one that prefixes the upstream.
    const remote = [...remotes].sort((a, b) => b.length - a.length).find((r) => upstream.startsWith(`${r}/`))
    if (remote) return { remote, branch: upstream.slice(remote.length + 1) }
  }
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  return remote ? { remote, branch } : null
}

/** Asked when git refuses a push because the remote branch has commits this one doesn't. */
export function rejectedPushPrompt(remote: string, branch: string): string {
  return `${remote}/${branch} has commits your branch doesn’t, so git refused the push. That’s expected after an amend, rebase, fixup or absorb.

Force push with lease? It replaces ${remote}/${branch} with your branch, and stops if anyone pushed there since your branch last caught up with it. Choose Cancel to pull their commits in instead.`
}

/** Asked before a force push picked from a menu. */
export function forcePushPrompt(where: string): string {
  return `Force push to ${where}? Commits there that aren’t on your branch will be replaced. It stops if anyone pushed there since your branch last caught up with it.`
}
