import { useEffect, useState } from 'react'
import {
  classifyGitFlowBranch,
  defaultGitFlowConfig,
  gitFlowBase,
  type GitFlowConfig,
  type GitFlowKind
} from '../../../shared/gitflow'
import type { BranchInfo } from '../../../shared/types'
import type { PromptRequest } from '../components/PromptDialog'
import type { GitRunner } from './useGitRunner'
import type { MainView } from './useMainView'

/** The repo's git-flow settings, reloaded whenever `refreshKey` changes (each repo refresh). */
function useGitFlowConfig(repoPath: string | null, refreshKey: unknown): [GitFlowConfig | null, (config: GitFlowConfig) => void] {
  const [loaded, setLoaded] = useState<{ repoPath: string; config: GitFlowConfig | null } | null>(null)
  useEffect(() => {
    if (!repoPath) return
    let current = true
    window.api.gitFlowConfig(repoPath).then((res) => {
      if (current) setLoaded({ repoPath, config: res.ok ? res.data : null })
    })
    return () => {
      current = false
    }
  }, [repoPath, refreshKey])
  const set = (config: GitFlowConfig): void => {
    if (repoPath) setLoaded({ repoPath, config })
  }
  // Another repo's settings never show while this one's load.
  return [loaded?.repoPath === repoPath ? loaded.config : null, set]
}

/**
 * git-flow: setting it up (the settings dialog), and starting and finishing
 * feature, release and hotfix branches from the branch menu and the palette.
 */
export function useGitFlow({
  repoPath,
  branches,
  git,
  view,
  askText,
  setNotice
}: {
  repoPath: string | null
  branches: BranchInfo[]
  git: GitRunner
  view: MainView
  askText: (request: PromptRequest) => Promise<string | null>
  setNotice: (message: string | null) => void
}) {
  const [config, setConfig] = useGitFlowConfig(repoPath, branches)
  /** The settings the setup dialog opens with, while it's open. */
  const [setup, setSetup] = useState<GitFlowConfig | null>(null)
  const { runGit, runGitThen } = git

  const openSetup = (): void =>
    setSetup(config ?? defaultGitFlowConfig(branches.filter((b) => !b.remote).map((b) => b.name)))

  const saveSetup = (next: GitFlowConfig): void => {
    setSetup(null)
    runGit(
      (path) => window.api.initGitFlow(path, next),
      (res) => {
        setConfig(next)
        setNotice(
          res.createdDevelop
            ? `git-flow is set up. Created ${next.develop} from ${next.master}.`
            : `git-flow is set up with ${next.master} and ${next.develop}.`
        )
      }
    )
  }

  const start = async (kind: GitFlowKind): Promise<void> => {
    if (!config) return
    const prefix = config.prefixes[kind]
    const name = await askText({
      title: `Start ${kind} from ${gitFlowBase(config, kind)}`,
      label: `Name (the branch becomes ${prefix}…)`,
      placeholder: kind === 'feature' ? 'e.g. login-page' : 'e.g. 1.2.0',
      submitLabel: `Start ${kind}`
    })
    if (name) runGit((path) => window.api.startGitFlowBranch(path, kind, name), (branch) => setNotice(`Started ${branch}.`))
  }

  /** Merges `branch` where git-flow says, after asking (releases and hotfixes ask for the tag message). */
  const finish = async (branch: string): Promise<void> => {
    const flow = config && classifyGitFlowBranch(config, branch)
    if (!config || !flow) return
    let tagMessage: string | undefined
    if (flow.kind === 'feature') {
      const ok = window.confirm(
        `Finish ${branch}? It's merged into ${config.develop} with a merge commit, then the branch is deleted.`
      )
      if (!ok) return
    } else {
      const tag = config.versionTag + flow.name
      const message = await askText({
        title: `Finish ${flow.kind} ${flow.name}`,
        label: `Message for tag ${tag}`,
        defaultValue: `${flow.kind === 'release' ? 'Release' : 'Hotfix'} ${flow.name}`,
        submitLabel: `Finish ${flow.kind}`
      })
      if (message === null) return
      tagMessage = message
    }
    runGitThen(
      (path) => window.api.finishGitFlowBranch(path, branch, tagMessage),
      (res) => {
        if (res.conflictsIn) {
          view.showConflicts()
          setNotice(
            `Finishing ${branch} stopped with conflicts merging into ${res.conflictsIn}. Resolve them and commit the merge, then finish ${branch} again.`
          )
          return
        }
        const tagged = res.tag ? `, tagged ${res.tag}` : ''
        setNotice(`Finished ${branch}: merged into ${res.mergedInto.join(' and ')}${tagged}, and deleted it.`)
      }
    )
  }

  const actions: GitFlowActions = { gitFlowConfig: config, startGitFlow: start, finishGitFlow: finish }

  return { config, setup, openSetup, saveSetup, closeSetup: () => setSetup(null), actions }
}

/** git-flow's branch menu and palette entries. */
export interface GitFlowActions {
  /** The repo's git-flow settings, or null when it isn't set up. */
  gitFlowConfig: GitFlowConfig | null
  startGitFlow: (kind: GitFlowKind) => void
  finishGitFlow: (branch: string) => void
}

export type GitFlow = ReturnType<typeof useGitFlow>
