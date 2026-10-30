import { useState, type RefObject } from 'react'
import { bisectRunScript, type BisectState, type BisectVerdict } from '../../../shared/bisect'
import { commandsFor, expandCommand, type CustomCommand } from '../../../shared/customCommands'
import type { TerminalPanelHandle } from '../components/TerminalPanel'
import type { PromptRequest } from '../components/PromptDialog'
import type { IpcResult } from '../lib/ipc'
import type { GitRunner } from './useGitRunner'
import type { Repo } from './useRepo'

/** A command that can decide each commit of a bisect, offered in the banner's Run menu. */
export interface BisectCommandChoice {
  id: string
  label: string
  /** The shell command, already expanded; null asks for one. */
  command: string | null
}

/**
 * Guided bisect: starting from a commit's right-click menu, marking commits
 * good, bad or skipped, letting a command decide them (`git bisect run`, in
 * the terminal), and resetting. When bisect finds the first bad commit it is
 * selected in the graph.
 */
export function useBisect({
  repo,
  git,
  selectCommit,
  askText,
  showError,
  runCommand,
  customCommands,
  showTerminal,
  terminalRef
}: {
  repo: Repo
  git: GitRunner
  /** Selects a commit in the graph, loading more history if it isn't loaded yet. */
  selectCommit: (hash: string) => void
  askText: (request: PromptRequest) => Promise<string | null>
  showError: (message: string | null) => void
  /** The repo's Run command, if it has one. */
  runCommand: string | null
  customCommands: CustomCommand[]
  showTerminal: () => void
  terminalRef: RefObject<TerminalPanelHandle | null>
}) {
  const { repoPath, bisect: state, refresh } = repo
  // The last command typed in for a bisect run, to offer again.
  const [lastCommand, setLastCommand] = useState('')
  const [runningPath, setRunningPath] = useState<string | null>(null)
  const running = !!repoPath && runningPath === repoPath

  /** Runs a bisect step, refreshes, and selects the first bad commit if that step found it. */
  const step = (call: (path: string) => Promise<IpcResult<BisectState | null>>): void => {
    if (!repoPath) return
    const path = repoPath
    void git.withBusy(async () => {
      const res = await call(path)
      if (!res.ok) showError(res.error)
      await refresh(path)
      if (res.ok && res.data?.firstBad) selectCommit(res.data.firstBad)
    })
  }

  const start = (hash: string, verdict: 'bad' | 'good'): void =>
    step((path) => window.api.bisectStart(path, hash, verdict))

  /** Marks `hash`, or the commit being tested. */
  const mark = (verdict: BisectVerdict, hash?: string): void => step((path) => window.api.bisectMark(path, verdict, hash))

  const reset = (): void => git.runGit((path) => window.api.bisectReset(path))

  /** The commands the banner's Run menu offers: the Run command, the repo's custom commands, and one to type in. */
  const commandChoices = (): BisectCommandChoice[] => {
    const choices: BisectCommandChoice[] = []
    if (runCommand) choices.push({ id: 'run-command', label: `Run command: ${runCommand}`, command: runCommand })
    if (repoPath) {
      for (const custom of commandsFor(customCommands, 'repo')) {
        try {
          const command = expandCommand(custom.command, { repo: repoPath, currentBranch: null })
          choices.push({ id: `custom-${custom.id}`, label: custom.name, command })
        } catch {
          // It needs something a bisect doesn't have (the branch), so it isn't offered.
        }
      }
    }
    choices.push({ id: 'other', label: 'Other command…', command: null })
    return choices
  }

  /**
   * Lets `command` decide each remaining commit with `git bisect run`, in the
   * terminal so its output shows. With no command, asks for one first.
   */
  const runWith = async (command: string | null): Promise<void> => {
    if (!repoPath) return
    const path = repoPath
    const chosen =
      command ??
      (await askText({
        title: 'Run a command to decide',
        label: 'Exit 0 marks a commit good, 125 skips it, and 1 to 127 mark it bad',
        defaultValue: lastCommand,
        placeholder: 'npm test',
        submitLabel: 'Run'
      }))
    if (!chosen?.trim()) return
    if (command === null) setLastCommand(chosen)
    showError(null)
    setRunningPath(path)
    terminalRef.current?.startRun({
      key: `${path}\0bisect`,
      title: 'Bisect run',
      cwd: path,
      script: bisectRunScript(chosen.trim()),
      onExit: () => {
        setRunningPath((p) => (p === path ? null : p))
        void (async () => {
          await refresh(path)
          const res = await window.api.bisectState(path)
          if (res.ok && res.data?.firstBad) selectCommit(res.data.firstBad)
        })()
      }
    })
    showTerminal()
  }

  const stopRun = (): void => {
    if (repoPath) terminalRef.current?.stopRun(`${repoPath}\0bisect`)
  }

  return { state, running, start, mark, reset, commandChoices, runWith, stopRun }
}

export type Bisect = ReturnType<typeof useBisect>
