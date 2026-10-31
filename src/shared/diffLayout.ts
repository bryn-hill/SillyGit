/** How text diffs are drawn: one column, or old and new side by side. */
export type DiffLayout = 'unified' | 'split'

export const DEFAULT_DIFF_LAYOUT: DiffLayout = 'unified'

export function normalizeDiffLayout(value: unknown): DiffLayout {
  return value === 'split' ? 'split' : DEFAULT_DIFF_LAYOUT
}
