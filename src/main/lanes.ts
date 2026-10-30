import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { promisify } from 'util'
import {
  WORKSPACE_BRANCH,
  laneFilePatch,
  laneFiles,
  laneNameProblem,
  ownerRecords,
  parseChanges,
  resolveOwners,
  type ChangeKind,
  type ChangeLine,
  type LaneInfo,
  type LaneMove,
  type LanesDrift,
  type LanesState,
  type LanesStatus,
  type ParsedChanges
} from '../shared/lanes'
import { getOperationState } from './conflicts'
import { GitError, remoteEnv, runGit } from './gitExec'

// Lanes (see shared/lanes.ts). Everything lives in git: each lane is a
// branch, HEAD sits on `sillygit/workspace` (a merge of the applied lanes
// that SillyGit makes), lanes' set-aside changes are commits under
// refs/sillygit/wip/, and before anything rewrites files the whole working
// tree is saved as a commit under refs/sillygit/backups/. The only other
// state is .git/sillygit/lanes.json: which lanes there are and who owns
// each changed line.
//
// Lane commits are built in a throwaway index from the lane's tip, so the
// real index and the files are never touched by a commit.

const WS_REF = `refs/heads/${WORKSPACE_BRANCH}`
const WIP_PREFIX = 'refs/sillygit/wip/'
const BACKUP_PREFIX = 'refs/sillygit/backups/'
const BACKUPS_KEPT = 20
/** Where the files are kept as they were just before an undo. */
const UNDONE_PREFIX = 'refs/sillygit/undone/'
/** Reflog message prefix; the undo button ignores what it doesn't know. */
const REFLOG = 'sillygit lanes'
const DIFF_ARGS = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=3', '--src-prefix=a/', '--dst-prefix=b/']

const execFileAsync = promisify(execFile)

// ---- Small git helpers ----

async function rev(repoPath: string, ref: string): Promise<string | null> {
  const out = await runGit(repoPath, ['rev-parse', '-q', '--verify', `${ref}^{commit}`]).catch(() => '')
  return out.trim() || null
}

async function requireBranch(repoPath: string, name: string): Promise<string> {
  const hash = await rev(repoPath, `refs/heads/${name}`)
  if (!hash) throw new GitError(`There is no local branch called ${name}.`)
  return hash
}

async function treeOf(repoPath: string, commit: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', `${commit}^{tree}`])).trim()
}

async function isAncestor(repoPath: string, ancestor: string, of: string): Promise<boolean> {
  return runGit(repoPath, ['merge-base', '--is-ancestor', ancestor, of])
    .then(() => true)
    .catch(() => false)
}

async function headRef(repoPath: string): Promise<string | null> {
  return (await runGit(repoPath, ['symbolic-ref', '-q', 'HEAD']).catch(() => '')).trim() || null
}

async function gitPath(repoPath: string, rel: string): Promise<string> {
  const out = (await runGit(repoPath, ['rev-parse', '--git-path', rel])).trim()
  return isAbsolute(out) ? out : join(repoPath, out)
}

async function commitTree(repoPath: string, tree: string, parents: string[], message: string, env?: Record<string, string>): Promise<string> {
  const args = ['commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', message]
  return (await runGit(repoPath, args, env)).trim()
}

async function updateRef(repoPath: string, ref: string, to: string, from: string | null, why: string): Promise<void> {
  const args = ['update-ref', '-m', `${REFLOG}: ${why}`, ref, to]
  if (from) args.push(from)
  await runGit(repoPath, args)
}

/** Runs `fn` with a throwaway index, started from `tree`, or from a copy of the real index when `copyIndex`. */
async function withTempIndex<T>(
  repoPath: string,
  tree: string,
  fn: (env: Record<string, string>) => Promise<T>,
  copyIndex = false
): Promise<T> {
  const file = join(tmpdir(), `sillygit-lanes-${randomUUID()}.index`)
  const env = { GIT_INDEX_FILE: file }
  try {
    if (copyIndex) {
      // Starting from the real index keeps its file stat cache, so `add -A`
      // only has to read files that changed. The copy keeps the index's mtime:
      // git compares it with each file's to spot files changed in the same
      // second the index was written (whose stat looks clean), and a fresh
      // mtime hides those, so an edit that kept the file's size was missed.
      const index = await gitPath(repoPath, 'index')
      await fsp
        .copyFile(index, file)
        .then(async () => {
          const { atime, mtime } = await fsp.stat(index)
          await fsp.utimes(file, atime, mtime)
        })
        .catch(() => {})
      await runGit(repoPath, ['read-tree', '-m', tree], env).catch(() => runGit(repoPath, ['read-tree', tree], env))
    } else {
      await runGit(repoPath, ['read-tree', tree], env)
    }
    return await fn(env)
  } finally {
    await fsp.unlink(file).catch(() => {})
  }
}

async function withPatchFile<T>(patch: string, fn: (file: string) => Promise<T>): Promise<T> {
  const file = join(tmpdir(), `sillygit-lanes-${randomUUID()}.patch`)
  await fsp.writeFile(file, patch, 'utf-8')
  try {
    return await fn(file)
  } finally {
    await fsp.unlink(file).catch(() => {})
  }
}

// ---- State ----

async function statePath(repoPath: string): Promise<string> {
  return gitPath(repoPath, 'sillygit/lanes.json')
}

async function readState(repoPath: string): Promise<LanesState | null> {
  try {
    const parsed = JSON.parse(await fsp.readFile(await statePath(repoPath), 'utf-8')) as LanesState
    return parsed.version === 1 ? parsed : null
  } catch {
    return null
  }
}

