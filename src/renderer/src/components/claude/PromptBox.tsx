import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  PERMISSION_MODES,
  type ClaudeCommand,
  type ClaudeModelOption,
  type ClaudePermissionMode
} from '../../../../shared/claude'

export interface PromptImage {
  mediaType: string
  data: string
  name: string
}

interface Props {
  busy: boolean
  mode: ClaudePermissionMode
  model: string | null
  models: ClaudeModelOption[]
  commands: ClaudeCommand[]
  loadFiles: () => Promise<string[]>
  onSend: (text: string, images: PromptImage[]) => void
  onInterrupt: () => void
  onModeChange: (mode: ClaudePermissionMode) => void
  onModelChange: (model: string) => void
}

export interface PromptBoxHandle {
  focus: () => void
  insert: (text: string) => void
}

interface Suggestion {
  key: string
  label: string
  detail?: string
  insert: string
}

const MAX_SUGGESTIONS = 12

// Subsequence match with a bonus for contiguous runs and for hits in the
// file name, so "@pbox" finds "components/claude/PromptBox.tsx".
function fuzzyScore(query: string, target: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const base = t.lastIndexOf('/') + 1
  let score = 0
  let ti = 0
  let run = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return 0
    run = found === ti ? run + 1 : 0
    score += 1 + run * 2 + (found >= base ? 2 : 0)
    ti = found + 1
  }
  return score - t.length * 0.01
}

function mentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret)
  const m = before.match(/(^|\s)@([^\s@]*)$/)
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

function slashQuery(value: string, caret: number): string | null {
  const m = value.slice(0, caret).match(/^\/(\S*)$/)
  return m ? m[1] : null
}

