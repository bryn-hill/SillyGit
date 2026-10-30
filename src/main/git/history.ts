import type {
  BlameLine,
  CommitDetail,
  CommitFileChange,
  CommitInfo,
  GraphCommit,
  CommitSearchHit,
  FileHistoryEntry
} from '../../shared/types'
import { runGit } from '../gitExec'

// Reading history: the log and graph, commit details and diffs, file history, blame and search.

export async function getLog(repoPath: string, limit = 50): Promise<CommitInfo[]> {
  const format = '%H%x09%an%x09%ad%x09%s'
  const out = await runGit(repoPath, [
    'log',
    `--max-count=${limit}`,
    `--format=${format}`,
    '--date=short'
  ])
  return out
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [hash, author, date, subject] = line.split('\t')
      return { hash, author, date, subject }
    })
}

export const US = '\x1f' // unit separator, safe field delimiter
const RS = '\x1e' // record separator, safe commit delimiter

export const GRAPH_PAGE_SIZE = 500

export async function getGraphLog(repoPath: string, limit = GRAPH_PAGE_SIZE): Promise<GraphCommit[]> {
  const format = `%x1e%H${US}%P${US}%an${US}%ae${US}%ad${US}%cd${US}%s${US}%D`
  let out: string
  try {
    out = await runGit(repoPath, [
      'log',
      // Stashes get their own list; their internal commits only clutter the graph,
      // as do the lanes' backups and set-aside changes.
      '--exclude=refs/stash',
      '--exclude=refs/sillygit/*',
      '--all',
      '--date-order',
      `--max-count=${limit}`,
      `--format=${format}`,
      '--date=iso-strict'
    ])
  } catch {
    return []
  }
  return out
    .split(RS)
    .map((rec) => rec.trim())
    .filter((rec) => rec.length > 0)
    .map((rec) => {
      const [hash, parents, author, authorEmail, date, committedAt, subject, refs] = rec.split(US)
      return {
        hash,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        author,
        authorEmail,
        date,
        committedAt,
        subject,
        refs: refs ? refs.split(', ').filter(Boolean) : []
      }
    })
}

function parseNameStatus(lines: string[]): CommitFileChange[] {
  const files: CommitFileChange[] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const parts = line.split('\t')
    const status = parts[0]
    if (status.startsWith('R') || status.startsWith('C')) {
      files.push({ status: status[0], origPath: parts[1], path: parts[2] })
    } else {
      files.push({ status, path: parts[1] })
    }
  }
  return files
}

export async function getCommitDetail(repoPath: string, hash: string): Promise<CommitDetail> {
  const format = `%H${US}%P${US}%an${US}%ae${US}%ad${US}%s${US}%b`
  const out = await runGit(repoPath, [
    'show',
    '--no-color',
    '--name-status',
    `--format=${format}`,
    '--date=iso-strict',
    hash
  ])
  const lines = out.split('\n')
  const headerLine = lines[0]
  const [h, parents, author, authorEmail, date, subject, ...bodyParts] = headerLine.split(US)
  // body may itself contain newlines captured in bodyParts plus following lines until a blank
  // separator before the file list; rejoin and then find where file status lines begin
  let body = bodyParts.join(US)
  let i = 1
  while (i < lines.length && !/^[A-Z]\d*\t/.test(lines[i])) {
    if (lines[i].trim().length > 0) body += (body ? '\n' : '') + lines[i]
    i++
  }
  const files = parseNameStatus(lines.slice(i))
  return {
    hash: h,
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    author,
    authorEmail,
    date,
    subject,
    body: body.trim(),
    files
  }
}

export async function getCommitFileDiff(
  repoPath: string,
  hash: string,
  path: string,
  ignoreWhitespace = false,
  oldPath?: string
): Promise<string> {
  // A merge shows what it changed against its first parent, like the file history lists it.
  const args = ['show', '--no-color', '-M', '--diff-merges=first-parent']
  if (ignoreWhitespace) args.push('-w')
  args.push('--format=', hash, '--', path)
  // Naming both sides of a rename shows it as one, rather than a whole file added.
  if (oldPath && oldPath !== path) args.push(oldPath)
  return runGit(repoPath, args)
}

export async function getCommitFullDiff(repoPath: string, hash: string): Promise<string> {
  return runGit(repoPath, ['show', '--no-color', '--format=', hash])
}

export async function getHeadHash(repoPath: string): Promise<string> {
  return (await runGit(repoPath, ['rev-parse', 'HEAD'])).trim()
}

export async function getTreeHash(repoPath: string, ref: string): Promise<string> {
  return (await runGit(repoPath, [`rev-parse`, `${ref}^{tree}`])).trim()
}