async function writeState(repoPath: string, state: LanesState | null): Promise<void> {
  const file = await statePath(repoPath)
  if (state === null) {
    await fsp.rm(file, { force: true })
    return
  }
  await fsp.mkdir(join(file, '..'), { recursive: true })
  // Write then rename, so a crash never leaves half a file.
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(state, null, 1), 'utf-8')
  await fsp.rename(tmp, file)
}

async function requireState(repoPath: string): Promise<LanesState> {
  const state = await readState(repoPath)
  if (!state) throw new GitError('Lanes aren’t on in this repository.')
  return state
}

function applied(state: LanesState): string[] {
  return state.lanes.filter((l) => l.applied).map((l) => l.name)
}

// One lanes operation at a time per repo: each reads the state, works, and writes it back.
const queues = new Map<string, Promise<unknown>>()
function serial<T>(repoPath: string, run: () => Promise<T>): Promise<T> {
  const result = (queues.get(repoPath) ?? Promise.resolve()).then(run)
  const done = result.catch(() => {})
  queues.set(repoPath, done)
  void done.then(() => {
    if (queues.get(repoPath) === done) queues.delete(repoPath)
  })
  return result
}

// ---- The workspace commit ----

/** Merges the applied lanes into a new workspace commit, without touching any file. */
async function buildWorkspace(repoPath: string, state: LanesState): Promise<string> {
  const names = applied(state)
  const tips: { name: string; tip: string }[] = []
  for (const name of names) {
    const tip = await requireBranch(repoPath, name)
    if (!tips.some((t) => t.tip === tip)) tips.push({ name, tip })
  }
  let tree: string
  let parents: string[]
  if (tips.length === 0) {
    const base = await requireBranch(repoPath, state.base)
    tree = await treeOf(repoPath, base)
    parents = [base]
  } else {
    let acc = tips[0].tip
    tree = await treeOf(repoPath, acc)
    for (const next of tips.slice(1)) {
      let out: string
      try {
        out = await runGit(repoPath, ['merge-tree', '--write-tree', '--name-only', '--no-messages', acc, next.tip])
      } catch (err) {
        const stdout = err instanceof GitError ? err.stdout : ''
        const files = stdout.split('\n').slice(1).filter(Boolean)
        if (files.length === 0) throw err
        const others = tips.slice(0, tips.indexOf(next)).map((t) => t.name).join(', ')
        throw new GitError(`${next.name} conflicts with ${others} in ${[...new Set(files)].join(', ')}. Lanes that change the same lines can’t be applied together.`)
      }
      tree = out.split('\n')[0].trim()
      acc = await commitTree(repoPath, tree, [acc, next.tip], 'SillyGit: lanes merge step')
    }
    parents = tips.map((t) => t.tip)
  }
  const message = [
    `SillyGit workspace (${names.length === 0 ? 'no lanes applied' : names.join(', ')})`,
    '',
    'SillyGit made this commit to hold the applied lanes together while lanes are on.',
    'Commit to a lane in SillyGit rather than on top of it.'
  ].join('\n')
  return commitTree(repoPath, tree, parents, message)
}

/** Points the workspace branch (and so HEAD) at `next` and resets the index to it, leaving files alone. */
async function moveWorkspace(repoPath: string, state: LanesState, next: string, why: string): Promise<void> {
  await updateRef(repoPath, WS_REF, next, null, why)
  await runGit(repoPath, ['read-tree', '-m', next]).catch(() => runGit(repoPath, ['read-tree', next]))
  state.workspace = next
}

/**
 * Rebuilds the workspace commit from the lanes' tips and brings the files
 * along: whatever the merge gained or lost is applied to the working tree,
 * on top of the uncommitted changes. Throws without changing anything when
 * the lanes conflict or the change can't be applied.
 */
async function syncWorkspace(repoPath: string, state: LanesState, why: string): Promise<void> {
  const before = state.workspace
  const next = await buildWorkspace(repoPath, state)
  if ((await treeOf(repoPath, before)) !== (await treeOf(repoPath, next))) {
    const patch = await runGit(repoPath, [...DIFF_ARGS, '--binary', '--full-index', before, next])
    if (patch.trim()) {
      await withPatchFile(patch, (file) =>
        runGit(repoPath, ['apply', '--whitespace=nowarn', file]).catch((err) => {
          throw new GitError(
            `Your uncommitted changes are in the way: ${err instanceof Error ? err.message : String(err)}`
          )
        })
      )
    }
  }
  await moveWorkspace(repoPath, state, next, why)
}

// ---- Reading the uncommitted changes ----

interface Snapshot {
  /** The commit the changes are measured from: HEAD (normally the workspace commit). */
  head: string
  /** Every file in the working tree, as a tree (ignored files left out). */
  tree: string
  parsed: ParsedChanges
  owners: string[]
  untracked: Set<string>
}

