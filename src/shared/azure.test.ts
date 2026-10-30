import { describe, expect, it } from 'vitest'
import { parseRemoteUrl } from './accounts'
import {
  azureNewPullRequestUrl,
  azureWebUrl,
  branchFromRef,
  isAzureHost,
  isAzureWebUrl,
  parseAzureRemote,
  reviewDecisionFromVotes,
  voteLabel
} from './azure'

const fromUrl = (url: string): ReturnType<typeof parseAzureRemote> => {
  const loc = parseRemoteUrl(url)
  return loc && parseAzureRemote(loc.host, loc.path)
}

describe('parseAzureRemote', () => {
  const site = { organization: 'contoso', project: 'Web', name: 'site' }

  it.each([
    'https://dev.azure.com/contoso/Web/_git/site',
    'https://contoso@dev.azure.com/contoso/Web/_git/site',
    'git@ssh.dev.azure.com:v3/contoso/Web/site',
    'ssh://git@ssh.dev.azure.com/v3/contoso/Web/site',
    'https://contoso.visualstudio.com/Web/_git/site',
    'https://contoso.visualstudio.com/DefaultCollection/Web/_git/site',
    'contoso@vs-ssh.visualstudio.com:v3/contoso/Web/site'
  ])('reads %s', (url) => {
    expect(fromUrl(url)).toEqual(site)
  })

  it('decodes names with spaces', () => {
    expect(fromUrl('https://dev.azure.com/contoso/Web%20Site/_git/My%20Repo')).toEqual({
      organization: 'contoso',
      project: 'Web Site',
      name: 'My Repo'
    })
  })

  it('ignores other hosts and partial paths', () => {
    expect(fromUrl('https://github.com/owner/repo')).toBeNull()
    expect(fromUrl('https://dev.azure.com/contoso/Web')).toBeNull()
    expect(fromUrl('git@ssh.dev.azure.com:v2/contoso/Web/site')).toBeNull()
  })
})

describe('web addresses', () => {
  it('links the repository, encoding each part', () => {
    expect(azureWebUrl({ organization: 'contoso', project: 'Web Site', name: 'site' })).toBe(
      'https://dev.azure.com/contoso/Web%20Site/_git/site'
    )
  })

  it('opens the new pull request form with the branches picked', () => {
    expect(azureNewPullRequestUrl('https://dev.azure.com/c/p/_git/r', 'feature/x', 'main')).toBe(
      'https://dev.azure.com/c/p/_git/r/pullrequestcreate?sourceRef=feature%2Fx&targetRef=main'
    )
  })

  it('knows Azure DevOps hosts', () => {
    expect(isAzureHost('dev.azure.com')).toBe(true)
    expect(isAzureHost('contoso.visualstudio.com')).toBe(true)
    expect(isAzureHost('github.com')).toBe(false)
    expect(isAzureWebUrl('https://dev.azure.com/c/p/_git/r')).toBe(true)
    expect(isAzureWebUrl('https://github.com/a/b')).toBe(false)
    expect(isAzureWebUrl(null)).toBe(false)
  })
})

describe('votes', () => {
  it('reads the review decision GitHub-style', () => {
    expect(reviewDecisionFromVotes([])).toBe('')
    expect(reviewDecisionFromVotes([0, 0])).toBe('REVIEW_REQUIRED')
    expect(reviewDecisionFromVotes([10, 0])).toBe('APPROVED')
    expect(reviewDecisionFromVotes([5])).toBe('APPROVED')
    expect(reviewDecisionFromVotes([10, -5])).toBe('CHANGES_REQUESTED')
    expect(reviewDecisionFromVotes([-10])).toBe('CHANGES_REQUESTED')
  })

  it('labels each vote as the website does', () => {
    expect([10, 5, 0, -5, -10].map(voteLabel)).toEqual([
      'Approved',
      'Approved with suggestions',
      'No vote',
      'Waiting for author',
      'Rejected'
    ])
  })

  it('strips refs/heads/', () => {
    expect(branchFromRef('refs/heads/feature/x')).toBe('feature/x')
  })
})
