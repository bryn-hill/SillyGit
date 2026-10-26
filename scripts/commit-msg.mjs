#!/usr/bin/env node
// Checks commit messages against the Conventional Commits style used in this
// repo (see CONTRIBUTING.md). No dependencies, so the git hook and CI can run
// it before `npm ci`.
//
//   node scripts/commit-msg.mjs <message-file>    used by .githooks/commit-msg
//   node scripts/commit-msg.mjs --range <a>..<b>  checks every commit in a range
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'style', 'test', 'docs', 'build', 'ci', 'chore', 'revert']
export const MAX_HEADER = 100

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9][a-z0-9-]*)\))?(?<breaking>!)?: (?<subject>.+)$/
// Messages git or GitHub writes for us.
const EXEMPT = /^(Merge (pull request|branch|remote-tracking branch)|Revert "|fixup! |squash! |amend! )/

/** Returns the problems with a commit message, or [] when it is fine. */
export function lintCommitMessage(message) {
  const lines = message
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim()
    .split('\n')
  const header = lines[0] ?? ''
  if (EXEMPT.test(header)) return []

  const errors = []
  const m = HEADER.exec(header)
  if (!m) {
    errors.push(`header must look like "type(scope): subject", got "${header}"`)
  } else {
    const { type, subject } = m.groups
    if (!TYPES.includes(type)) errors.push(`unknown type "${type}", use one of: ${TYPES.join(', ')}`)
    if (/^[A-Z]/.test(subject)) errors.push('subject must start with a lowercase letter')
    if (/\.$/.test(subject)) errors.push('subject must not end with a period')
  }
  if (header.length > MAX_HEADER) errors.push(`header is ${header.length} characters, keep it to ${MAX_HEADER}`)
  if (lines.length > 1 && lines[1].trim() !== '') errors.push('leave a blank line between the header and the body')
  return errors
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function main(argv) {
  let commits
  if (argv[0] === '--range') {
    const shas = git('rev-list', '--no-merges', argv[1]).split('\n').filter(Boolean)
    commits = shas.map((sha) => ({ label: sha.slice(0, 7), message: git('log', '-1', '--format=%B', sha) }))
  } else if (argv[0]) {
    commits = [{ label: 'commit message', message: readFileSync(argv[0], 'utf8') }]
  } else {
    console.error('usage: commit-msg.mjs <message-file> | --range <a>..<b>')
    return 2
  }

  let failed = 0
  for (const { label, message } of commits) {
    const errors = lintCommitMessage(message)
    if (errors.length === 0) continue
    failed++
    console.error(`✖ ${label}: ${message.split('\n')[0]}`)
    for (const e of errors) console.error(`    ${e}`)
  }
  if (failed) {
    console.error('\nCommit messages follow Conventional Commits, e.g. "fix(graph): keep selection on refresh".')
    console.error('See CONTRIBUTING.md for the types and scopes.')
    return 1
  }
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)))
