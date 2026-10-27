export interface RefBadge {
  label: string
  kind: 'head' | 'local' | 'remote' | 'tag'
}

/**
 * Turns `git log --decorate` refs into badges. Branch names can contain "/",
 * so local and remote branches are told apart with the real branch list.
 */
export function parseRefs(refs: string[], localBranches: Set<string>, remoteBranches: Set<string>): RefBadge[] {
  const badges: RefBadge[] = []
  for (const raw of refs) {
    let label = raw.trim()
    let kind: RefBadge['kind'] = 'local'
    if (label.startsWith('HEAD -> ')) {
      label = label.slice('HEAD -> '.length)
      kind = 'head'
    } else if (label.startsWith('tag: ')) {
      label = label.slice('tag: '.length)
      kind = 'tag'
    } else if (localBranches.has(label)) {
      kind = 'local'
    } else if (remoteBranches.has(label) || label.includes('/')) {
      kind = 'remote'
    }
    // HEAD on its own (detached) and symbolic remote refs like origin/HEAD.
    if (label === 'HEAD' || label.endsWith('/HEAD')) continue
    badges.push({ label, kind })
  }
  return badges
}

/**
 * One pill in the Branch / Tag column. Like GitKraken, a local branch and the
 * remote branch it tracks share a pill when they point at the same commit.
 */
export interface RefPill {
  /** What the pill shows: the branch without its remote, or the tag. */
  name: string
  /** The ref that clicks, double-clicks and right-clicks on the pill act on. */
  primary: RefBadge
  /** The local branch (kind 'head' when it is checked out). */
  local: RefBadge | null
  remotes: RefBadge[]
}

/** "origin/feature/x" -> "feature/x". */
function withoutRemote(label: string): string {
  const slash = label.indexOf('/')
  return slash === -1 ? label : label.slice(slash + 1)
}

/**
 * Groups a row's refs into pills, most important first: the checked-out
 * branch, other local branches, remote-only branches, then tags.
 * `upstreams` maps a local branch to the remote branch it tracks.
 */
export function groupRefs(badges: RefBadge[], upstreams: Map<string, string> = new Map()): RefPill[] {
  const locals = badges.filter((b) => b.kind === 'head' || b.kind === 'local')
  const remotes = badges.filter((b) => b.kind === 'remote')
  const tags = badges.filter((b) => b.kind === 'tag')
  const claimed = new Set<string>()

  const localPills = locals.map((local): RefPill => {
    const upstream = upstreams.get(local.label)
    const mine = remotes.filter(
      (r) => !claimed.has(r.label) && (upstream ? r.label === upstream : withoutRemote(r.label) === local.label)
    )
    for (const r of mine) claimed.add(r.label)
    return { name: local.label, primary: local, local, remotes: mine }
  })
  localPills.sort((a, b) => Number(b.primary.kind === 'head') - Number(a.primary.kind === 'head'))

  // Remote-only branches with the same name on several remotes share a pill too.
  const remotePills = new Map<string, RefPill>()
  for (const r of remotes) {
    if (claimed.has(r.label)) continue
    const name = withoutRemote(r.label)
    const pill = remotePills.get(name)
    if (pill) pill.remotes.push(r)
    else remotePills.set(name, { name, primary: r, local: null, remotes: [r] })
  }

  const tagPills = tags.map((t): RefPill => ({ name: t.label, primary: t, local: null, remotes: [] }))
  return [...localPills, ...remotePills.values(), ...tagPills]
}
