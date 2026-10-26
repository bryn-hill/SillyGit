import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'

export interface ContextMenuItem {
  id: string
  label: string
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
  submenu?: ContextMenuItem[]
}

interface Props {
  x: number
  y: number
  sections: ContextMenuItem[][]
  onClose: () => void
}

function MenuItemRow({ item, onClose }: { item: ContextMenuItem; onClose: () => void }): JSX.Element {
  if (item.submenu && item.submenu.length > 0) {
    return (
      <div className="context-menu-item has-submenu">
        <span>{item.label}</span>
        <span className="context-menu-arrow">›</span>
        <div className="context-menu-submenu">
          {item.submenu.map((sub) => (
            <MenuItemRow key={sub.id} item={sub} onClose={onClose} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div
      className={`context-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
      role="menuitem"
      aria-disabled={item.disabled || undefined}
      onClick={() => {
        if (item.disabled) return
        item.onSelect?.()
        onClose()
      }}
    >
      {item.label}
    </div>
  )
}

export default function ContextMenu({ x, y, sections, onClose }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y, visible: false })

  // Measure the rendered menu and nudge it back on-screen if it would
  // overflow the window edge the cursor opened it near.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    let left = x
    let top = y
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, window.innerHeight - rect.height - margin)
    }
    setPos({ left, top, visible: true })
  }, [x, y])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <>
      <div
        className="context-menu-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={ref}
        className="context-menu"
        role="menu"
        style={{ left: pos.left, top: pos.top, visibility: pos.visible ? 'visible' : 'hidden' }}
      >
        {sections.map((section, i) => (
          <div className="context-menu-section" key={i}>
            {i > 0 && <div className="context-menu-separator" />}
            {section.map((item) => (
              <MenuItemRow key={item.id} item={item} onClose={onClose} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}
