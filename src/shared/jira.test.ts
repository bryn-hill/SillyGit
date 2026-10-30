import { describe, expect, it } from 'vitest'
import {
  findJiraKeys,
  jiraBranchName,
  jiraKeyInBranch,
  splitJiraKeys,
  withJiraKeyInTitle,
  withJiraLink,
  type JiraSite
} from './jira'

const sites: JiraSite[] = [
  { host: 'acme.atlassian.net', projectKeys: ['PROJ', 'OPS2'] },
  { host: 'jira.example.com', projectKeys: ['WEB'] }
]

describe('splitJiraKeys', () => {
  it('marks keys of known projects with a link to their site', () => {
    expect(splitJiraKeys('fix: PROJ-12 and WEB-3, not UTF-8', sites)).toEqual([
      { text: 'fix: ' },
      { text: 'PROJ-12', key: 'PROJ-12', url: 'https://acme.atlassian.net/browse/PROJ-12' },
      { text: ' and ' },
      { text: 'WEB-3', key: 'WEB-3', url: 'https://jira.example.com/browse/WEB-3' },
      { text: ', not UTF-8' }
    ])
  })

  it('ignores keys inside longer words and lower-case ones', () => {
    expect(splitJiraKeys('XPROJ-1 PROJ-1a proj-1 [OPS2-9]', sites)).toEqual([
      { text: 'XPROJ-1 PROJ-1a proj-1 [' },
      { text: 'OPS2-9', key: 'OPS2-9', url: 'https://acme.atlassian.net/browse/OPS2-9' },
      { text: ']' }
    ])
  })

  it('leaves text alone without sites', () => {
    expect(splitJiraKeys('PROJ-1', [])).toEqual([{ text: 'PROJ-1' }])
    expect(splitJiraKeys('', sites)).toEqual([{ text: '' }])
  })
})

describe('findJiraKeys', () => {
  it('lists each key once', () => {
    expect(findJiraKeys('PROJ-1 PROJ-2 PROJ-1', sites).map((k) => k.key)).toEqual(['PROJ-1', 'PROJ-2'])
  })
})

describe('jiraKeyInBranch', () => {
  it('finds a known key in any case', () => {
    expect(jiraKeyInBranch('feature/proj-42-login', sites)).toEqual({
      key: 'PROJ-42',
      url: 'https://acme.atlassian.net/browse/PROJ-42'
    })
    expect(jiraKeyInBranch('WEB-7', sites)?.key).toBe('WEB-7')
  })

  it("doesn't take other dashed numbers for keys", () => {
    expect(jiraKeyInBranch('utf-8-fix', sites)).toBeNull()
    expect(jiraKeyInBranch('release-2026', sites)).toBeNull()
  })
})

describe('jiraBranchName', () => {
  it('puts the key before a slug of the summary', () => {
    expect(jiraBranchName('PROJ-123', 'Fix the Safari export button!')).toBe('PROJ-123-fix-the-safari-export-button')
    expect(jiraBranchName('PROJ-1', '!!!')).toBe('PROJ-1')
  })
})

describe('pull request text', () => {
  it('puts the key in front of the title once', () => {
    expect(withJiraKeyInTitle('Fix export', 'PROJ-1')).toBe('PROJ-1: Fix export')
    expect(withJiraKeyInTitle('PROJ-1 fix export', 'PROJ-1')).toBe('PROJ-1 fix export')
    expect(withJiraKeyInTitle('PROJ-10 fix', 'PROJ-1')).toBe('PROJ-1: PROJ-10 fix')
    expect(withJiraKeyInTitle('', 'PROJ-1')).toBe('PROJ-1')
  })

  it('links the issue at the end of the body once', () => {
    const url = 'https://acme.atlassian.net/browse/PROJ-1'
    expect(withJiraLink('', 'PROJ-1', url)).toBe(`Jira: [PROJ-1](${url})`)
    expect(withJiraLink('Body\n', 'PROJ-1', url)).toBe(`Body\n\nJira: [PROJ-1](${url})`)
    expect(withJiraLink(`See ${url}`, 'PROJ-1', url)).toBe(`See ${url}`)
  })
})
