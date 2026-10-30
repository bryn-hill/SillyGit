import { createContext } from 'react'
import { NO_LFS, type LfsInfo } from '../../../shared/lfs'

/** What file lists, menus and diffs need to know about Git LFS in the open repo. */
export interface LfsRunner {
  info: LfsInfo
  /** Runs `git lfs track <pattern>`. */
  track: (pattern: string) => void
}

export const LfsContext = createContext<LfsRunner>({ info: NO_LFS, track: () => {} })