async function snapshot(repoPath: string, state: LanesState, unmatchedLane?: string): Promise<Snapshot> {
  const head = (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
  const tree = await withTempIndex(
    repoPath,
    head,
    async (env) => {
      await runGit(repoPath, ['add', '-A'], env)
      return (await runGit(repoPath, ['write-tree'], env)).trim()
    },
    true
  )
  const diff = tree === (await treeOf(repoPath, head)) ? '' : await runGit(repoPath, [...DIFF_ARGS, head, tree])
  const parsed = parseChanges(diff)
  const lanes = new Set(applied(state))
  const fallback = lanes.has(state.defaultLane) ? state.defaultLane : ([...lanes][0] ?? state.defaultLane)
  const owners = resolveOwners(parsed.lines, state.owners, {
    lanes,
    fallback,
    unmatchedLane,
    fileLanes: parsed.lines.length > 0 ? await fileLanes(repoPath, state) : undefined
  })
  const others = await runGit(repoPath, ['ls-files', '--others', '--exclude-standard', '-z'])
  return { head, tree, parsed, owners, untracked: new Set(others.split('\0').filter(Boolean)) }
}

/** Files exactly one applied lane's commits changed (since it left the base), and that lane. */
async function fileLanes(repoPath: string, state: LanesState): Promise<Map<string, string>> {
  const touched = new Map<string, string | null>()
  for (const name of applied(state)) {
    const out = await runGit(repoPath, ['diff', '--name-only', '--no-renames', '-z', `refs/heads/${state.base}...refs/heads/${name}`]).catch(() => '')
    for (const path of out.split('\0').filter(Boolean)) touched.set(path, touched.has(path) ? null : name)
  }
  const out = new Map<string, string>()
  for (const [path, lane] of touched) if (lane) out.set(path, lane)
  return out
}

/** Remembers who owns each line now; true when that changed. */
function rememberOwners(state: LanesState, snap: Snapshot): boolean {
  const next = ownerRecords(snap.parsed.lines, snap.owners)
  if (JSON.stringify(next) === JSON.stringify(state.owners)) return false
  state.owners = next
  return true
}

/** The lines `lane` owns, by file index, then hunk, as body line indexes. */
function lanePicks(snap: Snapshot, lane: string): Map<number, { whole: boolean; hunks: Map<number, Set<number>> }> {
  const out = new Map<number, { whole: boolean; hunks: Map<number, Set<number>> }>()
  snap.parsed.lines.forEach((l, i) => {
    if (snap.owners[i] !== lane) return
    let entry = out.get(l.file)
    if (!entry) {
      entry = { whole: false, hunks: new Map() }
      out.set(l.file, entry)
    }
    if (l.kind === 'file') {
      entry.whole = true
      return
    }
    let set = entry.hunks.get(l.hunk)
    if (!set) {
      set = new Set()
      entry.hunks.set(l.hunk, set)
    }
    set.add(l.index)
  })
  return out
}

/** The tree of `tip` plus `lane`'s uncommitted changes, built in a throwaway index. */
async function laneTree(repoPath: string, snap: Snapshot, lane: string, tip: string): Promise<string> {
  const picks = lanePicks(snap, lane)
  return withTempIndex(repoPath, tip, async (env) => {
    for (const [fi, pick] of picks) {
      const file = snap.parsed.files[fi]
      if (pick.whole) {
        if (file.status === 'D') {
          await runGit(repoPath, ['update-index', '--force-remove', '--', file.path], env)
        } else {
          const entry = (await runGit(repoPath, ['ls-tree', '-z', snap.tree, '--', file.path])).split('\0')[0]
          const m = /^(\d+) \w+ ([0-9a-f]+)\t/.exec(entry)
          if (!m) throw new GitError(`Couldn’t read ${file.path} from the working tree.`)
          await runGit(repoPath, ['update-index', '--add', '--cacheinfo', `${m[1]},${m[2]},${file.path}`], env)
        }
        continue
      }
      const patch = laneFilePatch(file, pick.hunks, false)
      if (!patch) continue
      await withPatchFile(patch, async (patchFile) => {
        const args = ['apply', '--cached', '--recount', '--whitespace=nowarn']
        try {
          await runGit(repoPath, [...args, patchFile], env)
        } catch {
          // The lines around the change may come from another lane the
          // lane doesn't have; one line of matching context is enough.
          await runGit(repoPath, [...args, '-C1', patchFile], env).catch(() => {
            throw new GitError(
              `${lane}’s changes to ${file.path} sit on lines another lane changed, so they can’t be committed to ${lane} on their own. ` +
                `Move them to that lane, or commit that lane first and stack ${lane} on it.`
            )
          })
        }
      })
    }
    return (await runGit(repoPath, ['write-tree'], env)).trim()
  })
}

/** Takes `lane`'s uncommitted changes out of the working tree. */
async function removeLaneChanges(repoPath: string, snap: Snapshot, lane: string): Promise<void> {
  const picks = lanePicks(snap, lane)
  for (const [fi, pick] of picks) {
    const file = snap.parsed.files[fi]
    if (pick.whole) {
      if (file.status === 'A') await fsp.rm(join(repoPath, file.path), { force: true })
      else await runGit(repoPath, ['checkout', snap.head, '--', file.path])
      continue
    }
    const patch = laneFilePatch(file, pick.hunks, true)
    if (!patch) continue
    await withPatchFile(patch, (patchFile) => runGit(repoPath, ['apply', '-R', '--recount', '--whitespace=nowarn', patchFile]))
  }
}

/** Saves `lane`'s uncommitted changes as a commit on top of it, under refs/sillygit/wip/. */
async function saveLaneChanges(repoPath: string, snap: Snapshot, lane: string): Promise<boolean> {
  if (!snap.owners.includes(lane)) return false
  const tip = await requireBranch(repoPath, lane)
  const tree = await laneTree(repoPath, snap, lane, tip)
  if (tree === (await treeOf(repoPath, tip))) return false
  const commit = await commitTree(repoPath, tree, [tip], `SillyGit: uncommitted changes of ${lane}`)
  await updateRef(repoPath, WIP_PREFIX + lane, commit, null, `set aside ${lane}`)
  return true
}

/** Puts a lane's set-aside changes back into the working tree. True when there were any. */
async function restoreLaneChanges(repoPath: string, lane: string): Promise<boolean> {
  const wip = await rev(repoPath, WIP_PREFIX + lane)
  if (!wip) return false
  const patch = await runGit(repoPath, [...DIFF_ARGS, '--binary', '--full-index', `${wip}^`, wip])
  if (patch.trim()) {
    await withPatchFile(patch, (file) =>
      runGit(repoPath, ['apply', '--whitespace=nowarn', file]).catch((err) => {
        throw new GitError(
          `Couldn’t put ${lane}’s saved changes back (${err instanceof Error ? err.message : String(err)}). They’re kept in ${WIP_PREFIX}${lane}.`
        )
      })
    )
  }
  await runGit(repoPath, ['update-ref', '-d', WIP_PREFIX + lane])
  return true
}

// ---- Backups, for undo ----

interface BackupNote {
  label: string
  state: LanesState
  tips: Record<string, string>
  /** Every lane's set-aside changes (refs/sillygit/wip/), by lane. */
  wips: Record<string, string>
}

async function wipRefs(repoPath: string): Promise<Record<string, string>> {
  const out = await runGit(repoPath, ['for-each-ref', '--format=%(refname)%09%(objectname)', WIP_PREFIX])
  const wips: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const [ref, hash] = line.split('\t')
    if (ref && hash) wips[ref.slice(WIP_PREFIX.length)] = hash
  }
  return wips
}

