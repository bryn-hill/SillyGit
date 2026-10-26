// Quick actions: commit messages and pull request text built from simple
// rules over the diff, for chores (version bumps, dependency updates, lockfile
// refreshes, docs tweaks) that are not worth an AI call.

export interface QuickMessage {
  id: string
  /** Short menu label, e.g. "Version bump to 0.2.0". */
  label: string
  message: string
}

interface FileDiff {
  path: string
  added: string[]
  removed: string[]
}

/** Splits a unified diff into per-file added and removed lines. */
export function parseDiffFiles(diff: string): FileDiff[] {
  const files: FileDiff[] = []
  let current: FileDiff | null = null
  for (const line of diff.split('\n')) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
    if (header) {
      current = { path: header[2], added: [], removed: [] }
      files.push(current)
      continue
    }
    if (!current || line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) current.added.push(line.slice(1))
    else if (line.startsWith('-')) current.removed.push(line.slice(1))
  }
  return files
}

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'Gemfile.lock',
  'poetry.lock',
  'uv.lock',
  'composer.lock',
  'go.sum'
])

const MANIFESTS = new Set(['package.json', 'Cargo.toml', 'pyproject.toml'])

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function isLockfile(path: string): boolean {
  return LOCKFILES.has(baseName(path))
}

function isDoc(path: string): boolean {
  return /\.(md|mdx|rst|txt)$/i.test(path) || path.startsWith('docs/')
}

function isTest(path: string): boolean {
  return /(^|\/)(e2e|tests?|__tests__)\//.test(path) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(path)
}

function isCi(path: string): boolean {
  return path.startsWith('.github/workflows/') || path === '.gitlab-ci.yml' || path.startsWith('.circleci/')
}

/** `"name": "value"` (package.json) or `name = "value"` (toml) on one line. */
function keyValue(line: string): { key: string; value: string } | null {
  const json = /^\s*"([^"]+)"\s*:\s*"([^"]*)",?\s*$/.exec(line)
  if (json) return { key: json[1], value: json[2] }
  const toml = /^\s*([A-Za-z0-9_.-]+)\s*=\s*"([^"]*)"\s*$/.exec(line)
  if (toml) return { key: toml[1], value: toml[2] }
  return null
}

const VERSIONISH = /^[~^<>=v*]*\s*\d|^(workspace|npm|file|git|github|link):|^latest$/

function pairs(lines: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of lines) {
    const kv = keyValue(line)
    if (kv && !map.has(kv.key)) map.set(kv.key, kv.value)
  }
  return map
}

interface ManifestChanges {
  version: { from: string; to: string } | null
  bumped: { name: string; from: string; to: string }[]
  addedDeps: { name: string; version: string }[]
  removedDeps: string[]
  /** True when the manifest has edits other than the ones above. */
  other: boolean
}

function manifestChanges(file: FileDiff): ManifestChanges {
  const before = pairs(file.removed)
  const after = pairs(file.added)
  const result: ManifestChanges = { version: null, bumped: [], addedDeps: [], removedDeps: [], other: false }
  const explained = new Set<string>()

  for (const [key, to] of after) {
    const from = before.get(key)
    if (key === 'version' && from !== undefined) {
      result.version = { from, to }
    } else if (from !== undefined && VERSIONISH.test(to) && VERSIONISH.test(from)) {
      result.bumped.push({ name: key, from, to })
    } else if (from === undefined && VERSIONISH.test(to)) {
      result.addedDeps.push({ name: key, version: to })
    } else {
      continue
    }
    explained.add(key)
  }
  for (const [key, from] of before) {
    if (!after.has(key) && VERSIONISH.test(from)) {
      result.removedDeps.push(key)
      explained.add(key)
    }
  }

  // Anything left that isn't a key we explained (or a bare brace/comma) is some other edit.
  const unexplained = (line: string): boolean => {
    const kv = keyValue(line)
    if (kv) return !explained.has(kv.key)
    return line.trim().replace(/[{},[\]]/g, '') !== ''
  }
  result.other = file.added.some(unexplained) || file.removed.some(unexplained)
  return result
}

function listNames(paths: string[]): string {
  return paths.length === 1 ? baseName(paths[0]) : `${paths.length} files`
}

