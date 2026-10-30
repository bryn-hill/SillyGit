import type { JSX, ReactNode } from 'react'

interface ToolButtonProps {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
  /** The accessible name, when it should differ from the visible label. */
  ariaLabel?: string
  active?: boolean
  badge?: number
  className?: string
  /** The walkthrough step that points at this button (its `data-tour` target). */
  tour?: string
}

/** A GitKraken-style toolbar button: a small label above its icon. */
export default function ToolButton({
  label,
  icon,
  onClick,
  disabled,
  title,
  ariaLabel,
  active,
  badge,
  className,
  tour
}: ToolButtonProps): JSX.Element {
  return (
    <button
      className={`tool-button ${active ? 'tool-button-active' : ''} ${className ?? ''}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? label}
      data-tour={tour}
    >
      <span className="tool-label">{label}</span>
      <span className="tool-icon">
        {icon}
        {badge ? <span className="tool-badge">{badge}</span> : null}
      </span>
    </button>
  )
}
