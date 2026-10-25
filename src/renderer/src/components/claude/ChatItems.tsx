import { useEffect, useRef, useState, type JSX } from 'react'
import DiffBlock from '../DiffBlock'
import Markdown from './Markdown'
import type { ChatItem } from '../../lib/claudeChat'
import type { ClaudePermissionDecision, ClaudeQuestion } from '../../../../shared/claude'

type ToolItem = Extract<ChatItem, { type: 'tool' }>
type PermissionItem = Extract<ChatItem, { type: 'permission' }>

export function relPath(repoPath: string, p: unknown): string {
  if (typeof p !== 'string') return ''
  const root = repoPath.endsWith('/') ? repoPath : repoPath + '/'
  return p.startsWith(root) ? p.slice(root.length) : p
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function toolSummary(repoPath: string, name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
      return str(input.description) || str(input.command).split('\n')[0]
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return relPath(repoPath, input.file_path ?? input.notebook_path)
    case 'Grep':
      return `"${str(input.pattern)}"${input.path ? ` in ${relPath(repoPath, input.path)}` : ''}`
    case 'Glob':
      return str(input.pattern)
    case 'WebFetch':
      return str(input.url)
    case 'WebSearch':
      return str(input.query)
    case 'Task':
    case 'Agent':
      return str(input.description) || str(input.subagent_type)
    case 'TodoWrite':
      return 'Update to-dos'
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string')
      return typeof first === 'string' ? first.split('\n')[0] : ''
    }
  }
}

function prefixLines(text: string, prefix: string, max = 400): string[] {
  const lines = text.split('\n')
  const shown = lines.slice(0, max).map((l) => prefix + l)
  if (lines.length > max) shown.push(` … ${lines.length - max} more lines`)
  return shown
}

/** A diff built from the tool input alone, for edits whose real patch isn't known (history, pending runs). */
function inputDiff(name: string, input: Record<string, unknown>): string | undefined {
  if (name === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    return ['@@ edit @@', ...prefixLines(input.old_string, '-'), ...prefixLines(input.new_string, '+')].join(
      '\n'
    )
  }
  if (name === 'Write' && typeof input.content === 'string') {
    return ['@@ new content @@', ...prefixLines(input.content, '+')].join('\n')
  }
  return undefined
}

export function TodoList({
  todos
}: {
  todos: { content: string; status: string; activeForm?: string }[]
}): JSX.Element {
  return (
    <ul className="claude-todos">
      {todos.map((t, i) => (
        <li key={i} className={`todo-${t.status}`}>
          <span className="todo-box">
            {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '◐' : ''}
          </span>
          <span>{t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content}</span>
        </li>
      ))}
    </ul>
  )
}

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      className={`claude-chevron ${open ? 'open' : ''}`}
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface ToolRowProps {
  repoPath: string
  item: ToolItem
  childItems: ChatItem[]
}

export function ToolRow({ repoPath, item, childItems }: ToolRowProps): JSX.Element {
  const isEdit = item.name === 'Edit' || item.name === 'Write' || item.name === 'MultiEdit'
  // Edits stay collapsed while their permission card shows the proposed diff,
  // then open with the applied patch once the tool has run.
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? ((isEdit && item.done) || item.name === 'TodoWrite')
  const setOpen = (fn: (v: boolean) => boolean): void => setUserOpen(fn(open))
  const status = !item.done ? 'running' : item.isError ? 'error' : 'done'
  const diff = item.diff ?? inputDiff(item.name, item.input)
  const childTools = childItems.filter((c): c is ToolItem => c.type === 'tool')

  return (
    <div className={`claude-tool status-${status}`}>
      <div className="claude-tool-header" onClick={() => setOpen((v) => !v)}>
        <span className="claude-tool-dot" />
        <span className="claude-tool-name">{item.name}</span>
        <span className="claude-tool-summary">{toolSummary(repoPath, item.name, item.input)}</span>
        {childTools.length > 0 && <span className="claude-tool-count">{childTools.length} tool uses</span>}
        <Chevron open={open} />
      </div>
      {open && (
        <div className="claude-tool-body">
          {item.name === 'TodoWrite' && Array.isArray(item.input.todos) ? (
            <TodoList todos={item.input.todos as { content: string; status: string }[]} />
          ) : isEdit && diff ? (
            <DiffBlock diffText={diff} />
          ) : item.name === 'Bash' ? (
            <pre className="claude-tool-pre">$ {str(item.input.command)}</pre>
          ) : (
            <pre className="claude-tool-pre">{JSON.stringify(item.input, null, 2)}</pre>
          )}
          {childTools.length > 0 && (
            <div className="claude-tool-children">
              {childTools.map((c) => (
                <div
                  key={c.id}
                  className={`claude-tool-child status-${!c.done ? 'running' : c.isError ? 'error' : 'done'}`}
                >
                  <span className="claude-tool-dot" />
                  <span className="claude-tool-name">{c.name}</span>
                  <span className="claude-tool-summary">{toolSummary(repoPath, c.name, c.input)}</span>
                </div>
              ))}
            </div>
          )}
          {item.result != null &&
            item.result !== '' &&
            (!isEdit || item.isError) &&
            item.name !== 'TodoWrite' && (
              <pre className={`claude-tool-pre claude-tool-result ${item.isError ? 'error' : ''}`}>
                {item.result}
              </pre>
            )}
        </div>
      )}
    </div>
  )
}

