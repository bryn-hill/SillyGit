import { describe, expect, it } from 'vitest'
import { formatCommand, isLoggedCommand, redactUrl } from './activity'

describe('isLoggedCommand', () => {
  it('logs commands that change the repo', () => {
    for (const args of [
      ['commit', '-m', 'x'],
      ['checkout', 'main'],
      ['stash', 'push'],
      ['branch', '-d', 'old'],
      ['tag', 'v1', 'abc'],
      ['pull', '--rebase'],
      ['apply', '--3way', 'x.patch']
    ]) {
      expect(isLoggedCommand(args)).toBe(true)
    }
  })

  it('leaves out reads', () => {
    for (const args of [
      ['status', '--porcelain'],
      ['log', '-1'],
      ['stash', 'list'],
      ['remote', '-v'],
      ['remote'],
      ['branch', '--points-at', 'HEAD'],
      ['config', '--get', 'user.name'],
      ['worktree', 'list'],
      ['apply', '--check', 'x.patch']
    ]) {
      expect(isLoggedCommand(args)).toBe(false)
    }
  })
})

describe('formatCommand', () => {
  it('quotes arguments with spaces and shows only the first line of messages', () => {
    expect(formatCommand(['commit', '-m', 'Fix the "thing"\n\nLong body'])).toBe('git commit -m "Fix the \\"thing\\"…"')
    expect(formatCommand(['checkout', 'feature/x'])).toBe('git checkout feature/x')
  })

  it('hides tokens in URLs', () => {
    expect(redactUrl('https://bryn:ghp_secret@github.com/a/b.git')).toBe('https://***@github.com/a/b.git')
    expect(formatCommand(['clone', 'https://x:y@host/r.git', '/tmp/r'])).toBe('git clone https://***@host/r.git /tmp/r')
    expect(redactUrl('git@github.com:a/b.git')).toBe('git@github.com:a/b.git')
  })
})
