import type { JSX } from 'react'

export function FolderIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3.4l1.2 1.5h5.4a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V3.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BranchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.5 5v6M4.5 8c0-1.5 1.3-2.8 3-2.8h2.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChevronIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PullIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 13.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function PushIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 13.5v-8M4.5 9 8 5.5 11.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 2.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function FetchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M13 8a5 5 0 1 1-1.5-3.55M13 2.5v2.5h-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function UndoIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M5 3.5 2.5 6 5 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 6h7a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function StashIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="5.5" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 5.5 4.5 2.5h7l2 3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function PopIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="5.5" width="11" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.5 5.5 4.5 2.5h7l2 3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 6.8V11M6 9l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LaunchpadIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.8c2.4 1 3.6 3.3 3.6 6.2 0 1.6-.4 3-1 4.1l-2.6 1.4-2.6-1.4c-.6-1.1-1-2.5-1-4.1 0-2.9 1.2-5.2 3.6-6.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="7.2" r="1.3" stroke="currentColor" strokeWidth="1.1" />
      <path d="M5.6 11 4 14.2M10.4 11 12 14.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}

export function TerminalIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 6.2 6.8 8 4 9.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 9.8h3.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function GearIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.61 3.3 6.91 1.8h2.18l.3 1.5.95.39 1.27-.85 1.55 1.55-.85 1.27.39.95 1.5.3v2.18l-1.5.3-.39.95.85 1.27-1.55 1.55-1.27-.85-.95.39-.3 1.5H6.91l-.3-1.5-.95-.39-1.27.85-1.55-1.55.85-1.27-.39-.95-1.5-.3V6.91l1.5-.3.39-.95-.85-1.27 1.55-1.55 1.27.85Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function RedoIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M11 3.5 13.5 6 11 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 6h-7a3.5 3.5 0 0 0 0 7H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function NewBranchIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="4.5" cy="3.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="12.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 5v6M4.5 10.5c0-2 1.6-3 3.5-3.3l2-.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

export function ActionsIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="5.5" width="13" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 1.5v2M8 12.5v2M6.8 2.3 8 3.5l1.2-1.2M6.8 13.7 8 12.5l1.2 1.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function UpdateIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path
        d="M13 8a5 5 0 1 1-1.5-3.55M13 2.5v2.5h-2.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 5.5v4M6.3 8 8 9.7 9.7 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RunIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M4.5 2.8v10.4L13 8 4.5 2.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function StopIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function MoreIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3.5" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="12.5" cy="8" r="1.3" />
    </svg>
  )
}

export function CodeIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M5 4.5 1.8 8 5 11.5M11 4.5 14.2 8 11 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.2 3 6.8 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
