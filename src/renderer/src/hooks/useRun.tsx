import { useState, type RefObject } from 'react'
import type { RunMode } from '../../../shared/run'
import { expandCommand, type CommandTarget, type CustomCommand } from '../../../shared/customCommands'
import type { TerminalPanelHandle } from '../components/TerminalPanel'
import type { PromptRequest } from '../components/PromptDialog'
import { parseCopyPatterns } from '../../../shared/runDetect'
import { repoDisplayName } from '../lib/repoName'
import { loadRunMode, saveRunMode } from '../lib/preferences'
import type { Selection } from '../lib/selection'
import type { GitRunner } from './useGitRunner'
import type { Repo } from './useRepo'
import { useRepoValue } from './useRepoValue'

/** Identifies a repo's run in the terminal: its working tree, or its isolated checkout. */
const runKey = (repoPath: string, isolated: boolean): string => `${repoPath}\0${isolated ? 'isolated' : 'tree'}`

/**
 * The Run button: the repo's run command, which commit it runs (the selected
 * one, in isolation or checked out, or the working tree), and the runs going
 * in the terminal. `terminalRef` is the TerminalPanel's; give it
 * `setRunningKeys` as its onRunningChange.
 */
export function useRun({
  repo,
  git,
  selection,
  hasWorkingChanges,
  askText,
  showError,
  showTerminal,
  terminalRef
}: {
  repo: Repo
  git: GitRunner
  selection: Selection
  hasWorkingChanges: boolean
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string | null) => void
  showTerminal: () => void
  terminalRef: RefObject<TerminalPanelHandle | null>
}) {
  const { repoPath, headHash, refresh } = repo
  const [runningKeys, setRunningKeys] = useState<string[]>([])
  const [mode, setMode] = useState<RunMode>(loadRunMode)
  const [preparing, setPreparing] = useState(false)
  // The repo's saved Run command, or null until one is set.
  const [command, setCommand] = useRepoValue('run-command', repoPath, async (path) => (await window.api.getRunCommand(path)).command, null)

  // The commit Run acts on: the selected one, if just one is selected. A
  // clean HEAD is just the working tree, so that runs in the repo.
  const commit =
    selection.type === 'commit' && !(selection.hash === headHash && !hasWorkingChanges) ? selection.hash : null
  const isolated = !!commit && mode === 'isolated'
  const running = !!repoPath && runningKeys.includes(runKey(repoPath, isolated))

  /** Asks for the repo's run command (prefilled with the current one or a guess) and saves it. */
  const editCommand = async (): Promise<string | null> => {
    if (!repoPath) return null
    const { command: current, suggestion, suggestions } = await window.api.getRunCommand(repoPath)
    const next = await askText({
      title: 'Run command',
      label: `Command to run in ${repoDisplayName(repoPath)}`,
      defaultValue: current ?? suggestion,
      placeholder: 'npm run dev, ./gradlew bootRun, dotnet run',
      submitLabel: 'Save',
      suggestions: suggestions.map((s) => ({ value: s.command, label: s.label })),
      hint: 'Runs in your login shell, so tools set up in your shell profile (JAVA_HOME, ANDROID_HOME, dotnet, nvm) are found.'
    })
    if (next == null) return null
    const res = await window.api.setRunCommand(repoPath, next)
    if (!res.ok) {
      showError(res.error)
      return null
    }
    setCommand(repoPath, next)
    return next
  }

  /**
   * Asks which extra untracked files (beyond .env*, local.properties and
   * appsettings.*.json) an isolated run copies into its checkout, and saves them.
   */
  const editCopyFiles = async (): Promise<void> => {
    if (!repoPath) return
    const current = await window.api.getRunCopyFiles(repoPath)
    const next = await askText({
      title: 'Files to copy into isolated runs',
      label: 'Untracked files, comma separated, relative to the repository',
      defaultValue: current.join(', '),
      placeholder: 'app/google-services.json, config/*.local.yml',
      submitLabel: 'Save',
      hint: 'Always copied when untracked: .env*, local.properties, keystore.properties and appsettings.*.json, in the run folder and the folder the command changes into. Use * in a file name to match several.',
      allowEmpty: true
    })
    if (next == null) return
    const res = await window.api.setRunCopyFiles(repoPath, parseCopyPatterns(next))
    if (!res.ok) showError(res.error)
  }

  /**
   * Runs the repo's run command. With a commit selected it runs that commit:
   * in isolation (a separate checkout, leaving the working tree alone), or by
   * checking it out here first. Otherwise it runs the working tree as it is.
   */
  const run = async (runMode: RunMode = mode): Promise<void> => {
    if (!repoPath || preparing) return
    if (runMode !== mode) {
      setMode(runMode)
      saveRunMode(runMode)
    }
    const repoAtStart = repoPath
    const script = (await window.api.getRunCommand(repoAtStart)).command ?? (await editCommand())
    if (!script) return
    const target = commit
    const inIsolation = !!target && runMode === 'isolated'
    if (target && !inIsolation && target !== headHash) {
      if (hasWorkingChanges) {
        showError('Commit or stash your changes before checking out another commit, or choose Run in isolation.')
        return
      }
      let checkedOut = false
      await git.withBusy(async () => {
        const res = await window.api.checkout(repoAtStart, target)
        if (!res.ok) showError(res.error)
        else checkedOut = true
        await refresh(repoAtStart)
      })
      if (!checkedOut) return
    }
    setPreparing(true)
    showError(null)
    try {
      const res = await window.api.planRun(repoAtStart, inIsolation ? target : null)
      if (!res.ok) {
        showError(res.error)
        return
      }
      const name = repoDisplayName(repoAtStart)
      terminalRef.current?.startRun({
        key: runKey(repoAtStart, inIsolation),
        title: inIsolation ? `Run ${name} @ ${target!.slice(0, 7)} (isolated)` : `Run ${name}`,
        cwd: res.data.cwd,
        script: res.data.script
      })
      showTerminal()
    } finally {
      setPreparing(false)
    }
  }

  /** Runs a custom command on `target` in its own terminal tab, which a rerun of it replaces. */
  const runCustom = (custom: CustomCommand, target: Omit<CommandTarget, 'repo' | 'currentBranch'>): void => {
    if (!repoPath) return
    let script: string
    try {
      script = expandCommand(custom.command, { ...target, repo: repoPath, currentBranch: repo.status?.branch ?? null })
    } catch (err) {
      showError(`${custom.name}: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    showError(null)
    terminalRef.current?.startRun({ key: `${repoPath}\0custom\0${custom.id}`, title: custom.name, cwd: repoPath, script })
    showTerminal()
  }

  const stop = (): void => {
    if (repoPath) terminalRef.current?.stopRun(runKey(repoPath, isolated))
  }

  return { setRunningKeys, command, commit, mode, running, preparing, editCommand, editCopyFiles, run, runCustom, stop }
}

export type Run = ReturnType<typeof useRun>
