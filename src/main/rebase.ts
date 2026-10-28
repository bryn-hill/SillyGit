import { promises as fsp } from 'fs'
import { join } from 'path'
import {
  buildTodo,
  messageFiles,
  validateSteps,
  type RebaseCommit,
  type RebasePlan,
  type RebaseStep
} from '../shared/rebase'
import type { ConflictableResult } from '../shared/types'
import { cleanUpInteractiveRebase, getOperationState, interactiveRebaseDir, rebaseEditorEnv, runMayConflict } from './conflicts'
import { GitError, runGit } from './gitExec'

// Interactive rebase without an editor in sight: the app writes git's todo
// list itself and hands it over through GIT_SEQUENCE_EDITOR, and a small
// script set as GIT_EDITOR answers git's "edit the commit message" for the
// rewords and squashes with the messages the user typed. Conflicts stop the
// rebase like any other; continuing it uses the same script (see
// rebaseEditorEnv), so a reword that conflicted still gets its message.

const MAX_COMMITS = 1000
const FS = '\x1f'
const RS = '\x1e'

/** Quotes a value for sh, which git runs its editors through. Backslashes become slashes for Git for Windows. */
function shQuote(value: string): string {
  return `'${value.replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`
}

async function verifyCommit(repoPath: string, rev: string): Promise<string> {
  const out = await runGit(repoPath, ['rev-parse', '-q', '--verify', `${rev}^{commit}`]).catch(() => '')
  if (!out.trim()) throw new GitError(`"${rev}" is not a commit.`)
  return out.trim()
}

/** The commits after `base` on the current branch, for the rebase editor. */
export async function planInteractiveRebase(repoPath: string, base: string): Promise<RebasePlan> {
  if (await getOperationState(repoPath)) {
    throw new GitError('Finish or abort the operation in progress first.')
  }
  const branch = (await runGit(repoPath, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim()
  if (!branch) throw new GitError('Check out a branch first: an interactive rebase rewrites the branch you are on.')
  const head = await verifyCommit(repoPath, 'HEAD')
  const baseHash = await verifyCommit(repoPath, base)
  if (baseHash === head) throw new GitError('Pick a commit below the branch tip: there is nothing after this one to rebase.')
  const isAncestor = await runGit(repoPath, ['merge-base', '--is-ancestor', baseHash, head])
    .then(() => true)
    .catch(() => false)
  if (!isAncestor) throw new GitError(`That commit is not part of ${branch}'s history.`)

  const range = `${baseHash}..${head}`
  const merges = (await runGit(repoPath, ['rev-list', '--merges', '--count', range])).trim()
  if (Number(merges) > 0) {
    throw new GitError('Those commits include a merge. Interactive rebase works on a straight line of commits; pick a commit after the merge.')
  }
  const out = await runGit(repoPath, [
    'log',
    '--reverse',
    `--max-count=${MAX_COMMITS + 1}`,
    `--format=%H${FS}%h${FS}%s${FS}%an${FS}%ae${FS}%aI${FS}%B${RS}`,
    range
  ])
  const commits: RebaseCommit[] = out
    .split(RS)
    .map((r) => r.replace(/^\n/, ''))
    .filter((r) => r.length > 0)
    .map((r) => {
      const [hash, shortHash, subject, author, authorEmail, date, message] = r.split(FS)
      return { hash, shortHash, subject, author, authorEmail, date, message: message.replace(/\n+$/, '') }
    })
  if (commits.length > MAX_COMMITS) {
    throw new GitError(`That is more than ${MAX_COMMITS} commits. Pick a more recent commit.`)
  }
  const [shortHash, subject] = (await runGit(repoPath, ['log', '-1', `--format=%h${FS}%s`, baseHash])).trim().split(FS)
  return { branch, head, base: { hash: baseHash, shortHash, subject }, commits }
}

/** The script git runs as its editor: copies in the message saved for the commit it is on, else leaves git's. */
function editorScript(gitDir: string, dir: string): string {
  return [
    '#!/bin/sh',
    '# Written by SillyGit for an interactive rebase.',
    `done_file=${shQuote(join(gitDir, 'rebase-merge', 'done'))}`,
    `messages=${shQuote(join(dir, 'messages'))}`,
    'rev=$(awk \'NF && $1 !~ /^#/ { line = $2 } END { print line }\' "$done_file" 2>/dev/null)',
    '[ -n "$rev" ] || exit 0',
    'sha=$(git rev-parse -q --verify "$rev^{commit}" 2>/dev/null) || exit 0',
    '[ -f "$messages/$sha" ] && cp "$messages/$sha" "$1"',
    'exit 0',
    ''
  ].join('\n')
}

/**
 * Runs the interactive rebase the user planned. `steps` are oldest first and
 * must name exactly the commits the plan found, or nothing runs.
 */
export async function startInteractiveRebase(
  repoPath: string,
  base: string,
  expectedHead: string,
  steps: RebaseStep[]
): Promise<ConflictableResult> {
  const plan = await planInteractiveRebase(repoPath, base)
  if (plan.head !== expectedHead) throw new GitError(`${plan.branch} has changed since the rebase was planned. Open it again.`)
  const planned = new Set(plan.commits.map((c) => c.hash))
  if (steps.length !== planned.size || !steps.every((s) => planned.delete(s.hash))) {
    throw new GitError('The rebase plan no longer matches the branch. Open it again.')
  }
  const messages = new Map(plan.commits.map((c) => [c.hash, c.message]))
  const messageOf = (hash: string): string => messages.get(hash) ?? ''
  const invalid = validateSteps(steps, messageOf)
  if (invalid) throw new GitError(invalid)

  const dir = await interactiveRebaseDir(repoPath)
  const gitDir = (await runGit(repoPath, ['rev-parse', '--absolute-git-dir'])).trim()
  await fsp.rm(dir, { recursive: true, force: true })
  await fsp.mkdir(join(dir, 'messages'), { recursive: true })
  const todo = join(dir, 'todo')
  await fsp.writeFile(todo, buildTodo(steps))
  for (const [hash, text] of messageFiles(steps, messageOf)) {
    await fsp.writeFile(join(dir, 'messages', hash), text)
  }
  await fsp.writeFile(join(dir, 'editor.sh'), editorScript(gitDir, dir), { mode: 0o755 })

  try {
    return await runMayConflict(repoPath, ['rebase', '-i', '--autostash', plan.base.hash], {
      ...(await rebaseEditorEnv(repoPath)),
      GIT_SEQUENCE_EDITOR: `cp ${shQuote(todo)}`
    })
  } finally {
    await cleanUpInteractiveRebase(repoPath)
  }
}
