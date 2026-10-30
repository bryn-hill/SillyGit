import { useEffect, useState, type JSX } from 'react'
import { openHelp } from './helpCentreStore'
import { startTour } from './tourBus'
import { SHORTCUTS_ARTICLE } from './articles'

function HelpIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6.2 6.2a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r="0.75" fill="currentColor" />
    </svg>
  )
}

/** The top bar's Help button: the help centre, the walkthrough and the keyboard shortcuts. */
export default function HelpMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  // Escape closes the menu, like the other top-bar menus.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])
  const items: { label: string; hint?: string; run: () => void }[] = [
    { label: 'Help centre', hint: 'F1', run: () => openHelp() },
    { label: 'Start walkthrough', run: startTour },
    { label: 'Keyboard shortcuts', run: () => openHelp(SHORTCUTS_ARTICLE) }
  ]
  return (
    <div className="help-menu">
      <button
        className={`icon-button ${open ? 'icon-button-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Help (F1)"
        aria-label="Help"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tour="help-button"
      >
        <HelpIcon />
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div
            className="branch-dropdown tool-menu help-menu-list"
            role="menu"
            aria-label="Help"
          >
            {items.map((item) => (
              <div
                key={item.label}
                role="menuitem"
                className="branch-dropdown-item"
                onClick={() => {
                  setOpen(false)
                  item.run()
                }}
              >
                {item.label}
                {item.hint && <span className="help-menu-hint">{item.hint}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
