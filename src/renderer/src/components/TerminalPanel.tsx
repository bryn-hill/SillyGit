import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import '@xterm/xterm/css/xterm.css'

const MIN_HEIGHT = 120
const DEFAULT_HEIGHT = 260

const XTERM_THEME = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  selectionBackground: 'rgba(189, 147, 249, 0.3)',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff'
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function TerminalTabIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M3 5l3.5 3L3 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

interface TerminalInstanceProps {
  cwd: string | null
  shown: boolean
  onExit: () => void
}

function TerminalInstance({ cwd, shown, onExit }: TerminalInstanceProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<number | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const term = new Terminal({
      fontFamily: "'SF Mono', Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: true,
      scrollback: 5000,
      theme: XTERM_THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    // The default DOM renderer draws every glyph from the loaded font, so it
    // can't render Powerline/box-drawing separators the font doesn't have
    // (they show as flat color blocks with no shape). The canvas renderer
    // draws those as vector shapes instead, matching what most real
    // terminals (incl. VS Code's) show regardless of the font installed.
    term.loadAddon(new CanvasAddon())
    termRef.current = term
    fitRef.current = fit

    let disposed = false

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      try {
        fit.fit()
      } catch {
        // container not laid out yet; the resize observer will catch up
      }
    }

    const offData = window.api.onTerminalData((id, data) => {
      if (id === ptyIdRef.current) term.write(data)
    })
    const offExit = window.api.onTerminalExit((id) => {
      if (id === ptyIdRef.current) onExit()
    })
    const inputDisposable = term.onData((data) => {
      if (ptyIdRef.current != null) window.api.terminalWrite(ptyIdRef.current, data)
    })

    window.api.terminalCreate(cwd ?? undefined, term.cols, term.rows).then((id) => {
      if (disposed) {
        window.api.terminalKill(id)
        return
      }
      ptyIdRef.current = id
    })

    const resizeObserver = new ResizeObserver(() => {
      if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return
      try {
        fit.fit()
      } catch {
        return
      }
      if (ptyIdRef.current != null) {
        window.api.terminalResize(ptyIdRef.current, term.cols, term.rows)
      }
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      offData()
      offExit()
      inputDisposable.dispose()
      if (ptyIdRef.current != null) window.api.terminalKill(ptyIdRef.current)
      // xterm queues a setTimeout from open() that reads the renderer's
      // dimensions. Disposing synchronously (e.g. StrictMode's mount/unmount
      // in dev, or closing a tab right after opening it) leaves that timer to
      // fire against a disposed renderer and throw. Dispose on a later tick so
      // xterm's own pending timer runs first.
      setTimeout(() => term.dispose())
    }
    // pty session is created once per tab; cwd is captured at creation time only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!shown) return
    try {
      fitRef.current?.fit()
    } catch {
      // ignore
    }
    termRef.current?.focus()
    const term = termRef.current
    if (ptyIdRef.current != null && term) {
      window.api.terminalResize(ptyIdRef.current, term.cols, term.rows)
    }
  }, [shown])

  return (
    <div
      ref={containerRef}
      className="terminal-instance"
      style={{ visibility: shown ? 'visible' : 'hidden' }}
    />
  )
}

interface TabState {
  id: number
  title: string
}

interface Props {
  cwd: string | null
  visible: boolean
  height: number
  onToggle: () => void
  onHeightChange: (height: number) => void
}

export default function TerminalPanel({ cwd, visible, height, onToggle, onHeightChange }: Props): JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const nextIdRef = useRef(1)

  const addTab = useCallback(() => {
    const id = nextIdRef.current++
    setTabs((prev) => [...prev, { id, title: `Terminal ${id}` }])
    setActiveId(id)
  }, [])

  useEffect(() => {
    if (visible && tabs.length === 0) addTab()
  }, [visible, tabs.length, addTab])

  const closeTab = useCallback((id: number) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      setActiveId((current) => {
        if (current !== id) return current
        return next.length ? next[next.length - 1].id : null
      })
      return next
    })
  }, [])

  const handleDragStart = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = height

    const onMove = (ev: MouseEvent): void => {
      const delta = startY - ev.clientY
      const max = Math.round(window.innerHeight * 0.8)
      onHeightChange(Math.min(Math.max(startHeight + delta, MIN_HEIGHT), max))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="terminal-panel" role="region" aria-label="Terminal" style={{ height: visible ? height : 0 }}>
      {visible && <div className="terminal-resize-handle" onMouseDown={handleDragStart} />}
      <div className="terminal-panel-header">
        <div className="terminal-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`terminal-tab ${tab.id === activeId ? 'active' : ''}`}
              data-testid="terminal-tab"
              onClick={() => setActiveId(tab.id)}
            >
              <TerminalTabIcon />
              <span className="terminal-tab-title">{tab.title}</span>
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                title="Close terminal"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
          <button className="icon-button terminal-add-btn" onClick={addTab} title="New terminal">
            <PlusIcon />
          </button>
        </div>
        <button className="icon-button" onClick={onToggle} title="Close panel">
          <CloseIcon />
        </button>
      </div>
      <div className="terminal-body">
        {tabs.map((tab) => (
          <TerminalInstance
            key={tab.id}
            cwd={cwd}
            shown={visible && tab.id === activeId}
            onExit={() => closeTab(tab.id)}
          />
        ))}
      </div>
    </div>
  )
}

export { DEFAULT_HEIGHT }