/** The whole working tree (ignored files aside) as a tree, measured from HEAD. */
async function workingTree(repoPath: string): Promise<string> {
  return withTempIndex(
    repoPath,
    'HEAD',
    async (env) => {
      await runGit(repoPath, ['add', '-A'], env)
      return (await runGit(repoPath, ['write-tree'], env)).trim()
    },
    true
  )
}

async function backup(repoPath: string, state: LanesState, snap: Snapshot, label: string): Promise<void> {
  const tips: Record<string, string> = {}
  for (const l of state.lanes) {
    const tip = await rev(repoPath, `refs/heads/${l.name}`)
    if (tip) tips[l.name] = tip
  }
  const note: BackupNote = { label, state, tips, wips: await wipRefs(repoPath) }
  const commit = await commitTree(repoPath, snap.tree, [snap.head], JSON.stringify(note))
  await updateRef(repoPath, `${BACKUP_PREFIX}${Date.now()}`, commit, null, 'backup')
  const refs = await listBackups(repoPath)
  for (const old of refs.slice(BACKUPS_KEPT)) await runGit(repoPath, ['update-ref', '-d', old])
}

/** Backup refs, newest first. */
async function listBackups(repoPath: string): Promise<string[]> {
  const out = await runGit(repoPath, ['for-each-ref', '--format=%(refname)', BACKUP_PREFIX])
  return out
    .split('\n')
    .filter(Boolean)
    .sort((a, b) => Number(b.slice(BACKUP_PREFIX.length)) - Number(a.slice(BACKUP_PREFIX.length)))
}

async function readBackup(repoPath: string, ref: string): Promise<BackupNote | null> {
  try {
    return JSON.parse(await runGit(repoPath, ['log', '-1', '--format=%B', ref])) as BackupNote
  } catch {
    return null
  }
}

