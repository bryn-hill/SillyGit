import { parseReflog, REFLOG_FORMAT, type ReflogEntry } from '../../shared/reflog'
import { runGit } from '../gitExec'

// The reflog view: where HEAD or a branch has pointed.

/** How many entries the reflog view lists. */
const REFLOG_LIMIT = 300

/** `ref` is `HEAD` or a local branch name; a ref with no reflog gives an empty list. */
export async function getReflog(repoPath: string, ref: string): Promise<ReflogEntry[]> {
  const full = ref === 'HEAD' ? 'HEAD' : `refs/heads/${ref}`
  let out: string
  try {
    out = await runGit(repoPath, [
      'reflog',
      'show',
      '--date=unix',
      `--format=${REFLOG_FORMAT}`,
      '-n',
      String(REFLOG_LIMIT),
      full,
      '--'
    ])
  } catch {
    return []
  }
  return parseReflog(out, full)
}
