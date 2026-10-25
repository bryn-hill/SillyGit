import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type JSX } from 'react'
import Markdown from './Markdown'
import PromptBox, { type PromptBoxHandle, type PromptImage } from './PromptBox'
import { PermissionCard, ThinkingBlock, TodoList, ToolRow } from './ChatItems'
import {
  FILE_CHANGING_TOOLS,
  initialChatState,
  latestTodos,
  reduceChat,
  type ChatItem
} from '../../lib/claudeChat'
import type { ClaudeEvent, ClaudePermissionMode, ClaudeSessionSummary } from '../../../../shared/claude'

const MIN_WIDTH = 320
export const DEFAULT_CLAUDE_WIDTH = 440

export function SparkIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M3.4 3.4l2.8 2.8M9.8 9.8l2.8 2.8M3.4 12.6l2.8-2.8M9.8 6.2l2.8-2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function HistoryIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M2.2 2.6v2.6h2.6M8 5v3.2l2 1.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function formatUsage(item: Extract<ChatItem, { type: 'turn-end' }>): string {
  const parts: string[] = []
  if (item.usage.durationMs != null) parts.push(`${(item.usage.durationMs / 1000).toFixed(1)}s`)
  if (item.usage.costUsd != null && item.usage.costUsd > 0) parts.push(`$${item.usage.costUsd.toFixed(4)}`)
  if (item.usage.outputTokens != null) parts.push(`${item.usage.outputTokens} output tokens`)
  return parts.join(' · ')
}

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

interface ChatViewProps {
  repoPath: string
  resume?: string
  shown: boolean
  initialMode: ClaudePermissionMode
  onTitle: (title: string) => void
  onFilesChanged: () => void
}

