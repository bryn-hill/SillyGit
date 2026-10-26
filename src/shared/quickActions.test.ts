import { describe, expect, it } from 'vitest'
import {
  applyPrefix,
  buildPullRequestText,
  bumpVersion,
  humanizeBranch,
  suggestCommitMessages,
  withPullRequestText
} from './quickActions'

function fileDiff(path: string, removed: string[], added: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    'index 111..222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,5 +1,5 @@',
    ' {',
    ...removed.map((l) => `-${l}`),
    ...added.map((l) => `+${l}`),
    ' }'
  ].join('\n')
}

describe('suggestCommitMessages', () => {
  it('spots a version bump in package.json and its lockfile', () => {
    const diff = [
      fileDiff('package.json', ['  "version": "0.1.0",'], ['  "version": "0.2.0",']),
      fileDiff('package-lock.json', ['  "version": "0.1.0",', '      "version": "0.1.0",'], ['  "version": "0.2.0",', '      "version": "0.2.0",'])
    ].join('\n')
    const [first, second] = suggestCommitMessages(diff)
    expect(first.message).toBe('chore: bump version to 0.2.0')
    expect(second.message).toBe('chore(release): v0.2.0')
  })

  it('names a single dependency bump', () => {
    const diff = fileDiff('package.json', ['    "react": "^19.3.0",'], ['    "react": "^19.3.1",'])
    expect(suggestCommitMessages(diff)[0].message).toBe('chore(deps): bump react from ^19.3.0 to ^19.3.1')
  })

  it('lists several dependency changes in the body', () => {
    const diff = fileDiff(
      'package.json',
      ['    "react": "^19.3.0",', '    "lodash": "^4.0.0",'],
      ['    "react": "^19.3.1",', '    "zod": "^3.0.0",']
    )
    const [s] = suggestCommitMessages(diff)
    expect(s.message).toBe('chore(deps): update 3 dependencies\n\n- react: ^19.3.0 → ^19.3.1\n- add zod ^3.0.0\n- remove lodash')
  })

  it('handles Cargo.toml versions', () => {
    const diff = fileDiff('Cargo.toml', ['version = "1.2.3"'], ['version = "1.2.4"'])
    expect(suggestCommitMessages(diff)[0].message).toBe('chore: bump version to 1.2.4')
  })

  it('offers nothing for a manifest edit that is not a version or dependency', () => {
    const diff = fileDiff('package.json', ['    "build": "vite build",'], ['    "build": "electron-vite build",'])
    expect(suggestCommitMessages(diff)).toEqual([])
  })

  it('offers nothing when a bump comes with code changes', () => {
    const diff = [
      fileDiff('package.json', ['  "version": "0.1.0",'], ['  "version": "0.2.0",']),
      fileDiff('src/index.ts', ['a'], ['b'])
    ].join('\n')
    expect(suggestCommitMessages(diff)).toEqual([])
  })

  it('recognises lockfile-only, docs, tests and CI changes', () => {
    expect(suggestCommitMessages(fileDiff('yarn.lock', ['a'], ['b']))[0].message).toBe('chore(deps): update yarn.lock')
    expect(suggestCommitMessages(fileDiff('README.md', ['a'], ['b']))[0].message).toBe('docs: update README.md')
    expect(suggestCommitMessages(fileDiff('src/x.test.ts', ['a'], ['b']))[0].message).toBe('test: update x.test.ts')
    expect(suggestCommitMessages(fileDiff('.github/workflows/ci.yml', ['a'], ['b']))[0].message).toBe('ci: update ci.yml')
  })
})

describe('bumpVersion', () => {
  it('bumps each part and resets the lower ones', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(bumpVersion('1.2.3-beta.1', 'patch')).toBe('1.2.4')
    expect(bumpVersion('next', 'patch')).toBeNull()
  })
})

describe('applyPrefix', () => {
  it('replaces an existing conventional prefix', () => {
    expect(applyPrefix('fix(ui): tidy up', 'chore')).toBe('chore: tidy up')
    expect(applyPrefix('tidy up', 'docs')).toBe('docs: tidy up')
  })
})

describe('pull request text', () => {
  it('uses a lone commit as the title and body', () => {
    expect(buildPullRequestText([{ hash: 'abc1234def', subject: 'chore: bump version to 0.2.0', body: 'Why\n' }], 'x')).toEqual({
      title: 'chore: bump version to 0.2.0',
      body: 'Why'
    })
  })

  it('titles several commits from the branch and lists them oldest first', () => {
    const text = buildPullRequestText(
      [
        { hash: '2222222aaaa', subject: 'Second', body: '' },
        { hash: '1111111aaaa', subject: 'First', body: '' }
      ],
      'claude/fix-safari_export'
    )
    expect(text.title).toBe('Fix safari export')
    expect(text.body).toBe('## Commits\n\n- First (1111111)\n- Second (2222222)')
  })

  it('titles a release branch by its version', () => {
    const text = buildPullRequestText(
      [
        { hash: 'b'.repeat(40), subject: 'chore: bump version to 1.4.0', body: '' },
        { hash: 'a'.repeat(40), subject: 'docs: changelog', body: '' }
      ],
      'release'
    )
    expect(text.title).toBe('chore(release): v1.4.0')
  })

  it('adds the text to the compare URL', () => {
    expect(withPullRequestText('https://github.com/o/r/compare/main...x?expand=1', { title: 'A & B', body: 'c d' })).toBe(
      'https://github.com/o/r/compare/main...x?expand=1&title=A%20%26%20B&body=c%20d'
    )
    expect(humanizeBranch('main')).toBe('Main')
  })
})