export async function getFileAtRef(repoPath: string, ref: string, path: string): Promise<string> {
  return runGit(repoPath, ['show', `${ref}:${path}`])
}

/**
 * The commits that changed `path`, newest first, following it back through renames.
 * Each entry carries the file's path in that commit, so its diff and content can be read.
 */
export async function getFileHistory(
  repoPath: string,
  path: string,
  fromRef: string,
  limit = 100
): Promise<FileHistoryEntry[]> {
  const out = await runGit(repoPath, [
    'log',
    fromRef,
    '--follow',
    '-M',
    '--name-status',
    `--max-count=${limit}`,
    `--format=%x1e%H${US}%an${US}%ae${US}%aI${US}%s`,
    '--',
    path
  ])
  // A merge that didn't touch the file lists no paths, so it keeps the path the newer commit started from.
  let current = path
  return out
    .split(RS)
    .filter((rec) => rec.trim().length > 0)
    .map((rec) => {
      const [header, ...rest] = rec.split('\n')
      const [hash, author, authorEmail, date, subject] = header.split(US)
      const change = rest.find((l) => /^[A-Z]\d*\t/.test(l))
      const entry: FileHistoryEntry = { hash, author, authorEmail, date, subject, path: current, status: '' }
      if (change) {
        const [code, a, b] = change.split('\t')
        entry.status = code[0]
        if (b !== undefined) {
          entry.oldPath = a
          entry.path = b
        } else {
          entry.path = a
        }
      }
      current = entry.oldPath ?? entry.path
      return entry
    })
}

const UNCOMMITTED = '0000000000000000000000000000000000000000'

/**
 * Parses `git blame --porcelain` output into one entry per final-side line number.
 * A null `ref` blames the working-tree file, so uncommitted lines show up too.
 */
export async function getBlame(repoPath: string, ref: string | null, path: string): Promise<BlameLine[]> {
  const out = await runGit(repoPath, ref ? ['blame', '--porcelain', ref, '--', path] : ['blame', '--porcelain', '--', path])
  const lines = out.split('\n')
  interface Meta {
    author: string
    authorEmail: string
    date: string
    summary: string
    path: string
    previous?: { hash: string; path: string }
  }
  const meta = new Map<string, Meta>()
  const result: BlameLine[] = []

  let i = 0
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/)
    if (!headerMatch) {
      i++
      continue
    }
    const hash = headerMatch[1]
    const finalLine = Number(headerMatch[2])
    if (!meta.has(hash)) meta.set(hash, { author: '', authorEmail: '', date: '', summary: '', path })
    const m = meta.get(hash)!
    i++
    while (i < lines.length && !lines[i].startsWith('\t')) {
      const line = lines[i]
      if (line.startsWith('author ')) m.author = line.slice(7)
      else if (line.startsWith('author-mail ')) m.authorEmail = line.slice(12).replace(/^<|>$/g, '')
      else if (line.startsWith('author-time ')) m.date = new Date(Number(line.slice(12)) * 1000).toISOString()
      else if (line.startsWith('summary ')) m.summary = line.slice(8)
      else if (line.startsWith('filename ')) m.path = line.slice(9)
      else if (line.startsWith('previous ')) {
        const rest = line.slice(9)
        const space = rest.indexOf(' ')
        m.previous = { hash: rest.slice(0, space), path: rest.slice(space + 1) }
      }
      i++
    }
    result.push({
      lineNo: finalLine,
      hash,
      author: m.author,
      authorEmail: m.authorEmail,
      date: m.date,
      summary: m.summary,
      path: m.path,
      ...(m.previous ? { previous: m.previous } : {}),
      uncommitted: hash === UNCOMMITTED
    })
    i++ // consume the '\t<content>' line
  }
  return result
}

/**
 * Every commit whose subject, author name or email contains `query`, or whose
 * hash starts with it, case-insensitively, with its position in the graph's
 * order. Scans all of history, not just what the graph has loaded, so the
 * graph can load further to reach a match.
 */
export async function searchCommits(repoPath: string, query: string, max = 2000): Promise<CommitSearchHit[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  let out: string
  try {
    out = await runGit(repoPath, [
      'log',
      '--exclude=refs/stash',
      '--exclude=refs/sillygit/*',
      '--all',
      '--date-order',
      `--format=%H${US}%an${US}%ae${US}%s`
    ])
  } catch {
    return []
  }
  const hits: CommitSearchHit[] = []
  const lines = out.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line) continue
    const [hash, author, email, subject] = line.split(US)
    if (
      hash.startsWith(needle) ||
      subject.toLowerCase().includes(needle) ||
      author.toLowerCase().includes(needle) ||
      email.toLowerCase().includes(needle)
    ) {
      hits.push({ hash, index })
      if (hits.length >= max) break
    }
  }
  return hits
}
