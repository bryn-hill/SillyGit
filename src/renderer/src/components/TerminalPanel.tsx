import { useCallback, useEffect, useImperativeHandle, useRef, useState, type JSX, type Ref } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import type { Theme } from '../../../shared/theme'

const MIN_HEIGHT = 120
const DEFAULT_HEIGHT = 260

// The terminal can't use CSS variables, so each theme's colours are spelled
// out here, matching the tokens in styles/base.css.
const XTERM_THEMES: Record<Theme, ITheme> = {
  dark: {
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
  },
  light: {
    background: '#f7f7fa',
    foreground: '#24252f',
    cursor: '#24252f',
    cursorAccent: '#f7f7fa',
    selectionBackground: 'rgba(112, 72, 216, 0.25)',
    black: '#24252f',
    red: '#d03434',
    green: '#1b8a3c',
    yellow: '#8a7300',
    blue: '#7048d8',
    magenta: '#c02f7e',
    cyan: '#0a7a99',
    white: '#9a9db3',
    brightBlack: '#676c89',
    brightRed: '#e04848',
    brightGreen: '#23a04a',
    brightYellow: '#a68a00',
    brightBlue: '#8a63e8',
    brightMagenta: '#d9449a',
    brightCyan: '#1590b5',
    brightWhite: '#c4c6d4'
  }
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

function RunTabIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M5 3.5v9l7-4.5-7-4.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

interface TerminalInstanceProps {
  cwd: string | null
  /** Runs this shell line instead of opening an interactive shell. */
  command?: string
  shown: boolean
  theme: Theme
  onExit: (exitCode: number) => void
  onPty?: (ptyId: number) => void
}

function TerminalInstance({ cwd, command, shown, theme, onExit, onPty }: TerminalInstanceProps): JSX.Element {
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
      scrollback: 5000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    // The default DOM renderer draws every glyph from the loaded font, so it
    // can't render Powerline/box-drawing separators the font doesn't have
    // (they show as flat color blocks with no shape). The WebGL renderer
    // draws those as vector shapes instead, matching what most real
    // terminals (incl. VS Code's) show regardless of the font installed.
    // xterm 6 dropped the canvas renderer, so WebGL is the only one that
    // does this; without a GPU context it falls back to the DOM renderer.
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch (err) {
      console.warn('[terminal] WebGL renderer unavailable, using the DOM renderer', err)
    }
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
    const offExit = window.api.onTerminalExit((id, exitCode) => {
      if (id !== ptyIdRef.current) return
      ptyIdRef.current = null
      if (command) term.write(`\r\n\x1b[2m[Process exited with code ${exitCode}]\x1b[0m\r\n`)
      onExit(exitCode)
    })
    const inputDisposable = term.onData((data) => {
      if (ptyIdRef.current != null) window.api.terminalWrite(ptyIdRef.current, data)
    })

    if (command) term.write(`\x1b[2m${cwd ?? ''}\r\n$ ${command.replace(/\n/g, ' ')}\x1b[0m\r\n`)
    window.api.terminalCreate(cwd ?? undefined, term.cols, term.rows, command).then((id) => {
      if (disposed) {
        window.api.terminalKill(id)
        return
      }
      ptyIdRef.current = id
      onPty?.(id)
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

  // Also gives a new terminal its first colours, right after it opens.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = XTERM_THEMES[theme]
  }, [theme])

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

interface RunTab {
  /** Identifies the run, e.g. the repo and whether it's isolated; starting the same run again replaces its tab. */
  key: string
  cwd: string
  script: string
  running: boolean
}

interface TabState {
  id: number
  title: string
  run?: RunTab
}

export interface RunRequest {
  key: string
  title: string
  cwd: string
  script: string
  /** Called when the run's process exits. */
  onExit?: (exitCode: number) => void
}

export interface TerminalPanelHandle {
  /** Runs `script` in its own tab, replacing the tab of an earlier run with the same key. */
  startRun: (request: RunRequest) => void
  /** Interrupts the run (Ctrl+C), then kills it if it hasn't stopped a few seconds later. */
  stopRun: (key: string) => void
}

interface Props {
  cwd: string | null
  theme: Theme
  visible: boolean
  height: number
  onToggle: () => void
  onHeightChange: (height: number) => void
  /** The keys of the runs that are still going. */
  onRunningChange?: (keys: string[]) => void
}

const STOP_GRACE_MS = 3000

export default function TerminalPanel({
  cwd,
  theme,
  visible,
  height,
  onToggle,
  onHeightChange,
  onRunningChange,
  ref
}: Props & { ref?: Ref<TerminalPanelHandle> }): JSX.Element {
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const nextIdRef = useRef(1)
  // Each run tab's pty, so Stop can reach it.
  const runPtys = useRef(new Map<number, number>())
  // Each run tab's onExit, if its request gave one.
  const runExits = useRef(new Map<number, (exitCode: number) => void>())

  // As a string, so the parent only hears about it when the set changes.
  const runningKeys = JSON.stringify(tabs.filter((t) => t.run?.running).map((t) => t.run!.key))
  useEffect(() => {
    onRunningChange?.(JSON.parse(runningKeys) as string[])
  }, [runningKeys, onRunningChange])

  const stopRun = useCallback(
    (key: string): void => {
      const tab = tabs.find((t) => t.run?.key === key && t.run.running)
      const ptyId = tab ? runPtys.current.get(tab.id) : undefined
      if (!tab || ptyId == null) return
      window.api.terminalWrite(ptyId, '\x03')
      setTimeout(() => {
        if (runPtys.current.get(tab.id) === ptyId) window.api.terminalKill(ptyId)
      }, STOP_GRACE_MS)
    },
    [tabs]
  )

  useImperativeHandle(
    ref,
    () => ({
      startRun: ({ key, title, cwd: runCwd, script, onExit }) => {
        const id = nextIdRef.current++
        if (onExit) runExits.current.set(id, onExit)
        const tab: TabState = { id, title, run: { key, cwd: runCwd, script, running: true } }
        setTabs((prev) => {
          const index = prev.findIndex((t) => t.run?.key === key)
          if (index < 0) return [...prev, tab]
          const next = [...prev]
          next[index] = tab
          return next
        })
        setActiveId(id)
      },
      stopRun
    }),
    [stopRun]
  )

  const markRunExited = useCallback((id: number, exitCode: number) => {
    runPtys.current.delete(id)
    const onExit = runExits.current.get(id)
    runExits.current.delete(id)
    onExit?.(exitCode)
    setTabs((prev) => prev.map((t) => (t.id === id && t.run ? { ...t, run: { ...t.run, running: false } } : t)))
  }, [])

  const addTab = useCallback(() => {
    const id = nextIdRef.current++
    setTabs((prev) => [...prev, { id, title: `Terminal ${id}` }])
    setActiveId(id)
  }, [])

  useEffect(() => {
    if (visible && tabs.length === 0) addTab()
  }, [visible, tabs.length, addTab])

  const closeTab = useCallback((id: number) => {
    runPtys.current.delete(id)
    runExits.current.delete(id)
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
              className={`terminal-tab ${tab.id === activeId ? 'active' : ''} ${tab.run?.running ? 'running' : ''}`}
              data-testid={tab.run ? 'run-tab' : 'terminal-tab'}
              onClick={() => setActiveId(tab.id)}
              title={tab.run ? `${tab.run.script}\n${tab.run.cwd}` : undefined}
            >
              {tab.run ? <RunTabIcon /> : <TerminalTabIcon />}
              <span className="terminal-tab-title">{tab.title}</span>
              {tab.run?.running && (
                <button
                  className="terminal-tab-stop"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (tab.run) stopRun(tab.run.key)
                  }}
                  title="Stop"
                  aria-label={`Stop ${tab.title}`}
                >
                  <svg width="9" height="9" viewBox="0 0 10 10">
                    <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
                  </svg>
                </button>
              )}
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
            cwd={tab.run ? tab.run.cwd : cwd}
            command={tab.run?.script}
            shown={visible && tab.id === activeId}
            theme={theme}
            onExit={(exitCode) => (tab.run ? markRunExited(tab.id, exitCode) : closeTab(tab.id))}
            onPty={tab.run ? (ptyId) => runPtys.current.set(tab.id, ptyId) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export { DEFAULT_HEIGHT }
