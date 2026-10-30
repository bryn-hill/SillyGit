import { remoteNameProblem, suggestRemoteName } from '../../../shared/remotes'
import type { RepoRemote } from '../../../shared/types'
import type { PromptRequest } from '../components/PromptDialog'
import type { SidebarListActions } from '../components/SidebarLists'
import type { GitRunner } from './useGitRunner'

export type RemoteActions = Pick<SidebarListActions, 'fetchRemote' | 'addRemote' | 'renameRemote' | 'editRemoteUrl' | 'removeRemote'>

/** Adding, renaming, re-pointing, removing and fetching remotes, from the side bar's Remotes list. */
export function useRemoteActions({
  remotes,
  git,
  askText,
  showError,
  setNotice
}: {
  remotes: RepoRemote[]
  git: GitRunner
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string) => void
  setNotice: (message: string | null) => void
}): RemoteActions {
  const { runGit } = git
  const names = remotes.map((r) => r.name)

  const fetchRemote = (name: string): void =>
    runGit(
      (path) => window.api.fetchRemote(path, name),
      () => setNotice(`Fetched ${name}.`)
    )

  const addRemote = async (): Promise<void> => {
    const name = await askText({
      title: 'Add remote',
      label: 'Name',
      defaultValue: suggestRemoteName(names),
      hint: 'Call the repository you forked from "upstream".',
      submitLabel: 'Next'
    })
    if (name === null) return
    const problem = remoteNameProblem(name, names)
    if (problem) return showError(problem)
    const url = await askText({
      title: `Add remote ${name.trim()}`,
      label: 'URL',
      placeholder: 'https://github.com/owner/repo.git',
      submitLabel: 'Add and fetch'
    })
    if (!url?.trim()) return
    runGit(
      async (path) => {
        const added = await window.api.addRemote(path, name, url)
        if (!added.ok) return added
        const fetched = await window.api.fetchRemote(path, name.trim())
        return fetched.ok ? fetched : { ok: false as const, error: `Added ${name.trim()}, but fetching it failed: ${fetched.error}` }
      },
      () => setNotice(`Added and fetched ${name.trim()}.`)
    )
  }

  const renameRemote = async (remote: RepoRemote): Promise<void> => {
    const newName = await askText({ title: `Rename ${remote.name}`, label: 'New name', defaultValue: remote.name, submitLabel: 'Rename' })
    if (newName === null || newName.trim() === remote.name) return
    const problem = remoteNameProblem(newName, names)
    if (problem) return showError(problem)
    runGit(
      (path) => window.api.renameRemote(path, remote.name, newName),
      () => setNotice(`Renamed ${remote.name} to ${newName.trim()}.`)
    )
  }

  const editRemoteUrl = async (remote: RepoRemote, push: boolean): Promise<void> => {
    const current = push ? remote.pushUrl : remote.url
    const url = await askText({
      title: `${push ? 'Push URL' : 'URL'} for ${remote.name}`,
      label: push ? 'Push URL' : remote.pushUrl ? 'Fetch URL' : 'URL',
      defaultValue: current ?? '',
      submitLabel: 'Save'
    })
    if (!url?.trim() || url.trim() === current) return
    runGit(
      (path) => window.api.setRemoteUrl(path, remote.name, url, push),
      () => setNotice(`Changed the ${push ? 'push URL' : 'URL'} of ${remote.name}.`)
    )
  }

  const removeRemote = (remote: RepoRemote): void => {
    const question =
      `Remove the remote ${remote.name}? Its remote branches go from the list and local branches tracking it stop tracking. ` +
      'Nothing on the server is deleted.'
    if (window.confirm(question)) {
      runGit(
        (path) => window.api.removeRemote(path, remote.name),
        () => setNotice(`Removed ${remote.name}.`)
      )
    }
  }

  return { fetchRemote, addRemote, renameRemote, editRemoteUrl, removeRemote }
}