/** Puts the lanes, the workspace and every file back the way a backup saved them. */
async function restoreBackup(repoPath: string, ref: string): Promise<LanesState> {
  const note = await readBackup(repoPath, ref)
  if (!note) throw new GitError('That lanes backup can’t be read.')
  for (const [name, tip] of Object.entries(note.tips)) {
    await updateRef(repoPath, `refs/heads/${name}`, tip, null, 'undo')
  }
  const current = await wipRefs(repoPath)
  for (const name of Object.keys(current)) {
    if (!(name in note.wips)) await runGit(repoPath, ['update-ref', '-d', WIP_PREFIX + name])
  }
  for (const [name, hash] of Object.entries(note.wips)) await updateRef(repoPath, WIP_PREFIX + name, hash, null, 'undo')
  // Every file as it is now is kept first, out of the undo list, so nothing
  // the restore removes or overwrites is lost for good.
  const now = await workingTree(repoPath)
  const head = (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
  await updateRef(repoPath, `${UNDONE_PREFIX}${Date.now()}`, await commitTree(repoPath, now, [head], 'SillyGit: before undo'), null, 'before undo')
  const undone = (await runGit(repoPath, ['for-each-ref', '--sort=-refname', '--format=%(refname)', UNDONE_PREFIX])).split('\n').filter(Boolean)
  for (const old of undone.slice(BACKUPS_KEPT)) await runGit(repoPath, ['update-ref', '-d', old])
  const state = note.state
  await updateRef(repoPath, WS_REF, state.workspace, null, 'undo')
  if ((await headRef(repoPath)) !== WS_REF) {
    await runGit(repoPath, ['symbolic-ref', '-m', `${REFLOG}: undo`, 'HEAD', WS_REF])
  }
  // With the index holding every file there is now, untracked ones too, the
  // reset rewrites what the backup has and removes what it doesn't.
  await runGit(repoPath, ['read-tree', now])
  await runGit(repoPath, ['read-tree', '--reset', '-u', `${ref}^{tree}`])
  await runGit(repoPath, ['read-tree', '-m', state.workspace])
  await writeState(repoPath, state)
  return state
}

/** Restores the newest backup if a step fails after files started changing, then rethrows. */
async function orRollBack<T>(repoPath: string, step: () => Promise<T>): Promise<T> {
  try {
    return await step()
  } catch (err) {
    const [newest] = await listBackups(repoPath)
    if (newest) {
      await restoreBackup(repoPath, newest).catch(() => {})
      await runGit(repoPath, ['update-ref', '-d', newest]).catch(() => {})
    }
    throw err
  }
}

// ---- Guards ----

async function drift(repoPath: string, state: LanesState): Promise<LanesDrift | null> {
  const head = await headRef(repoPath)
  if (head !== WS_REF) {
    return { kind: 'switched', branch: head?.startsWith('refs/heads/') ? head.slice('refs/heads/'.length) : null }
  }
  const tip = await rev(repoPath, WS_REF)
  if (tip && tip !== state.workspace) {
    const count = Number((await runGit(repoPath, ['rev-list', '--count', `${state.workspace}..${tip}`]).catch(() => '0')).trim())
    return { kind: 'commits', count }
  }
  const moved: string[] = []
  for (const name of applied(state)) {
    const laneTip = await rev(repoPath, `refs/heads/${name}`)
    if (!laneTip || !(await isAncestor(repoPath, laneTip, state.workspace))) moved.push(name)
  }
  return moved.length > 0 ? { kind: 'lanes-moved', lanes: moved } : null
}

async function ready(repoPath: string): Promise<LanesState> {
  const state = await requireState(repoPath)
  if (await getOperationState(repoPath)) throw new GitError('Finish or abort the operation in progress first.')
  const d = await drift(repoPath, state)
  if (d) throw new GitError('The workspace changed outside SillyGit. Sort that out from the banner above the lanes first.')
  return state
}

function requireLane(state: LanesState, name: string): void {
  if (!state.lanes.some((l) => l.name === name)) throw new GitError(`${name} isn’t a lane.`)
}

// ---- What the renderer sees ----

async function laneInfo(repoPath: string, state: LanesState): Promise<LaneInfo[]> {
  const upstreams = new Map<string, string>()
  const out = await runGit(repoPath, ['for-each-ref', '--format=%(refname:short)%09%(upstream:short)', 'refs/heads'])
  for (const line of out.split('\n')) {
    const [name, upstream] = line.split('\t')
    if (name && upstream) upstreams.set(name, upstream)
  }
  const count = async (range: string): Promise<number> =>
    Number((await runGit(repoPath, ['rev-list', '--count', range]).catch(() => '0')).trim()) || 0
  return Promise.all(
    state.lanes.map(async (l, i) => {
      const upstream = upstreams.get(l.name) ?? null
      const ahead = await count(`refs/heads/${state.base}..refs/heads/${l.name}`)
      return {
        name: l.name,
        applied: l.applied,
        isDefault: l.name === state.defaultLane,
        color: i,
        ahead,
        upstream,
        unpushed: upstream ? await count(`${upstream}..refs/heads/${l.name}`) : ahead,
        hasSavedChanges: !!(await rev(repoPath, WIP_PREFIX + l.name))
      }
    })
  )
}

// The lanesStatus ask per repo that hasn't started, and the queue's tail just after it.
const waitingStatus = new Map<string, { result: Promise<LanesStatus | null>; tail: Promise<unknown> | undefined }>()

/** The lanes, who owns each uncommitted change, and anything that moved outside SillyGit. Null when lanes are off. */
export function lanesStatus(repoPath: string): Promise<LanesStatus | null> {
  // Every repo refresh asks again, and on a busy machine the asks queued up
  // behind each other faster than they were answered, so the lanes showed
  // ever older state. An ask that hasn't started yet and is last in the
  // queue will read the state after everything before this one, so share it.
  const waiting = waitingStatus.get(repoPath)
  if (waiting && queues.get(repoPath) === waiting.tail) return waiting.result
  const result = serial(repoPath, () => {
    if (waitingStatus.get(repoPath)?.result === result) waitingStatus.delete(repoPath)
    return readLanesStatus(repoPath)
  })
  waitingStatus.set(repoPath, { result, tail: queues.get(repoPath) })
  return result
}

async function readLanesStatus(repoPath: string): Promise<LanesStatus | null> {
  const state = await readState(repoPath)
  if (!state) return null
  const d = await drift(repoPath, state)
  const lanes = await laneInfo(repoPath, state)
  const [newest] = await listBackups(repoPath)
  const undoLabel = newest ? ((await readBackup(repoPath, newest))?.label ?? null) : null
  if (d?.kind === 'switched') return { base: state.base, lanes, files: [], lines: [], drift: d, undoLabel }
  const snap = await snapshot(repoPath, state)
  if (!d && rememberOwners(state, snap)) await writeState(repoPath, state)
  const lines = snap.parsed.lines.flatMap((l, i) =>
    l.kind === 'file' ? [] : [{ path: l.path, kind: l.kind, line: l.line, lane: snap.owners[i] }]
  )
  return { base: state.base, lanes, files: laneFiles(snap.parsed, snap.owners, snap.untracked), lines, drift: d, undoLabel }
}

// ---- Turning lanes on and off ----

/** The git version, as [major, minor]. */
async function gitVersion(repoPath: string): Promise<[number, number]> {
  const m = /(\d+)\.(\d+)/.exec(await runGit(repoPath, ['version']))
  return m ? [Number(m[1]), Number(m[2])] : [0, 0]
}

/**
 * Turns lanes on: `lane` becomes the first lane (the checked-out branch, or
 * a new branch made where you are), new lanes start from `base`, and HEAD
 * moves to the workspace branch. Files aren't touched; staged changes
 * become plain uncommitted ones, all in the first lane.
 */
export function enterLanes(repoPath: string, base: string, lane: string): Promise<void> {
  return serial(repoPath, async () => {
    if (await readState(repoPath)) throw new GitError('Lanes are already on.')
    const [major, minor] = await gitVersion(repoPath)
    if (major < 2 || (major === 2 && minor < 38)) throw new GitError('Lanes need git 2.38 or later.')
    if (await getOperationState(repoPath)) throw new GitError('Finish or abort the operation in progress first.')
    const head = await headRef(repoPath)
    if (!head?.startsWith('refs/heads/')) throw new GitError('Check out a branch before turning lanes on.')
    const current = head.slice('refs/heads/'.length)
    if (current === WORKSPACE_BRANCH) throw new GitError('You’re on SillyGit’s workspace branch already.')
    await requireBranch(repoPath, base)
    const problem = laneNameProblem(lane)
    if (problem) throw new GitError(problem)
    if (lane !== current) {
      if (await rev(repoPath, `refs/heads/${lane}`)) {
        throw new GitError(`A branch called ${lane} already exists. Pick a new name, or check it out first to start lanes from it.`)
      }
      await runGit(repoPath, ['branch', lane, 'HEAD'])
    }
    const state: LanesState = { version: 1, base, lanes: [{ name: lane, applied: true }], defaultLane: lane, owners: [], workspace: '' }
    const ws = await buildWorkspace(repoPath, state)
    await updateRef(repoPath, WS_REF, ws, null, 'start')
    await runGit(repoPath, ['symbolic-ref', '-m', `${REFLOG}: start`, 'HEAD', WS_REF])
    await moveWorkspace(repoPath, state, ws, 'start')
    await writeState(repoPath, state)
  })
}

/**
 * Turns lanes off, checking out `keep` with its uncommitted changes. Every
 * other lane's uncommitted changes are set aside under refs/sillygit/wip/
 * and come back when it's applied as a lane again.
 */
export function leaveLanes(repoPath: string, keep: string): Promise<void> {
  return serial(repoPath, async () => {
    const state = await ready(repoPath)
    requireLane(state, keep)
    const snap = await snapshot(repoPath, state)
    await backup(repoPath, state, snap, 'Undo leaving lanes')
    await orRollBack(repoPath, async () => {
      for (const name of applied(state)) {
        if (name !== keep) await saveLaneChanges(repoPath, snap, name)
      }
      const tip = await requireBranch(repoPath, keep)
      const keepApplied = applied(state).includes(keep)
      const target = keepApplied ? await laneTree(repoPath, snap, keep, tip) : await treeOf(repoPath, tip)
      // Other lanes' new files aren't in the index, so the reset below wouldn't remove them.
      for (let i = 0; i < snap.parsed.lines.length; i++) {
        const l = snap.parsed.lines[i]
        if (l.kind === 'file' && snap.owners[i] !== keep && snap.parsed.files[l.file].status === 'A') {
          await fsp.rm(join(repoPath, l.path), { force: true })
        }
      }
      await runGit(repoPath, ['read-tree', '-m', snap.head])
      await runGit(repoPath, ['read-tree', '--reset', '-u', target])
      await runGit(repoPath, ['symbolic-ref', '-m', `${REFLOG}: leave to ${keep}`, 'HEAD', `refs/heads/${keep}`])
      await runGit(repoPath, ['read-tree', '-m', tip])
      if (!keepApplied) await restoreLaneChanges(repoPath, keep).catch(() => {})
      await runGit(repoPath, ['update-ref', '-d', WS_REF])
      await writeState(repoPath, null)
    })
  })
}

/** After a checkout outside SillyGit: forget the lanes (branches and saved changes stay). */
export function forgetLanes(repoPath: string): Promise<void> {
  return serial(repoPath, async () => {
    await requireState(repoPath)
    if ((await headRef(repoPath)) !== WS_REF) await runGit(repoPath, ['update-ref', '-d', WS_REF]).catch(() => {})
    await writeState(repoPath, null)
  })
}

/** After a checkout outside SillyGit: check the workspace branch out again. */
export function returnToWorkspace(repoPath: string): Promise<void> {
  return serial(repoPath, async () => {
    await requireState(repoPath)
    await runGit(repoPath, ['checkout', WORKSPACE_BRANCH])
  })
}

// ---- Lanes ----

/** Makes a new lane, a branch from the base, and applies it. */
export function createLane(repoPath: string, name: string): Promise<void> {
  return serial(repoPath, async () => {
    const state = await ready(repoPath)
    const problem = laneNameProblem(name)
    if (problem) throw new GitError(problem)
    if (await rev(repoPath, `refs/heads/${name}`)) throw new GitError(`A branch called ${name} already exists. Apply it as a lane instead.`)
    await runGit(repoPath, ['branch', name, `refs/heads/${state.base}`])
    state.lanes.push({ name, applied: true })
    try {
      await syncWorkspace(repoPath, state, `new lane ${name}`)
    } catch (err) {
      await runGit(repoPath, ['branch', '-D', name]).catch(() => {})
      throw err
    }
    await writeState(repoPath, state)
  })
}

/**
 * Applies a lane: an unapplied one, or any local branch, which becomes a
 * lane. Its commits join the working tree and changes set aside for it come
 * back, owned by it.
 */
export function applyLane(repoPath: string, name: string): Promise<void> {
  return serial(repoPath, async () => {
    const state = await ready(repoPath)
    if (name === WORKSPACE_BRANCH) throw new GitError('That’s SillyGit’s own branch.')
    await requireBranch(repoPath, name)
    const entry = state.lanes.find((l) => l.name === name)
    if (entry?.applied) throw new GitError(`${name} is already applied.`)
    const snap = await snapshot(repoPath, state)
    rememberOwners(state, snap)
    await backup(repoPath, state, snap, `Undo applying ${name}`)
    await orRollBack(repoPath, async () => {
      if (entry) entry.applied = true
      else state.lanes.push({ name, applied: true })
      await syncWorkspace(repoPath, state, `apply ${name}`)
      await writeState(repoPath, state)
      if (await restoreLaneChanges(repoPath, name)) {
        // Lines that weren't there before are the saved changes: they're this lane's.
        const after = await snapshot(repoPath, state, name)
        rememberOwners(state, after)
        await writeState(repoPath, state)
      }
    })
  })
}

/**
 * Unapplies a lane: its uncommitted changes are set aside under
 * refs/sillygit/wip/, then its changes and commits leave the working tree.
 * The branch stays.
 */
export function unapplyLane(repoPath: string, name: string, remove = false): Promise<void> {
  return serial(repoPath, async () => {
    const state = await ready(repoPath)
    requireLane(state, name)
    const entry = state.lanes.find((l) => l.name === name)!
    if (entry.applied) {
      const snap = await snapshot(repoPath, state)
      rememberOwners(state, snap)
      await backup(repoPath, state, snap, `Undo ${remove ? 'removing' : 'unapplying'} ${name}`)
      await orRollBack(repoPath, async () => {
        await saveLaneChanges(repoPath, snap, name)
        await removeLaneChanges(repoPath, snap, name)
        entry.applied = false
        state.owners = state.owners.filter((o) => o.lane !== name)
        await syncWorkspace(repoPath, state, `unapply ${name}`)
      })
    }
    if (remove) state.lanes = state.lanes.filter((l) => l.name !== name)
    if (state.defaultLane === name || !state.lanes.some((l) => l.name === state.defaultLane)) {
      state.defaultLane = applied(state)[0] ?? state.lanes[0]?.name ?? state.defaultLane
    }
    await writeState(repoPath, state)
  })
}

export function setDefaultLane(repoPath: string, name: string): Promise<void> {
  return serial(repoPath, async () => {
    const state = await requireState(repoPath)
    requireLane(state, name)
    state.defaultLane = name
    await writeState(repoPath, state)
  })
}

export function renameLane(repoPath: string, from: string, to: string): Promise<void> {
  return serial(repoPath, async () => {
    const state = await ready(repoPath)
    requireLane(state, from)
    const problem = laneNameProblem(to)
    if (problem) throw new GitError(problem)
    if (await rev(repoPath, `refs/heads/${to}`)) throw new GitError(`A branch called ${to} already exists.`)
    // Owners are remembered by lane name, so they're settled before it changes.
    const snap = await snapshot(repoPath, state)
    rememberOwners(state, snap)
    await runGit(repoPath, ['branch', '-m', from, to])
    const wip = await rev(repoPath, WIP_PREFIX + from)
    if (wip) {
      await updateRef(repoPath, WIP_PREFIX + to, wip, null, `rename ${from}`)
      await runGit(repoPath, ['update-ref', '-d', WIP_PREFIX + from])
    }
    for (const l of state.lanes) if (l.name === from) l.name = to
    for (const o of state.owners) if (o.lane === from) o.lane = to
    if (state.defaultLane === from) state.defaultLane = to
    await writeState(repoPath, state)
  })
}

/** Gives changes to `lane`. Only ownership changes; files aren't touched. */
export function moveToLane(repoPath: string, lane: string, move: LaneMove): Promise<number> {
  return serial(repoPath, async () => {
    const state = await ready(repoPath)
    if (!applied(state).includes(lane)) throw new GitError(`${lane} isn’t an applied lane.`)
    const snap = await snapshot(repoPath, state)
    let moved = 0
    const take = (i: number): void => {
      if (snap.owners[i] === lane) return
      snap.owners[i] = lane
      moved++
    }
    const lineKey = (path: string, kind: ChangeKind, line: number): string => `${path}\0${kind}\0${line}`
    const wanted = new Set((move.lines ?? []).map((l) => lineKey(l.path, l.kind, l.line)))
    snap.parsed.lines.forEach((l: ChangeLine, i) => {
      if (move.files?.some((f) => f.path === l.path && (!f.fromLane || f.fromLane === snap.owners[i]))) take(i)
      else if (l.kind !== 'file' && wanted.has(lineKey(l.path, l.kind, l.line))) take(i)
    })
    rememberOwners(state, snap)
    await writeState(repoPath, state)
    return moved
  })
}

/**
 * Commits `lane`'s uncommitted changes to it. The commit is built from the
 * lane's own tip in a throwaway index, so neither the files nor the other
 * lanes' changes move; the workspace commit is then rebuilt to include it.
 */
export function commitLane(repoPath: string, lane: string, message: string): Promise<string> {
  return serial(repoPath, async () => {
    const state = await ready(repoPath)
    if (!applied(state).includes(lane)) throw new GitError(`${lane} isn’t an applied lane.`)
    if (!message.trim()) throw new GitError('Write a commit message first.')
    const snap = await snapshot(repoPath, state)
    if (!snap.owners.includes(lane)) throw new GitError(`${lane} has no uncommitted changes.`)
    rememberOwners(state, snap)
    const finalMessage = await runCommitMsgHook(repoPath, message)
    const tip = await requireBranch(repoPath, lane)
    const tree = await laneTree(repoPath, snap, lane, tip)
    if (tree === (await treeOf(repoPath, tip))) throw new GitError(`${lane} has no uncommitted changes.`)
    await backup(repoPath, state, snap, `Undo commit to ${lane}`)
    const commit = await commitTree(repoPath, tree, [tip], finalMessage)
    await updateRef(repoPath, `refs/heads/${lane}`, commit, tip, `commit to ${lane}`)
    try {
      // The lane's commit is already in the files, so only refs and the index move.
      const next = await buildWorkspace(repoPath, state)
      await moveWorkspace(repoPath, state, next, `commit to ${lane}`)
    } catch (err) {
      await updateRef(repoPath, `refs/heads/${lane}`, tip, commit, 'undo failed commit')
      throw err
    }
    await writeState(repoPath, state)
    return commit
  })
}

/** Runs the repo's commit-msg hook on a message, like `git commit` would; returns the message it leaves. */
async function runCommitMsgHook(repoPath: string, message: string): Promise<string> {
  const hooksPath = (await runGit(repoPath, ['config', '--get', 'core.hooksPath']).catch(() => '')).trim()
  const hook = hooksPath ? join(resolve(repoPath, hooksPath), 'commit-msg') : await gitPath(repoPath, 'hooks/commit-msg')
  try {
    await fsp.access(hook, 1 /* X_OK */)
  } catch {
    return message
  }
  const file = join(tmpdir(), `sillygit-lanes-${randomUUID()}.msg`)
  await fsp.writeFile(file, message.endsWith('\n') ? message : `${message}\n`, 'utf-8')
  try {
    await execFileAsync(hook, [file], { cwd: repoPath })
    return (await fsp.readFile(file, 'utf-8')).replace(/\n+$/, '')
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw new GitError(stderr || 'The commit-msg hook rejected the message.')
  } finally {
    await fsp.unlink(file).catch(() => {})
  }
}

/** Pushes a lane to its upstream's remote, or origin, setting up tracking. */
export function pushLane(repoPath: string, lane: string): Promise<string> {
  return serial(repoPath, async () => {
    const state = await requireState(repoPath)
    requireLane(state, lane)
    const remotes = (await runGit(repoPath, ['remote'])).split('\n').map((r) => r.trim()).filter(Boolean)
    if (remotes.length === 0) throw new GitError('This repository has no remote to push to.')
    const tracked = (await runGit(repoPath, ['config', '--get', `branch.${lane}.remote`]).catch(() => '')).trim()
    const remote = tracked && remotes.includes(tracked) ? tracked : remotes.includes('origin') ? 'origin' : remotes[0]
    await runGit(repoPath, ['push', '-u', remote, `refs/heads/${lane}:refs/heads/${lane}`], await remoteEnv())
    return remote
  })
}

/**
 * Moves commits made on the workspace branch outside SillyGit (e.g. `git
 * commit` in a terminal) onto `lane`, keeping their messages and authors.
 */
export function moveWorkspaceCommits(repoPath: string, lane: string): Promise<number> {
  return serial(repoPath, async () => {
    const state = await requireState(repoPath)
    requireLane(state, lane)
    if (!applied(state).includes(lane)) throw new GitError(`${lane} isn’t an applied lane.`)
    if ((await headRef(repoPath)) !== WS_REF) throw new GitError('Check the workspace branch out first.')
    const tip = await rev(repoPath, WS_REF)
    if (!tip || tip === state.workspace) return 0
    if (!(await isAncestor(repoPath, state.workspace, tip))) {
      throw new GitError('The workspace branch was rewritten outside SillyGit, so its commits can’t be picked out.')
    }
    const list = (await runGit(repoPath, ['rev-list', '--reverse', '--parents', `${state.workspace}..${tip}`]))
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split(' '))
    if (list.some((parts) => parts.length !== 2)) throw new GitError('There’s a merge among those commits; move them by hand.')
    let laneTip = await requireBranch(repoPath, lane)
    const before = laneTip
    for (const [hash, parent] of list) {
      const patch = await runGit(repoPath, [...DIFF_ARGS, '--binary', '--full-index', parent, hash])
      const tree = await withTempIndex(repoPath, laneTip, async (env) => {
        if (patch.trim()) {
          await withPatchFile(patch, (file) =>
            runGit(repoPath, ['apply', '--cached', '--3way', '--whitespace=nowarn', file], env).catch(() => {
              throw new GitError(`Commit ${hash.slice(0, 7)} doesn’t apply to ${lane} on its own.`)
            })
          )
        }
        return (await runGit(repoPath, ['write-tree'], env)).trim()
      })
      const [name, email, date, ...body] = (await runGit(repoPath, ['log', '-1', '--format=%an%x00%ae%x00%aD%x00%B', hash])).split('\0')
      const env = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date }
      laneTip = await commitTree(repoPath, tree, [laneTip], body.join('\0').replace(/\n+$/, ''), env)
    }
    await updateRef(repoPath, `refs/heads/${lane}`, laneTip, before, `move commits to ${lane}`)
    try {
      const next = await buildWorkspace(repoPath, state)
      // The files already hold those commits; anything the merge sees differently is applied on top.
      if ((await treeOf(repoPath, next)) !== (await treeOf(repoPath, tip))) {
        const patch = await runGit(repoPath, [...DIFF_ARGS, '--binary', '--full-index', tip, next])
        if (patch.trim()) await withPatchFile(patch, (file) => runGit(repoPath, ['apply', '--whitespace=nowarn', file]))
      }
      await moveWorkspace(repoPath, state, next, `move commits to ${lane}`)
    } catch (err) {
      await updateRef(repoPath, `refs/heads/${lane}`, before, laneTip, 'undo failed move')
      throw err
    }
    await writeState(repoPath, state)
    return list.length
  })
}

