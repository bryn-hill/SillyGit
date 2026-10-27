import type { CSSProperties, JSX } from 'react'
import { initials, initialsColor, useAvatar } from '../lib/avatars'

interface Props {
  name: string
  email?: string
  /** A commit by this author, so GitHub can be asked who made it. */
  hash?: string
  repoPath?: string
  size: number
  /** Draws a coloured ring, e.g. the graph lane's colour. */
  ring?: string
  className?: string
  style?: CSSProperties
}

/** An author's picture from GitHub, GitLab or Gravatar, or their initials until (or unless) one is found. */
export default function Avatar({ name, email, hash, repoPath, size, ring, className, style }: Props): JSX.Element {
  const image = useAvatar(repoPath, email, hash)
  return (
    <span
      className={`avatar ${className ?? ''}`}
      data-testid="avatar"
      data-email={email}
      title={email ? `${name} <${email}>` : name}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.4)),
        background: initialsColor(email || name),
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
        ...style
      }}
    >
      {image ? <img src={image} alt="" draggable={false} /> : initials(name)}
    </span>
  )
}
