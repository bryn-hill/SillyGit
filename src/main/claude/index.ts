import { ipcMain, BrowserWindow } from 'electron'
import { execFile } from 'child_process'
import type {
  ClaudePermissionDecision,
  ClaudePermissionMode,
  ClaudeSessionSummary,
  ClaudeStartOptions
} from '../../shared/claude'
import { ChatSession, type ClaudeImage, type Emit } from './session'

// Long-lived Claude Code sessions for the chat panel. Each chat owns one
// Agent SDK query() fed by a streaming input queue, so the underlying Claude
// Code process stays up between turns (same model as the IDE extensions):
// prompts are pushed into the queue, and every SDK message is normalized
// into a ClaudeEvent and forwarded to the renderer.

const chats = new Map<number, ChatSession>()
let nextChatId = 1

function listRepoFiles(cwd: string): Promise<string[]> {
  return new Promise((res) => {
    execFile(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd, maxBuffer: 1024 * 1024 * 64 },
      (err, stdout) => res(err ? [] : stdout.split('\n').filter(Boolean))
    )
  })
}

async function listSessions(cwd: string): Promise<ClaudeSessionSummary[]> {
  const { listSessions } = await import('@anthropic-ai/claude-agent-sdk')
  const sessions = await listSessions({ dir: cwd, limit: 50 })
  return sessions.map((s) => ({
    sessionId: s.sessionId,
    title: s.customTitle || s.summary || s.firstPrompt || 'Untitled conversation',
    lastModified: s.lastModified,
    gitBranch: s.gitBranch
  }))
}

type Wrapped<T> = { ok: true; data: T } | { ok: false; error: string }

function wrap<T>(fn: () => Promise<T> | T): Promise<Wrapped<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data) => ({ ok: true as const, data }))
    .catch((err) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }))
}

function chat(id: number): ChatSession {
  const session = chats.get(id)
  if (!session) throw new Error('This conversation has ended.')
  return session
}

export function registerClaudeHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('claude:start', (_e, opts: ClaudeStartOptions) =>
    wrap(async () => {
      const id = nextChatId++
      const emit: Emit = (event) => getWindow()?.webContents.send('claude:event', id, event)
      const session = new ChatSession(opts.cwd, emit, opts)
      chats.set(id, session)
      // The panel subscribes to claude:event before calling start, so events
      // emitted while the transcript replays aren't lost.
      session
        .start(!!opts.resume)
        .catch((err) =>
          emit({ kind: 'notice', level: 'error', text: err instanceof Error ? err.message : String(err) })
        )
      return id
    })
  )

  ipcMain.handle('claude:send', (_e, id: number, text: string, images?: ClaudeImage[]) =>
    wrap(() => chat(id).send(text, images))
  )
  ipcMain.handle('claude:interrupt', (_e, id: number) => wrap(() => chat(id).interrupt()))
  ipcMain.handle('claude:respond', (_e, id: number, requestId: string, decision: ClaudePermissionDecision) =>
    wrap(() => chat(id).respond(requestId, decision))
  )
  ipcMain.handle('claude:set-mode', (_e, id: number, mode: ClaudePermissionMode) =>
    wrap(() => chat(id).setMode(mode))
  )
  ipcMain.handle('claude:set-model', (_e, id: number, model: string) => wrap(() => chat(id).setModel(model)))
  ipcMain.handle('claude:close', (_e, id: number) =>
    wrap(() => {
      chats.get(id)?.close()
      chats.delete(id)
    })
  )
  ipcMain.handle('claude:list-sessions', (_e, cwd: string) => wrap(() => listSessions(cwd)))
  ipcMain.handle('claude:list-files', (_e, cwd: string) => wrap(() => listRepoFiles(cwd)))
}

export function closeAllClaudeChats(): void {
  for (const session of chats.values()) session.close()
  chats.clear()
}