/** After lane branches moved outside SillyGit (a pull, a reset): rebuilds the workspace from their tips. */
export function refreshWorkspace(repoPath: string): Promise<void> {
  return serial(repoPath, async () => {
    const state = await requireState(repoPath)
    if ((await headRef(repoPath)) !== WS_REF) throw new GitError('Check the workspace branch out first.')
    for (const name of applied(state)) {
      if (!(await rev(repoPath, `refs/heads/${name}`))) {
        state.lanes = state.lanes.filter((l) => l.name !== name)
        state.owners = state.owners.filter((o) => o.lane !== name)
      }
    }
    if (!state.lanes.some((l) => l.name === state.defaultLane)) state.defaultLane = applied(state)[0] ?? state.defaultLane
    const snap = await snapshot(repoPath, state)
    rememberOwners(state, snap)
    await backup(repoPath, state, snap, 'Undo workspace update')
    await orRollBack(repoPath, () => syncWorkspace(repoPath, state, 'update workspace'))
    await writeState(repoPath, state)
  })
}

/** Undoes the last lanes change that rewrote anything, from its backup. Returns what was undone. */
export function undoLaneChange(repoPath: string): Promise<string> {
  return serial(repoPath, async () => {
    const [newest] = await listBackups(repoPath)
    if (!newest) throw new GitError('There’s no lanes change to undo.')
    const note = await readBackup(repoPath, newest)
    await restoreBackup(repoPath, newest)
    await runGit(repoPath, ['update-ref', '-d', newest])
    return note?.label ?? 'Undo'
  })
}