function ChatView({
  repoPath,
  resume,
  shown,
  initialMode,
  onTitle,
  onFilesChanged
}: ChatViewProps): JSX.Element {
  const [state, dispatch] = useReducer(reduceChat, initialMode, initialChatState)
  const [startError, setStartError] = useState<string | null>(null)
  const chatIdRef = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const promptRef = useRef<PromptBoxHandle>(null)
  const titled = useRef(!!resume)
  const filesRef = useRef<Promise<string[]> | null>(null)
  const onFilesChangedRef = useRef(onFilesChanged)
  onFilesChangedRef.current = onFilesChanged
  const onTitleRef = useRef(onTitle)
  onTitleRef.current = onTitle

  useEffect(() => {
    let disposed = false
    // Events for this chat can arrive before claudeStart resolves with its
    // id (a resumed transcript replays straight away), so hold them until then.
    const early: [number, ClaudeEvent][] = []
    const toolNames = new Map<string, string>()

    const apply = (ev: ClaudeEvent): void => {
      if (ev.kind === 'tool-use') toolNames.set(ev.toolUseId, ev.name)
      if (
        ev.kind === 'tool-result' &&
        !ev.isError &&
        FILE_CHANGING_TOOLS.has(toolNames.get(ev.toolUseId) ?? '')
      ) {
        onFilesChangedRef.current()
      }
      if (ev.kind === 'user' && !titled.current) {
        titled.current = true
        onTitleRef.current(ev.text.split('\n')[0].slice(0, 40) || 'New chat')
      }
      dispatch(ev)
    }

    const off = window.api.onClaudeEvent((id, ev) => {
      if (chatIdRef.current === null) early.push([id, ev])
      else if (id === chatIdRef.current) apply(ev)
    })

    window.api.claudeStart({ cwd: repoPath, resume, permissionMode: initialMode }).then((res) => {
      if (!res.ok) {
        setStartError(res.error)
        return
      }
      if (disposed) {
        window.api.claudeClose(res.data)
        return
      }
      chatIdRef.current = res.data
      for (const [id, ev] of early) if (id === res.data) apply(ev)
      early.length = 0
    })

    return () => {
      disposed = true
      off()
      if (chatIdRef.current != null) window.api.claudeClose(chatIdRef.current)
    }
    // one Claude Code session per tab, created on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (shown) promptRef.current?.focus()
  }, [shown])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [state.items])

  const withChat = (fn: (id: number) => void): void => {
    if (chatIdRef.current != null) fn(chatIdRef.current)
  }

  const handleSend = (text: string, images: PromptImage[]): void => {
    stickToBottom.current = true
    withChat((id) =>
      window.api.claudeSend(
        id,
        text,
        images.map(({ mediaType, data }) => ({ mediaType, data }))
      )
    )
  }

  const loadFiles = useCallback((): Promise<string[]> => {
    if (!filesRef.current) {
      filesRef.current = window.api.claudeListFiles(repoPath).then((r) => (r.ok ? r.data : []))
    }
    return filesRef.current
  }, [repoPath])

  const { topLevel, children } = useMemo(() => {
    const top: ChatItem[] = []
    const kids = new Map<string, ChatItem[]>()
    for (const item of state.items) {
      const parent = 'parent' in item ? item.parent : null
      if (parent) {
        const list = kids.get(parent) ?? []
        list.push(item)
        kids.set(parent, list)
      } else top.push(item)
    }
    return { topLevel: top, children: kids }
  }, [state.items])

  const todos = latestTodos(state.items)
  const lastItem = topLevel[topLevel.length - 1]
  const showWorking =
    state.busy &&
    !(lastItem?.type === 'permission' && lastItem.status === 'pending') &&
    !(lastItem?.type === 'text')

  return (
    <div className="claude-chat" style={{ display: shown ? 'flex' : 'none' }}>
      <div
        className="claude-messages"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {topLevel.length === 0 && !startError && (
          <div className="claude-empty">
            <SparkIcon size={28} />
            <p>Ask Claude to work in this repository.</p>
            <p className="claude-empty-hint">
              Type <kbd>@</kbd> to mention a file, <kbd>/</kbd> for commands, <kbd>Shift+Tab</kbd> to switch
              modes.
            </p>
          </div>
        )}
        {startError && <div className="claude-notice error">{startError}</div>}
        {topLevel.map((item, idx) => {
          switch (item.type) {
            case 'user':
              return (
                <div key={item.id} className="claude-user">
                  {item.text}
                </div>
              )
            case 'text':
              return (
                <div key={item.id} className="claude-text">
                  <Markdown text={item.text} />
                </div>
              )
            case 'thinking':
              return (
                <ThinkingBlock
                  key={item.id}
                  text={item.text}
                  streaming={state.busy && idx === topLevel.length - 1}
                />
              )
            case 'tool':
              return (
                <ToolRow
                  key={item.id}
                  repoPath={repoPath}
                  item={item}
                  childItems={children.get(item.id) ?? []}
                />
              )
            case 'permission':
              return (
                <PermissionCard
                  key={item.id}
                  repoPath={repoPath}
                  item={item}
                  onRespond={(decision) => withChat((id) => window.api.claudeRespond(id, item.id, decision))}
                />
              )
            case 'turn-end':
              return (
                <div key={item.id} className={`claude-turn-end ${item.isError ? 'error' : ''}`}>
                  {item.isError ? item.message || 'The turn ended with an error.' : formatUsage(item)}
                </div>
              )
            case 'notice':
              return (
                <div key={item.id} className={`claude-notice ${item.level}`}>
                  {item.text}
                </div>
              )
          }
        })}
        {showWorking && (
          <div className="claude-working">
            <span className="claude-working-dot" />
            Working…
          </div>
        )}
      </div>
      {todos && todos.some((t) => t.status !== 'completed') && (
        <div className="claude-pinned-todos">
          <TodoList todos={todos} />
        </div>
      )}
      <PromptBox
        ref={promptRef}
        busy={state.busy}
        mode={state.mode}
        model={state.model}
        models={state.models}
        commands={state.commands}
        loadFiles={loadFiles}
        onSend={handleSend}
        onInterrupt={() => withChat((id) => window.api.claudeInterrupt(id))}
        onModeChange={(mode) => {
          // Update the picker straight away so Shift+Tab can cycle again
          // before the session has confirmed the previous switch.
          dispatch({ kind: 'mode', permissionMode: mode })
          withChat((id) => window.api.claudeSetMode(id, mode))
        }}
        onModelChange={(model) => withChat((id) => window.api.claudeSetModel(id, model))}
      />
    </div>
  )
}