export function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  // Some models stream no visible reasoning; don't leave an empty row behind.
  if (!text && !streaming) return null
  return (
    <div className="claude-thinking">
      <div className="claude-thinking-header" onClick={() => setOpen((v) => !v)}>
        <Chevron open={open} />
        <span>{streaming ? 'Thinking…' : 'Thought'}</span>
      </div>
      {open && <div className="claude-thinking-body">{text || '(no visible reasoning)'}</div>}
    </div>
  )
}

function QuestionForm({
  questions,
  onSubmit,
  onCancel
}: {
  questions: ClaudeQuestion[]
  onSubmit: (answers: Record<string, string>) => void
  onCancel: () => void
}): JSX.Element {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})

  const toggle = (q: ClaudeQuestion, label: string): void => {
    setPicked((prev) => {
      const cur = prev[q.question] ?? []
      const next = q.multiSelect
        ? cur.includes(label)
          ? cur.filter((l) => l !== label)
          : [...cur, label]
        : [label]
      return { ...prev, [q.question]: next }
    })
  }

  const answerFor = (q: ClaudeQuestion): string => {
    const parts = [...(picked[q.question] ?? [])]
    const extra = other[q.question]?.trim()
    if (extra) parts.push(extra)
    return parts.join(', ')
  }
  const complete = questions.every((q) => answerFor(q).length > 0)

  return (
    <div className="claude-questions">
      {questions.map((q) => (
        <div key={q.question} className="claude-question">
          <div className="claude-question-text">
            {q.header && <span className="claude-chip">{q.header}</span>}
            {q.question}
          </div>
          <div className="claude-question-options">
            {q.options.map((o) => {
              const on = (picked[q.question] ?? []).includes(o.label)
              return (
                <button
                  key={o.label}
                  className={`claude-option ${on ? 'selected' : ''}`}
                  onClick={() => toggle(q, o.label)}
                >
                  <span className="claude-option-label">{o.label}</span>
                  {o.description && <span className="claude-option-desc">{o.description}</span>}
                </button>
              )
            })}
          </div>
          <input
            className="claude-feedback-input"
            placeholder="Other…"
            value={other[q.question] ?? ''}
            onChange={(e) => setOther((prev) => ({ ...prev, [q.question]: e.target.value }))}
          />
        </div>
      ))}
      <div className="claude-permission-actions">
        <button
          className="claude-primary"
          disabled={!complete}
          onClick={() => onSubmit(Object.fromEntries(questions.map((q) => [q.question, answerFor(q)])))}
        >
          Submit answers
        </button>
        <button onClick={onCancel}>Skip</button>
      </div>
    </div>
  )
}

