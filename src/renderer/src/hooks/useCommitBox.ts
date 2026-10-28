import { useRef, useState } from 'react'
import type { OperationState } from '../../../shared/types'
import type { GitRunner } from './useGitRunner'

/** The commit message box on the WIP row, and Amend. */
export function useCommitBox({
  repoPath,
  operation,
  git,
  refresh,
  showError
}: {
  repoPath: string | null
  operation: OperationState | null
  git: GitRunner
  refresh: (path: string) => Promise<void>
  showError: (message: string) => void
}) {
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)

  // Prefill the message with git's prepared merge message, once per
  // operation, without overwriting anything the user typed.
  const operationKey = operation ? `${operation.kind}:${operation.incomingLabel}` : null
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null)
  if (operationKey !== prefilledFor) {
    setPrefilledFor(operationKey)
    if (operation?.message) setMessage((m) => (m.trim() ? m : operation.message!))
  }

  const commit = (): void => {
    if (!repoPath || !message.trim()) return
    git.withBusy(async () => {
      const res = await window.api.commit(repoPath, message.trim(), amend)
      if (!res.ok) {
        showError(res.error)
        return
      }
      setMessage('')
      setAmend(false)
      await refresh(repoPath)
    })
  }

  // Turning Amend on starts from the last commit's message, unless one is
  // being typed; turning it off clears that message again if it's untouched.
  const amendPrefill = useRef<string | null>(null)
  const changeAmend = async (on: boolean): Promise<void> => {
    if (!repoPath) return
    setAmend(on)
    if (on) {
      const res = await window.api.lastCommitMessage(repoPath)
      if (res.ok && res.data) {
        amendPrefill.current = res.data
        setMessage((m) => (m.trim() ? m : res.data))
      }
    } else {
      setMessage((m) => (m === amendPrefill.current ? '' : m))
      amendPrefill.current = null
    }
  }

  return {
    message,
    setMessage,
    amend,
    changeAmend,
    /** Amend is per repo, so it's switched off when another repo shows. */
    resetAmend: () => setAmend(false),
    commit
  }
}

export type CommitBox = ReturnType<typeof useCommitBox>
