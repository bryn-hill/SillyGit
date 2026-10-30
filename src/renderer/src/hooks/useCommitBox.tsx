import { useEffect, useRef, useState } from 'react'
import type { OperationState } from '../../../shared/types'
import type { GitRunner } from './useGitRunner'
import { addCoAuthor, hasMessage, parseCoAuthors } from '../../../shared/coAuthors'
import { isUntouchedTemplate, NO_HINTS, type CommitHints } from '../../../shared/commitHints'

/** The commit message box on the WIP row, and Amend. */
export function useCommitBox({
  repoPath,
  headHash,
  operation,
  git,
  refresh,
  showError
}: {
  repoPath: string | null
  /** Hints are read again when HEAD moves, so a commit shows up in Recent. */
  headHash: string | null
  operation: OperationState | null
  git: GitRunner
  refresh: (path: string) => Promise<void>
  showError: (message: string) => void
}) {
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  // The Absorb dialog, which folds staged hunks into the commits they fix.
  const [absorbOpen, setAbsorbOpen] = useState(false)

  // The template, recent messages and Conventional Commits scopes, per repo.
  const [loadedHints, setLoadedHints] = useState<{ repoPath: string; hints: CommitHints } | null>(null)
  const hints = loadedHints && loadedHints.repoPath === repoPath ? loadedHints.hints : NO_HINTS
  const { template } = hints
  // The template last put in the box, so another repo's (or a changed one) can replace it.
  const prefilledTemplate = useRef<string | null>(null)
  useEffect(() => {
    if (!repoPath) return
    let cancelled = false
    window.api.commitHints(repoPath).then((res) => {
      if (cancelled || !res.ok) return
      setLoadedHints({ repoPath, hints: res.data })
      // Start an empty box (or one holding only the old template) from commit.template.
      const previous = prefilledTemplate.current
      prefilledTemplate.current = res.data.template
      setMessage((m) => (m.trim() && !isUntouchedTemplate(m, previous) ? m : (res.data.template ?? '')))
    })
    return () => {
      cancelled = true
    }
  }, [repoPath, headHash])

  // Prefill the message with git's prepared merge message, once per
  // operation, without overwriting anything the user typed.
  const operationKey = operation ? `${operation.kind}:${operation.incomingLabel}` : null
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null)
  if (operationKey !== prefilledFor) {
    setPrefilledFor(operationKey)
    if (operation?.message) setMessage((m) => (m.trim() && !isUntouchedTemplate(m, template) ? m : operation.message!))
  }

  const commit = (): void => {
    if (!repoPath || !hasMessage(message) || isUntouchedTemplate(message, template)) return
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
        // Co-authors already picked are kept on the last commit's message.
        setMessage((m) =>
          hasMessage(m) && !isUntouchedTemplate(m, template) ? m : parseCoAuthors(m).reduce(addCoAuthor, res.data)
        )
      }
    } else {
      setMessage((m) => (m === amendPrefill.current ? (template ?? '') : m))
      amendPrefill.current = null
    }
  }

  return {
    message,
    setMessage,
    hints,
    amend,
    changeAmend,
    /** Amend is per repo, so it's switched off when another repo shows. */
    resetAmend: () => setAmend(false),
    commit,
    absorbOpen,
    openAbsorb: () => setAbsorbOpen(true),
    closeAbsorb: () => setAbsorbOpen(false)
  }
}

export type CommitBox = ReturnType<typeof useCommitBox>