function permissionTitle(repoPath: string, item: PermissionItem): string {
  const file = relPath(repoPath, item.input.file_path)
  switch (item.toolName) {
    case 'Edit':
    case 'MultiEdit':
      return `Make this edit to ${file}?`
    case 'Write':
      return `Write ${file}?`
    case 'Bash':
      return 'Run this command?'
    case 'ExitPlanMode':
      return 'Ready to code? Here is Claude’s plan:'
    case 'AskUserQuestion':
      return 'Claude has a question'
    case 'WebFetch':
      return `Fetch ${str(item.input.url)}?`
    default:
      return `Allow ${item.toolName}?`
  }
}

interface PermissionCardProps {
  repoPath: string
  item: PermissionItem
  onRespond: (decision: ClaudePermissionDecision) => void
}

export function PermissionCard({ repoPath, item, onRespond }: PermissionCardProps): JSX.Element {
  const [feedback, setFeedback] = useState('')
  const primaryRef = useRef<HTMLButtonElement>(null)
  const pending = item.status === 'pending'

  useEffect(() => {
    if (pending) primaryRef.current?.focus()
  }, [pending])

  if (!pending) {
    return (
      <div className={`claude-permission-resolved ${item.status}`}>
        {item.status === 'allowed' ? '✓ Allowed' : '✕ Declined'}:{' '}
        {permissionTitle(repoPath, item).replace(/\?$/, '')}
      </div>
    )
  }

  const deny = (): void => onRespond({ behavior: 'deny', message: feedback })
  const diff = item.diff ?? inputDiff(item.toolName, item.input)

  let body: JSX.Element | null = null
  if (item.questions) {
    body = (
      <QuestionForm
        questions={item.questions}
        onSubmit={(answers) => onRespond({ behavior: 'allow', answers })}
        onCancel={() => onRespond({ behavior: 'deny', message: 'The user skipped the question.' })}
      />
    )
  } else if (item.toolName === 'ExitPlanMode') {
    body = <div className="claude-plan">{item.plan ? <Markdown text={item.plan} /> : null}</div>
  } else if (
    diff &&
    (item.toolName === 'Edit' || item.toolName === 'Write' || item.toolName === 'MultiEdit')
  ) {
    body = (
      <div className="claude-permission-diff">
        <DiffBlock diffText={diff} />
      </div>
    )
  } else if (item.toolName === 'Bash') {
    body = (
      <>
        <pre className="claude-tool-pre">$ {str(item.input.command)}</pre>
        {str(item.input.description) && (
          <div className="claude-permission-reason">{str(item.input.description)}</div>
        )}
      </>
    )
  } else {
    body = <pre className="claude-tool-pre">{JSON.stringify(item.input, null, 2)}</pre>
  }

  return (
    <div className="claude-permission">
      <div className="claude-permission-title">{permissionTitle(repoPath, item)}</div>
      {item.reason && item.toolName !== 'ExitPlanMode' && !item.questions && (
        <div className="claude-permission-reason">{item.reason}</div>
      )}
      {body}
      {!item.questions && (
        <>
          <div className="claude-permission-actions">
            {item.toolName === 'ExitPlanMode' ? (
              <>
                <button
                  ref={primaryRef}
                  className="claude-primary"
                  onClick={() => onRespond({ behavior: 'allow', setMode: 'acceptEdits' })}
                >
                  Yes, auto-accept edits
                </button>
                <button onClick={() => onRespond({ behavior: 'allow', setMode: 'default' })}>
                  Yes, approve each edit
                </button>
                <button onClick={deny}>No, keep planning</button>
              </>
            ) : (
              <>
                <button
                  ref={primaryRef}
                  className="claude-primary"
                  onClick={() => onRespond({ behavior: 'allow' })}
                >
                  Yes
                </button>
                {item.canAlwaysAllow && (
                  <button onClick={() => onRespond({ behavior: 'allow', always: true })}>
                    {item.toolName === 'Edit' || item.toolName === 'Write' || item.toolName === 'MultiEdit'
                      ? 'Yes, allow all edits this session'
                      : 'Yes, don’t ask again this session'}
                  </button>
                )}
                <button onClick={deny}>No</button>
              </>
            )}
          </div>
          <input
            className="claude-feedback-input"
            placeholder="Or tell Claude what to do instead, then press Enter"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && feedback.trim()) deny()
            }}
          />
        </>
      )}
    </div>
  )
}
