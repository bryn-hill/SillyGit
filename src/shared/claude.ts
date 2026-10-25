// Types shared between the main-process Claude Code session manager
// (src/main/claude.ts) and the chat panel in the renderer.

export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export const PERMISSION_MODES: { value: ClaudePermissionMode; label: string; hint: string }[] = [
  {
    value: 'default',
    label: 'Ask before edits',
    hint: 'Claude asks before editing files or running commands'
  },
  {
    value: 'acceptEdits',
    label: 'Edit automatically',
    hint: 'Claude edits files in the repo without asking'
  },
  { value: 'plan', label: 'Plan mode', hint: 'Claude explores and proposes a plan, without making changes' },
  { value: 'bypassPermissions', label: 'Bypass permissions', hint: 'Claude runs every tool without asking' }
]

export interface ClaudeCommand {
  name: string
  description: string
  argumentHint: string
}

export interface ClaudeModelOption {
  value: string
  resolvedModel?: string
  displayName: string
  description: string
}

export interface ClaudeSessionSummary {
  sessionId: string
  title: string
  lastModified: number
  gitBranch?: string
}

export interface ClaudeStartOptions {
  cwd: string
  resume?: string
  model?: string
  permissionMode?: ClaudePermissionMode
}

export interface ClaudeQuestion {
  question: string
  header: string
  multiSelect: boolean
  options: { label: string; description: string }[]
}

/** What the user decided on a permission card. */
export type ClaudePermissionDecision =
  | { behavior: 'allow'; always?: boolean; answers?: Record<string, string>; setMode?: ClaudePermissionMode }
  | { behavior: 'deny'; message?: string }

export interface ClaudeUsage {
  costUsd?: number
  durationMs?: number
  numTurns?: number
  inputTokens?: number
  outputTokens?: number
}

/**
 * Normalized events the main process sends for one chat. The renderer folds
 * them into a list of chat items (see renderer/src/lib/claudeChat.ts), so the
 * same reducer handles a live stream and a replayed session transcript.
 */
export type ClaudeEvent =
  | {
      kind: 'ready'
      sessionId: string
      model: string
      permissionMode: ClaudePermissionMode
      cwd: string
    }
  | { kind: 'commands'; commands: ClaudeCommand[]; models: ClaudeModelOption[] }
  | { kind: 'user'; id: string; text: string }
  | { kind: 'block-start'; key: string; block: 'text' | 'thinking'; parentToolUseId: string | null }
  | { kind: 'block-delta'; key: string; text: string }
  | {
      kind: 'block-full'
      key: string
      block: 'text' | 'thinking'
      text: string
      parentToolUseId: string | null
    }
  | {
      kind: 'tool-use'
      toolUseId: string
      name: string
      input: Record<string, unknown>
      parentToolUseId: string | null
    }
  | { kind: 'tool-result'; toolUseId: string; content: string; isError: boolean; diff?: string }
  | {
      kind: 'permission'
      requestId: string
      toolUseId?: string
      toolName: string
      input: Record<string, unknown>
      reason?: string
      canAlwaysAllow: boolean
      diff?: string
      questions?: ClaudeQuestion[]
      plan?: string
    }
  | { kind: 'permission-resolved'; requestId: string; allowed: boolean }
  | { kind: 'mode'; permissionMode: ClaudePermissionMode }
  | { kind: 'model'; model: string }
  | { kind: 'busy'; busy: boolean }
  | { kind: 'turn-end'; isError: boolean; message?: string; usage: ClaudeUsage }
  | { kind: 'notice'; level: 'info' | 'error'; text: string }
  | { kind: 'closed' }
