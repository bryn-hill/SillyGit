export interface ConflictActions {
  onOpenConflict: (path: string) => void
  onTakeSide: (paths: string[], side: 'current' | 'incoming') => void
  onMarkResolved: (paths: string[]) => void
  /** The configured external merge tool's name, or null when there isn't one. */
  externalToolName: string | null
  onOpenExternal: (path: string) => void
  onContinue: () => void
  onAbort: () => void
  onSkip: () => void
}

/** The file open in the main area, marked in the side bar's lists. */
export interface ActiveFile {
  path: string
  /** For working changes: which list the file was opened from. */
  staged?: boolean
}

export interface MultiCommitActions {
  /** Picks the commits onto the current branch, oldest first. */
  cherryPick: (hashes: string[]) => void
  /** Reverts the commits, newest first. */
  revert: (hashes: string[]) => void
  copyText: (text: string) => void
  select: (hash: string) => void
}

export type OpenFileView = (path: string, ref: string | null, mode: 'history' | 'blame') => void
