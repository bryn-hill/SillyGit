import { createContext } from 'react'
import { DEFAULT_DIFF_LAYOUT, type DiffLayout } from '../../../shared/diffLayout'

/** The saved diff layout, shared by every file diff so switching one switches them all. */
export interface DiffLayoutSetting {
  layout: DiffLayout
  setLayout: (layout: DiffLayout) => void
}

export const DiffLayoutContext = createContext<DiffLayoutSetting>({ layout: DEFAULT_DIFF_LAYOUT, setLayout: () => {} })
