import { useEffect, useState } from 'react'
import type { StackInfo } from '../../../shared/stacks'

const NO_STACKS: StackInfo[] = []

/** The repo's stacked branches, reloaded whenever `refreshKey` changes (each repo refresh). */
export function useStacks(repoPath: string | null, refreshKey: unknown): StackInfo[] {
  const [loaded, setLoaded] = useState<{ repoPath: string; stacks: StackInfo[] } | null>(null)
  useEffect(() => {
    if (!repoPath) return
    let current = true
    window.api.stacks(repoPath).then((res) => {
      if (current) setLoaded({ repoPath, stacks: res.ok ? res.data : NO_STACKS })
    })
    return () => {
      current = false
    }
  }, [repoPath, refreshKey])
  // Another repo's stacks never show while this one's load.
  return loaded?.repoPath === repoPath ? loaded.stacks : NO_STACKS
}
