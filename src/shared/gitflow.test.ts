import { describe, expect, it } from 'vitest'
import {
  classifyGitFlowBranch,
  defaultGitFlowConfig,
  gitFlowBase,
  gitFlowConfigProblem,
  parseGitFlowConfig,
  type GitFlowConfig
} from './gitflow'

const config: GitFlowConfig = defaultGitFlowConfig(['main', 'feature/x'])

describe('git-flow config', () => {
  it('defaults to the production branch the repo has', () => {
    expect(config.master).toBe('main')
    expect(defaultGitFlowConfig(['master']).master).toBe('master')
    expect(config).toMatchObject({ develop: 'develop', prefixes: { feature: 'feature/', release: 'release/', hotfix: 'hotfix/' }, versionTag: '' })
  })

  it('reads git-flow (AVH) config keys, and is unset until both branches are named', () => {
    expect(parseGitFlowConfig({ 'gitflow.branch.master': 'main' })).toBeNull()
    expect(
      parseGitFlowConfig({
        'gitflow.branch.master': 'production',
        'gitflow.branch.develop': 'dev',
        'gitflow.prefix.feature': 'feat-',
        'gitflow.prefix.versiontag': 'v'
      })
    ).toEqual({
      master: 'production',
      develop: 'dev',
      prefixes: { feature: 'feat-', release: 'release/', hotfix: 'hotfix/' },
      versionTag: 'v'
    })
  })

  it('refuses configs git-flow could not tell apart', () => {
    expect(gitFlowConfigProblem(config)).toBeNull()
    expect(gitFlowConfigProblem({ ...config, develop: 'main' })).toMatch(/must be different/)
    expect(gitFlowConfigProblem({ ...config, prefixes: { ...config.prefixes, hotfix: 'release/' } })).toMatch(/own prefix/)
    expect(gitFlowConfigProblem({ ...config, prefixes: { ...config.prefixes, feature: ' ' } })).toMatch(/needs a value/)
  })
})

describe('git-flow branches', () => {
  it('classifies branches by prefix', () => {
    expect(classifyGitFlowBranch(config, 'feature/login')).toEqual({ kind: 'feature', name: 'login' })
    expect(classifyGitFlowBranch(config, 'release/1.2.0')).toEqual({ kind: 'release', name: '1.2.0' })
    expect(classifyGitFlowBranch(config, 'hotfix/1.2.1')).toEqual({ kind: 'hotfix', name: '1.2.1' })
    expect(classifyGitFlowBranch(config, 'feature/')).toBeNull()
    expect(classifyGitFlowBranch(config, 'develop')).toBeNull()
  })

  it('starts hotfixes from production and everything else from develop', () => {
    expect(gitFlowBase(config, 'feature')).toBe('develop')
    expect(gitFlowBase(config, 'release')).toBe('develop')
    expect(gitFlowBase(config, 'hotfix')).toBe('main')
  })
})
