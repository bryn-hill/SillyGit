import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  /** Tooltip, e.g. a model's description. */
  title?: string
}

interface Props<T extends string | number> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  /** Lets a `<label htmlFor>` name the control. */
  id?: string
  'aria-label'?: string
  title?: string
  disabled?: boolean
  className?: string
  /** `ghost` has no border until hovered, for toolbars like the Claude prompt box. */
  variant?: 'default' | 'ghost'
}

const MARGIN = 8
const MAX_HEIGHT = 280

/**
 * A themed replacement for `<select>`: a combobox button and a listbox popup.
 * Focus stays on the button and the highlighted option is tracked with
 * aria-activedescendant, like the native control's keyboard behaviour.
 */
export default function Select<T extends string | number>({
  value,
  options,
  onChange,
  id,
  'aria-label': ariaLabel,
  title,
  disabled,
  className,
  variant = 'default'
}: Props<T>): JSX.Element {
  const listId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number; maxHeight: number } | null>(null)
  const typed = useRef({ text: '', at: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]

  const openList = (): void => {
    if (disabled || options.length === 0) return
    setActive(Math.max(0, selectedIndex))
    setPos(null)
    setOpen(true)
  }

  const choose = (index: number): void => {
    const option = options[index]
    setOpen(false)
    buttonRef.current?.focus()
    if (option && option.value !== value) onChange(option.value)
  }

  // Below the button when it fits, otherwise above it, kept inside the window.
  useLayoutEffect(() => {
    if (!open) return
    const button = buttonRef.current
    const list = listRef.current
    if (!button || !list) return
    const b = button.getBoundingClientRect()
    const height = Math.min(list.scrollHeight, MAX_HEIGHT)
    const below = window.innerHeight - b.bottom - MARGIN
    const above = b.top - MARGIN
    const placeBelow = below >= height || below >= above
    const maxHeight = Math.min(MAX_HEIGHT, placeBelow ? below - 4 : above - 4)
    const top = placeBelow ? b.bottom + 4 : b.top - 4 - Math.min(height, maxHeight)
    const width = Math.max(b.width, list.offsetWidth)
    const left = Math.max(MARGIN, Math.min(b.left, window.innerWidth - width - MARGIN))
    setPos({ left, top, minWidth: b.width, maxHeight })
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent): void => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    // A scroll or resize would leave the popup floating away from its button.
    const close = (e: Event): void => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointer, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onPointer, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [open])

  const typeAhead = (key: string): void => {
    const now = Date.now()
    const t = typed.current
    t.text = now - t.at > 700 ? key : t.text + key
    t.at = now
    const start = open ? active : selectedIndex
    const query = t.text.toLowerCase()
    const order = options.map((_, i) => (start + (t.text.length === 1 ? 1 : 0) + i) % options.length)
    const hit = order.find((i) => options[i].label.toLowerCase().startsWith(query))
    if (hit === undefined) return
    if (open) setActive(hit)
    else onChange(options[hit].value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) return
    const last = options.length - 1
    const handled = (): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        handled()
        openList()
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        handled()
        typeAhead(e.key)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        handled()
        setActive((i) => Math.min(last, i + 1))
        break
      case 'ArrowUp':
        handled()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
      case 'PageUp':
        handled()
        setActive(0)
        break
      case 'End':
      case 'PageDown':
        handled()
        setActive(last)
        break
      case 'Enter':
      case ' ':
        handled()
        choose(active)
        break
      case 'Escape':
        // Close only the list, not the dialog or view the select sits in.
        handled()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          handled()
          typeAhead(e.key)
        }
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        title={title ?? selected?.title}
        disabled={disabled}
        className={`select ${variant === 'ghost' ? 'select-ghost' : ''} ${open ? 'open' : ''} ${className ?? ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (open) setOpen(false)
          else openList()
        }}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{selected?.label ?? String(value)}</span>
        <svg className="select-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? buttonRef.current?.labels?.[0]?.textContent ?? undefined}
            className="select-list"
            style={
              pos
                ? { left: pos.left, top: pos.top, minWidth: pos.minWidth, maxHeight: pos.maxHeight }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
            // Keep focus (and the keyboard) on the button.
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                title={o.title}
                className={`select-option ${i === active ? 'active' : ''}`}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={(e) => {
                  e.stopPropagation()
                  choose(i)
                }}
              >
                <span className="select-check" aria-hidden="true">
                  {o.value === value ? '✓' : ''}
                </span>
                {o.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  )
}