function readImage(file: File): Promise<PromptImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve({
        mediaType: file.type,
        data: url.slice(url.indexOf(',') + 1),
        name: file.name || 'pasted image'
      })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const PromptBox = forwardRef<PromptBoxHandle, Props>(function PromptBox(
  { busy, mode, model, models, commands, loadFiles, onSend, onInterrupt, onModeChange, onModelChange },
  ref
) {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [images, setImages] = useState<PromptImage[]>([])
  const [files, setFiles] = useState<string[] | null>(null)
  const [selected, setSelected] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [showModes, setShowModes] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    insert: (text: string) => {
      setValue((v) => (v && !v.endsWith(' ') ? `${v} ${text}` : v + text))
      textareaRef.current?.focus()
    }
  }))

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [value])

  const mention = mentionQuery(value, caret)
  const slash = slashQuery(value, caret)

  useEffect(() => {
    if (mention && files === null) loadFiles().then(setFiles)
  }, [mention, files, loadFiles])

  const suggestions = useMemo<Suggestion[]>(() => {
    if (dismissed) return []
    if (slash !== null) {
      const q = slash.toLowerCase()
      return commands
        .filter((c) => c.name.toLowerCase().includes(q))
        .sort(
          (a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))
        )
        .slice(0, MAX_SUGGESTIONS)
        .map((c) => ({
          key: c.name,
          label: `/${c.name}${c.argumentHint ? ` ${c.argumentHint}` : ''}`,
          detail: c.description,
          insert: `/${c.name} `
        }))
    }
    if (mention && files) {
      const dirs = new Set<string>()
      for (const f of files) {
        const parts = f.split('/')
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/') + '/')
      }
      return [...files, ...dirs]
        .map((p) => ({ p, s: fuzzyScore(mention.query, p) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_SUGGESTIONS)
        .map(({ p }) => ({ key: p, label: p, insert: `@${p} ` }))
    }
    return []
  }, [dismissed, slash, mention, files, commands])

  useEffect(() => setSelected(0), [suggestions.length, slash, mention?.query])

  const accept = (s: Suggestion): void => {
    let next: string
    let pos: number
    if (slash !== null) {
      next = s.insert + value.slice(caret)
      pos = s.insert.length
    } else if (mention) {
      next = value.slice(0, mention.start) + s.insert + value.slice(caret)
      pos = mention.start + s.insert.length
    } else return
    setValue(next)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  const send = (): void => {
    const text = value.trim()
    if (!text && images.length === 0) return
    onSend(text, images)
    setValue('')
    setImages([])
    setCaret(0)
  }

  const cycleMode = (): void => {
    const i = PERMISSION_MODES.findIndex((m) => m.value === mode)
    onModeChange(PERMISSION_MODES[(i + 1) % PERMISSION_MODES.length].value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setSelected((s) => (s + d + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        accept(suggestions[selected])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      cycleMode()
      return
    }
    if (e.key === 'Escape' && busy) {
      e.preventDefault()
      onInterrupt()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const handlePaste = async (e: React.ClipboardEvent): Promise<void> => {
    const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
    if (imgs.length === 0) return
    e.preventDefault()
    const read = await Promise.all(imgs.map(readImage))
    setImages((prev) => [...prev, ...read])
  }

  const modeInfo = PERMISSION_MODES.find((m) => m.value === mode) ?? PERMISSION_MODES[0]
  // The session reports the full model id; the picker lists aliases.
  const modelValue = models.find((m) => m.value === model || m.resolvedModel === model)?.value ?? model ?? ''

  return (
    <div className="claude-prompt">
      {suggestions.length > 0 && (
        <div className="claude-suggest">
          {suggestions.map((s, i) => (
            <div
              key={s.key}
              className={`claude-suggest-item ${i === selected ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                accept(s)
              }}
              onMouseEnter={() => setSelected(i)}
            >
              <span className="claude-suggest-label">{s.label}</span>
              {s.detail && <span className="claude-suggest-detail">{s.detail}</span>}
            </div>
          ))}
        </div>
      )}
      <div className={`claude-prompt-box mode-${mode}`}>
        {images.length > 0 && (
          <div className="claude-prompt-images">
            {images.map((img, i) => (
              <div key={i} className="claude-prompt-image">
                <img src={`data:${img.mediaType};base64,${img.data}`} alt={img.name} />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="claude-textarea"
          rows={1}
          placeholder={
            busy ? 'Queue another message…' : 'Ask Claude to edit, explain or commit… (@ files, / commands)'
          }
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setCaret(e.target.selectionStart)
            setDismissed(false)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        <div className="claude-prompt-footer">
          <div className="claude-mode-wrap">
            <button
              className={`claude-mode-button mode-${mode}`}
              onClick={() => setShowModes((v) => !v)}
              title={`${modeInfo.hint} (Shift+Tab to cycle)`}
            >
              {modeInfo.label}
            </button>
            {showModes && (
              <>
                <div className="dropdown-backdrop" onClick={() => setShowModes(false)} />
                <div className="claude-menu">
                  {PERMISSION_MODES.map((m) => (
                    <div
                      key={m.value}
                      className={`claude-menu-item ${m.value === mode ? 'current' : ''}`}
                      onClick={() => {
                        onModeChange(m.value)
                        setShowModes(false)
                      }}
                    >
                      <span className="claude-menu-label">{m.label}</span>
                      <span className="claude-menu-hint">{m.hint}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {models.length > 0 && (
            <select
              className="claude-model-select"
              value={modelValue}
              onChange={(e) => onModelChange(e.target.value)}
              title="Model"
            >
              {!models.some((m) => m.value === modelValue) && modelValue && (
                <option value={modelValue}>{modelValue}</option>
              )}
              {models.map((m) => (
                <option key={m.value} value={m.value} title={m.description}>
                  {m.displayName}
                </option>
              ))}
            </select>
          )}
          <div className="claude-prompt-spacer" />
          {busy ? (
            <button className="claude-stop" onClick={onInterrupt} title="Stop (Esc)">
              ■ Stop
            </button>
          ) : (
            <button
              className="claude-send"
              onClick={send}
              disabled={!value.trim() && images.length === 0}
              title="Send (Enter)"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export default PromptBox
