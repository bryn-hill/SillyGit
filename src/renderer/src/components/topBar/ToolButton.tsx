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
  /**
   * Every label the button can show (e.g. Pull and Fetching). The button is
   * as wide as the widest, so it and its neighbours don't move when the label changes.
   */
  labels?: string[]
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
  tour,
  labels
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
      {labels ? (
        // The longest label sits invisibly behind the shown one (in CSS, so it's not in the text).
        <span className="tool-label" data-sizer={labels.reduce((a, b) => (b.length > a.length ? b : a), label)}>
          <span>{label}</span>
        </span>
      ) : (
        <span className="tool-label">{label}</span>
      )}
      <span className="tool-icon">
        {icon}
        {badge ? <span className="tool-badge">{badge}</span> : null}
      </span>
    </button>
  )
}
