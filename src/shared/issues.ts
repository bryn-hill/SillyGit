// Starting work from an issue: the branch is named `<number>-<slug>` after
// it, and the issue number is kept in the branch's git config so the pull
// request for it can say "Closes #N".

/** `branch.<name>.<key>`: the issue the branch was started from. */
export const ISSUE_KEY = 'sillygit-issue'

const MAX_SLUG = 40

/** "Fix the Safari export button!" -> "fix-the-safari-export-button", cut at a word within 40 characters. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= MAX_SLUG) return slug
  const cut = slug.slice(0, MAX_SLUG + 1)
  const lastDash = cut.lastIndexOf('-')
  return (lastDash > 0 ? cut.slice(0, lastDash) : slug.slice(0, MAX_SLUG)).replace(/-+$/, '')
}

/** The branch "Start work" offers for an issue, e.g. "42-fix-safari-export". */
export function issueBranchName(number: number, title: string): string {
  const slug = slugify(title)
  return slug ? `${number}-${slug}` : `issue-${number}`
}

/** Adds "Closes #N" to a pull request body, unless it already closes or fixes that issue. */
export function withClosingIssue(body: string, number: number): string {
  const already = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${number}\\b`, 'i')
  if (already.test(body)) return body
  const trimmed = body.trimEnd()
  return trimmed ? `${trimmed}\n\nCloses #${number}` : `Closes #${number}`
}
