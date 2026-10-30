import type {
  BlameLine,
  CommitDetail,
  CommitFileChange,
  CommitInfo,
  GraphCommit,
  CommitSearchHit,
  FileHistoryEntry
} from '../../shared/types'
import { filterPathspecs, type CommitSearch, type GraphFilter } from '../../shared/historySearch'
import { DEFAULT_GRAPH_SCOPE, graphRevisionArgs, isDefaultScope, type GraphScope } from '../../shared/graphScope'
import { runGit } from '../gitExec'
import { parseCoAuthors, parseShortlog, type CoAuthorCandidate } from '../../shared/coAuthors'
import { parseSignature, type CommitSignature } from '../../shared/signature'
import { markLfs } from './lfs'

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

/**
 * `git log` of the graph's branches (see graphRevisionArgs), newest first,
 * or with a filter just the commits touching its path. Parent rewriting joins
 * each of those to the next one down its line, so the filtered graph still
 * draws as lanes.
 */
function graphLogArgs(filter: GraphFilter | null, extra: string[], revisions: string[]): string[] {
  return [
    'log',
    ...revisions,
    '--date-order',
    ...(filter ? ['--parents'] : []),
    ...extra,
    // Ends the revisions, so a ref is never read as a path; a path search brings its own.
    ...(filter ? ['--', ...filterPathspecs(filter)] : extra.includes('--') ? [] : ['--'])
  ]
}

/** The revisions the graph draws for a repo's scope: hidden, soloed or current-branch-only. */
export async function graphRevisions(repoPath: string, scope: GraphScope = DEFAULT_GRAPH_SCOPE): Promise<string[]> {
  if (isDefaultScope(scope)) return graphRevisionArgs(scope, [], [], null)
  const [refs, remotes, current] = await Promise.all([
    runGit(repoPath, ['for-each-ref', '--format=%(refname)%09%(upstream)', 'refs/heads', 'refs/remotes']).catch(() => ''),
    runGit(repoPath, ['remote']).catch(() => ''),
    runGit(repoPath, ['symbolic-ref', '-q', '--short', 'HEAD']).catch(() => '')
  ])
  const repoRefs = refs
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [refname, upstream = ''] = line.split('\t')
      return { refname, upstream }
    })
  return graphRevisionArgs(scope, repoRefs, remotes.split('\n').map((r) => r.trim()).filter(Boolean), current.trim() || null)
}

