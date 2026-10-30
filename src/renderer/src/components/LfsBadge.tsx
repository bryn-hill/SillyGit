import type { JSX } from 'react'

/** The "LFS" tag on a file row whose file is stored in Git LFS. */
export default function LfsBadge(): JSX.Element {
  return (
    <span className="lfs-badge" title="Stored in Git LFS" aria-label="Stored in Git LFS">
      LFS
    </span>
  )
}
