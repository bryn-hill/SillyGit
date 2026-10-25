import type {
  ClaudeCommand,
  ClaudeEvent,
  ClaudeModelOption,
  ClaudePermissionMode,
  ClaudeQuestion,
  ClaudeUsage
} from '../../../shared/claude'

export type ChatItem =
  | { type: 'user'; id: string; text: string }
  | { type: 'text' | 'thinking'; id: string; text: string; parent: string | null }
  | {
      type: 'tool'
      id: string
      name: string
      input: Record<string, unknown>
      parent: string | null
      done: boolean
      result?: string
      isError?: boolean
      diff?: string
    }
  | {
      type: 'permission'
      id: string
      toolUseId?: string
      toolName: string
      input: Record<string, unknown>
      reason?: string
      canAlwaysAllow: boolean
      diff?: string
      questions?: ClaudeQuestion[]
      plan?: string
      status: 'pending' | 'allowed' | 'denied'
    }
  | { type: 'turn-end'; id: string; isError: boolean; message?: string; usage: ClaudeUsage }
  | { type: 'notice'; id: string; level: 'info' | 'error'; text: string }

export interface ChatState {
  items: ChatItem[]
  busy: boolean
  sessionId: string | null
  model: string | null
  mode: ClaudePermissionMode
  commands: ClaudeCommand[]
  models: ClaudeModelOption[]
}

export const initialChatState = (mode: ClaudePermissionMode = 'default'): ChatState => ({
  items: [],
  busy: false,
  sessionId: null,
  model: null,
  mode,
  commands: [],
  models: []
})

let noticeSeq = 0

function updateItem(items: ChatItem[], id: string, fn: (item: ChatItem) => ChatItem): ChatItem[] {
  // Updates almost always hit the most recent items, so search from the end.
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].id === id) {
      const next = items.slice()
      next[i] = fn(items[i])
      return next
    }
  }
  return items
}

export function reduceChat(state: ChatState, ev: ClaudeEvent): ChatState {
  switch (ev.kind) {
    case 'ready':
      return { ...state, sessionId: ev.sessionId, model: ev.model, mode: ev.permissionMode }
    case 'commands':
      return { ...state, commands: ev.commands, models: ev.models }
    case 'user':
      return { ...state, items: [...state.items, { type: 'user', id: ev.id, text: ev.text }] }
    case 'block-start':
      return {
        ...state,
        items: [...state.items, { type: ev.block, id: ev.key, text: '', parent: ev.parentToolUseId }]
      }
    case 'block-delta':
      return {
        ...state,
        items: updateItem(state.items, ev.key, (item) =>
          item.type === 'text' || item.type === 'thinking' ? { ...item, text: item.text + ev.text } : item
        )
      }
    case 'block-full':
      return {
        ...state,
        items: [...state.items, { type: ev.block, id: ev.key, text: ev.text, parent: ev.parentToolUseId }]
      }
    case 'tool-use':
      return {
        ...state,
        items: [
          ...state.items,
          {
            type: 'tool',
            id: ev.toolUseId,
            name: ev.name,
            input: ev.input,
            parent: ev.parentToolUseId,
            done: false
          }
        ]
      }
    case 'tool-result':
      return {
        ...state,
        items: updateItem(state.items, ev.toolUseId, (item) =>
          item.type === 'tool'
            ? { ...item, done: true, result: ev.content, isError: ev.isError, diff: ev.diff ?? item.diff }
            : item
        )
      }
    case 'permission':
      return {
        ...state,
        items: [
          ...state.items,
          {
            type: 'permission',
            id: ev.requestId,
            toolUseId: ev.toolUseId,
            toolName: ev.toolName,
            input: ev.input,
            reason: ev.reason,
            canAlwaysAllow: ev.canAlwaysAllow,
            diff: ev.diff,
            questions: ev.questions,
            plan: ev.plan,
            status: 'pending'
          }
        ]
      }
    case 'permission-resolved':
      return {
        ...state,
        items: updateItem(state.items, ev.requestId, (item) =>
          item.type === 'permission' ? { ...item, status: ev.allowed ? 'allowed' : 'denied' } : item
        )
      }
    case 'mode':
      return { ...state, mode: ev.permissionMode }
    case 'model':
      return { ...state, model: ev.model }
    case 'busy':
      return { ...state, busy: ev.busy }
    case 'turn-end':
      return {
        ...state,
        items: [
          ...state.items,
          {
            type: 'turn-end',
            id: `turn-${++noticeSeq}`,
            isError: ev.isError,
            message: ev.message,
            usage: ev.usage
          }
        ]
      }
    case 'notice':
      return {
        ...state,
        items: [
          ...state.items,
          { type: 'notice', id: `notice-${++noticeSeq}`, level: ev.level, text: ev.text }
        ]
      }
    case 'closed':
      return { ...state, busy: false }
  }
}

/** Tools whose results change files in the working tree, so the git status should be refreshed. */
export const FILE_CHANGING_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'])

/** The latest TodoWrite list in the conversation, shown pinned above the prompt box. */
export function latestTodos(
  items: ChatItem[]
): { content: string; status: string; activeForm?: string }[] | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.type === 'tool' && item.name === 'TodoWrite' && Array.isArray(item.input.todos)) {
      return item.input.todos as { content: string; status: string; activeForm?: string }[]
    }
  }
  return null
}