interface Tab {
  id: number
  title: string
  resume?: string
}

interface Props {
  repoPath: string
  visible: boolean
  width: number
  onWidthChange: (width: number) => void
  onClose: () => void
  onFilesChanged: () => void
}

export default function ClaudePanel({
  repoPath,
  visible,
  width,
  onWidthChange,
  onClose,
  onFilesChanged
}: Props): JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [history, setHistory] = useState<ClaudeSessionSummary[] | null>(null)
  const [mode, setMode] = useState<ClaudePermissionMode>('default')
  const nextIdRef = useRef(1)

  const openTab = useCallback((resume?: string, title = 'New chat') => {
    const id = nextIdRef.current++
    setTabs((prev) => [...prev, { id, title, resume }])
    setActiveId(id)
  }, [])

  useEffect(() => {
    if (visible && tabs.length === 0) openTab()
  }, [visible, tabs.length, openTab])

  // New conversations start in the permission mode picked last, the way the
  // extension carries the pick over between conversations.
  useEffect(
    () =>
      window.api.onClaudeEvent((_id, ev) => {
        if (ev.kind === 'mode') setMode(ev.permissionMode)
      }),
    []
  )

  const closeTab = (id: number): void => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      setActiveId((cur) => (cur !== id ? cur : next.length ? next[next.length - 1].id : null))
      return next
    })
  }

  const showHistory = async (): Promise<void> => {
    if (history) {
      setHistory(null)
      return
    }
    const res = await window.api.claudeListSessions(repoPath)
    setHistory(res.ok ? res.data : [])
  }

  const handleDragStart = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    const onMove = (ev: MouseEvent): void => {
      const max = Math.round(window.innerWidth * 0.7)
      onWidthChange(Math.min(Math.max(startWidth + (startX - ev.clientX), MIN_WIDTH), max))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="claude-panel" style={{ width: visible ? width : 0, display: visible ? 'flex' : 'none' }}>
      <div className="claude-resize-handle" onMouseDown={handleDragStart} />
      <div className="claude-panel-header">
        <div className="claude-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`terminal-tab ${tab.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(tab.id)}
              title={tab.title}
            >
              <SparkIcon size={12} />
              <span className="terminal-tab-title">{tab.title}</span>
              <button
                className="terminal-tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                title="Close conversation"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
        <div className="claude-panel-actions">
          <button className="icon-button" onClick={() => openTab()} title="New conversation">
            <PlusIcon />
          </button>
          <button
            className={`icon-button ${history ? 'icon-button-active' : ''}`}
            onClick={showHistory}
            title="Past conversations"
          >
            <HistoryIcon />
          </button>
          <button className="icon-button" onClick={onClose} title="Close panel">
            <CloseIcon />
          </button>
        </div>
      </div>
      {history && (
        <div className="claude-history">
          <div className="claude-history-title">Past conversations in this repository</div>
          {history.length === 0 && <div className="claude-history-empty">No past conversations yet.</div>}
          {history.map((s) => (
            <div
              key={s.sessionId}
              className="claude-history-item"
              onClick={() => {
                const open = tabs.find((t) => t.resume === s.sessionId)
                if (open) setActiveId(open.id)
                else openTab(s.sessionId, s.title.slice(0, 40))
                setHistory(null)
              }}
            >
              <span className="claude-history-name">{s.title}</span>
              <span className="claude-history-meta">
                {timeAgo(s.lastModified)}
                {s.gitBranch ? ` · ${s.gitBranch}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="claude-panel-body" style={{ display: history ? 'none' : undefined }}>
        {tabs.map((tab) => (
          <ChatView
            key={tab.id}
            repoPath={repoPath}
            resume={tab.resume}
            shown={visible && tab.id === activeId && !history}
            initialMode={mode}
            onTitle={(title) => setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, title } : t)))}
            onFilesChanged={onFilesChanged}
          />
        ))}
      </div>
    </div>
  )
}