/** Suggests commit messages for the staged diff, best match first. */
export function suggestCommitMessages(diff: string): QuickMessage[] {
  const files = parseDiffFiles(diff)
  if (files.length === 0) return []
  const out: QuickMessage[] = []

  const manifests = files.filter((f) => MANIFESTS.has(baseName(f.path)))
  const rest = files.filter((f) => !MANIFESTS.has(baseName(f.path)) && !isLockfile(f.path))
  const changes = manifests.map(manifestChanges)

  // Manifest + lockfile changes only: a version bump and/or dependency updates.
  if (manifests.length > 0 && rest.length === 0 && changes.every((c) => !c.other)) {
    const version = changes.find((c) => c.version)?.version
    const bumped = changes.flatMap((c) => c.bumped)
    const added = changes.flatMap((c) => c.addedDeps)
    const removed = changes.flatMap((c) => c.removedDeps)
    const depCount = bumped.length + added.length + removed.length

    if (version && depCount === 0) {
      out.push(
        { id: 'version', label: `Version bump to ${version.to}`, message: `chore: bump version to ${version.to}` },
        { id: 'release', label: `Release v${version.to}`, message: `chore(release): v${version.to}` }
      )
    }
    if (depCount > 0) {
      const detail = [
        ...bumped.map((d) => `- ${d.name}: ${d.from} → ${d.to}`),
        ...added.map((d) => `- add ${d.name} ${d.version}`),
        ...removed.map((d) => `- remove ${d}`)
      ]
      let subject: string
      if (depCount === 1 && bumped.length === 1) {
        const d = bumped[0]
        subject = `chore(deps): bump ${d.name} from ${d.from} to ${d.to}`
      } else if (depCount === 1 && added.length === 1) {
        subject = `chore(deps): add ${added[0].name}`
      } else if (depCount === 1) {
        subject = `chore(deps): remove ${removed[0]}`
      } else {
        subject = `chore(deps): update ${depCount} dependencies`
      }
      if (version) subject += ` and bump version to ${version.to}`
      const body = depCount > 1 ? `\n\n${detail.join('\n')}` : ''
      out.push({ id: 'deps', label: depCount === 1 ? 'Dependency update' : `Update ${depCount} dependencies`, message: subject + body })
    }
  }

  const paths = files.map((f) => f.path)
  if (out.length === 0 && paths.every(isLockfile)) {
    out.push({ id: 'lockfile', label: 'Lockfile refresh', message: `chore(deps): update ${listNames(paths)}` })
  }
  if (paths.every(isDoc)) {
    out.push({ id: 'docs', label: 'Docs update', message: `docs: update ${listNames(paths)}` })
  } else if (paths.every(isTest)) {
    out.push({ id: 'tests', label: 'Test update', message: `test: update ${listNames(paths)}` })
  } else if (paths.every(isCi)) {
    out.push({ id: 'ci', label: 'CI update', message: `ci: update ${listNames(paths)}` })
  } else if (paths.every((p) => baseName(p) === '.gitignore')) {
    out.push({ id: 'gitignore', label: '.gitignore update', message: 'chore: update .gitignore' })
  }
  return out
}

export type BumpKind = 'patch' | 'minor' | 'major'

export interface VersionBump {
  /** Files the bump rewrote, to stage. */
  files: string[]
  version: string
  message: string
}

/** Bumps a semver version; returns null when `version` isn't x.y.z. */
export function bumpVersion(version: string, kind: BumpKind): string | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim())
  if (!m) return null
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (kind === 'major') return `${major + 1}.0.0`
  if (kind === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

/** Conventional-commit prefixes offered as templates. */
export const COMMIT_PREFIXES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'ci'] as const

/** Puts `prefix: ` in front of the message, replacing any existing conventional prefix. */
export function applyPrefix(message: string, prefix: string): string {
  const stripped = message.replace(/^[a-z]+(\([^)]*\))?!?:\s*/, '')
  return `${prefix}: ${stripped}`
}

export interface PullRequestCommit {
  hash: string
  subject: string
  body: string
}

/** "claude/fix-safari_export" -> "Fix safari export". */
export function humanizeBranch(branch: string): string {
  const leaf = branch.replace(/^(?:[^/]+\/)*/, '')
  const words = leaf.replace(/[-_]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : branch
}

/** Title and body for a pull request of `commits` (newest first, as git log lists them). */
export function buildPullRequestText(
  commits: PullRequestCommit[],
  headBranch: string
): { title: string; body: string } {
  if (commits.length === 1) {
    return { title: commits[0].subject, body: commits[0].body.trim() }
  }
  const oldestFirst = [...commits].reverse()
  const release = oldestFirst.map((c) => /bump version to (\S+)|\(release\):\s*v?(\S+)/.exec(c.subject)).filter(Boolean).pop()
  const allDeps = commits.length > 0 && commits.every((c) => /^chore\(deps\)/.test(c.subject))

  let title: string
  if (release) title = `chore(release): v${release[1] ?? release[2]}`
  else if (allDeps) title = `chore(deps): ${commits.length} dependency updates`
  else title = humanizeBranch(headBranch)

  const lines = oldestFirst.map((c) => `- ${c.subject} (${c.hash.slice(0, 7)})`)
  return { title, body: commits.length > 0 ? `## Commits\n\n${lines.join('\n')}` : '' }
}

/** Adds the title and body to a GitHub compare URL so the new-PR form opens filled in. */
export function withPullRequestText(compareUrl: string, text: { title: string; body: string }): string {
  const sep = compareUrl.includes('?') ? '&' : '?'
  let url = `${compareUrl}${sep}title=${encodeURIComponent(text.title)}`
  if (text.body) url += `&body=${encodeURIComponent(text.body)}`
  return url
}
