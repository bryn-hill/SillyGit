/** Someone credited on a commit with a `Co-authored-by:` trailer. */
export interface Person {
  name: string
  email: string
}

/** A suggested co-author, from `git shortlog -sne`: everyone who has committed, busiest first. */
export interface CoAuthorCandidate extends Person {
  commits: number
}

const TRAILER = /^co-authored-by:\s*(.+?)\s*<([^<>\s]+)>\s*$/i

export function formatPerson(p: Person): string {
  return `${p.name} <${p.email}>`
}

/** Parses "Name <email>", as typed into the co-author picker. */
export function parsePerson(text: string): Person | null {
  const m = /^\s*(.+?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(text)
  return m ? { name: m[1], email: m[2] } : null
}

const sameEmail = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** The co-authors a message's trailers credit, once each, in order. */
export function parseCoAuthors(message: string): Person[] {
  const people: Person[] = []
  for (const line of message.split('\n')) {
    const m = TRAILER.exec(line.trim())
    if (m && !people.some((p) => sameEmail(p.email, m[2]))) people.push({ name: m[1], email: m[2] })
  }
  return people
}

/** The message without its co-author trailers, e.g. to show them as avatars instead. */
export function stripCoAuthors(message: string): string {
  return message
    .split('\n')
    .filter((line) => !TRAILER.test(line.trim()))
    .join('\n')
    .trimEnd()
}

/**
 * Appends a `Co-authored-by:` trailer, after a blank line when the message's
 * last paragraph isn't already trailers (git and GitHub only read trailers
 * from the final paragraph). Someone already credited isn't added twice.
 */
export function addCoAuthor(message: string, person: Person): string {
  if (parseCoAuthors(message).some((p) => sameEmail(p.email, person.email))) return message
  const trailer = `Co-authored-by: ${formatPerson(person)}`
  const body = message.trimEnd()
  if (!body) return `\n\n${trailer}`
  // The subject is never trailers, even "fix: typo".
  const paragraphs = body.split(/\n\s*\n/)
  const isTrailers = paragraphs.length > 1 && paragraphs.at(-1)!.split('\n').every((line) => /^[\w-]+:\s/.test(line))
  return `${body}${isTrailers ? '\n' : '\n\n'}${trailer}`
}

/** Drops one co-author's trailer. */
export function removeCoAuthor(message: string, email: string): string {
  const lines = message.split('\n').filter((line) => {
    const m = TRAILER.exec(line.trim())
    return !(m && sameEmail(m[2], email))
  })
  // Don't leave the blank line that separated the trailers dangling.
  return lines.join('\n').trimEnd()
}

/** Whether a message has more than its co-author trailers, i.e. something to commit with. */
export function hasMessage(message: string): boolean {
  return stripCoAuthors(message).trim().length > 0
}

/** Parses `git shortlog -sne` output: "   12\tAda Lovelace <ada@example.com>". */
export function parseShortlog(out: string): CoAuthorCandidate[] {
  const byEmail = new Map<string, CoAuthorCandidate>()
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(.+?)\s*<([^<>]*)>\s*$/.exec(line)
    if (!m || !m[3]) continue
    const key = m[3].toLowerCase()
    const commits = Number(m[1])
    const known = byEmail.get(key)
    // One person under two spellings of their name: keep the busier one.
    if (known) {
      if (commits > known.commits) known.name = m[2]
      known.commits += commits
    } else byEmail.set(key, { name: m[2], email: m[3], commits })
  }
  return [...byEmail.values()].sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name))
}

/** Candidates whose name or email contains the query, ignoring case. */
export function filterCandidates<T extends Person>(people: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return people
  return people.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
}