export async function getGraphLog(
  repoPath: string,
  limit = GRAPH_PAGE_SIZE,
  filter: GraphFilter | null = null,
  scope: GraphScope = DEFAULT_GRAPH_SCOPE
): Promise<GraphCommit[]> {
  const format = `%x1e%H${US}%P${US}%an${US}%ae${US}%ad${US}%cd${US}%s${US}%D`
  const revisions = await graphRevisions(repoPath, scope)
  let out: string
  try {
    out = await runGit(
      repoPath,
      graphLogArgs(filter, [`--max-count=${limit}`, `--format=${format}`, '--date=iso-strict'], revisions)
    )
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

export function parseNameStatus(lines: string[]): CommitFileChange[] {
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
  const [out, signature] = await Promise.all([
    runGit(repoPath, ['show', '--no-color', '--name-status', `--format=${format}`, '--date=iso-strict', hash]),
    getCommitSignature(repoPath, hash)
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
  await markLfs(repoPath, files, h)
  return {
    hash: h,
    parents: parents ? parents.split(' ').filter(Boolean) : [],
    author,
    authorEmail,
    date,
    subject,
    body: body.trim(),
    files,
    coAuthors: parseCoAuthors(body),
    signature
  }
}

/**
 * Whether a commit is signed and git trusts the signature. Checking needs
 * gpg (or ssh's allowed signers file); without them a signed commit reads
 * as unverified, and a failure to run git at all as unsigned.
 */
export async function getCommitSignature(repoPath: string, hash: string): Promise<CommitSignature> {
  try {
    const out = await runGit(repoPath, ['log', '-1', '--no-color', `--format=%G?${US}%GS${US}%GK`, hash])
    if (!out.startsWith('N')) return parseSignature(out)
    // "N" can also be an SSH signature git had nothing to check against.
    const header = (await runGit(repoPath, ['cat-file', 'commit', hash])).split('\n\n')[0]
    const signedWith = !/^gpgsig(-sha256)? /m.test(header) ? null : header.includes('BEGIN SSH SIGNATURE') ? 'ssh' : 'gpg'
    return parseSignature(out, signedWith)
  } catch {
    return parseSignature('')
  }
}

/**
 * Everyone who has committed to the repo, busiest first, to suggest as
 * co-authors; the current user is left out.
 */
export async function getCoAuthorCandidates(repoPath: string): Promise<CoAuthorCandidate[]> {
  // shortlog reads stdin when given no revisions, so name them.
  const [out, me] = await Promise.all([
    runGit(repoPath, ['shortlog', '-sne', '--all', '--no-merges']).catch(() => ''),
    runGit(repoPath, ['config', 'user.email']).catch(() => '')
  ])
  const own = me.trim().toLowerCase()
  return parseShortlog(out).filter((p) => p.email.toLowerCase() !== own)
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

/** The `git log` options that pick out a search's matches, for the modes git searches itself. */
function searchArgs({ mode, term }: CommitSearch): string[] {
  switch (mode) {
    case 'message':
      return ['--regexp-ignore-case', '--fixed-strings', `--grep=${term}`]
    case 'author':
      return ['--regexp-ignore-case', '--fixed-strings', `--author=${term}`]
    case 'path':
      return ['--', ...filterPathspecs({ path: term, contains: true })]
    case 'change':
      return [`-S${term}`]
    case 'regex':
      return [`-G${term}`]
    default:
      return []
  }
}

/**
 * The commits matching a search, with each one's position in the graph's
 * order (within `filter` when the graph is filtered). A plain string, or
 * mode "all", matches the message (subject and body), author name or email
 * case-insensitively, or a hash prefix. The other modes are git's own: the
 * message, the author, a path containing the term, or changes adding or
 * removing the text (-S) or touching lines matching a regex (-G). Scans all
 * of history, not just what the graph has loaded, so the graph can load
 * further to reach a match. An invalid regex throws.
 */
export async function searchCommits(
  repoPath: string,
  query: string | CommitSearch,
  max = 2000,
  filter: GraphFilter | null = null,
  scope: GraphScope = DEFAULT_GRAPH_SCOPE
): Promise<CommitSearchHit[]> {
  const search = typeof query === 'string' ? { mode: 'all' as const, term: query } : query
  const term = search.term.trim()
  if (!term) return []
  const revisions = await graphRevisions(repoPath, scope)
  if (search.mode === 'all') return searchEverything(repoPath, term.toLowerCase(), max, filter, revisions)

  const matchArgs = searchArgs({ ...search, term })
  const [order, matched] = await Promise.all([
    runGit(repoPath, graphLogArgs(filter, ['--format=%H'], revisions)).catch(() => ''),
    // A path search's own pathspec takes the filter's place, so commits it
    // finds outside the filter simply have no row and are left out below.
    runGit(repoPath, graphLogArgs(search.mode === 'path' ? null : filter, ['--format=%H', ...matchArgs], revisions))
  ])
  const index = new Map(order.split('\n').filter(Boolean).map((hash, i) => [hash, i]))
  const hits: CommitSearchHit[] = []
  for (const hash of matched.split('\n')) {
    const i = index.get(hash)
    if (i !== undefined) hits.push({ hash, index: i })
  }
  return hits.sort((a, b) => a.index - b.index).slice(0, max)
}

async function searchEverything(
  repoPath: string,
  needle: string,
  max: number,
  filter: GraphFilter | null,
  revisions: string[]
): Promise<CommitSearchHit[]> {
  let out: string
  try {
    out = await runGit(repoPath, graphLogArgs(filter, [`--format=%x1e%H${US}%an${US}%ae${US}%B`], revisions))
  } catch {
    return []
  }
  const hits: CommitSearchHit[] = []
  const records = out.split(RS).filter((r) => r.trim())
  for (let index = 0; index < records.length; index++) {
    const [hash, author, email, message] = records[index].split(US)
    if (
      hash.startsWith(needle) ||
      message.toLowerCase().includes(needle) ||
      author.toLowerCase().includes(needle) ||
      email.toLowerCase().includes(needle)
    ) {
      hits.push({ hash, index })
      if (hits.length >= max) break
    }
  }
  return hits
}
