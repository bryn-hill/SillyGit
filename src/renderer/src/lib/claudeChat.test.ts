import { describe, expect, it } from 'vitest'
import type { ClaudeEvent, ClaudeUsage } from '../../../shared/claude'
import { initialChatState, latestTodos, reduceChat, type ChatItem, type ChatState } from './claudeChat'

const usage: ClaudeUsage = { inputTokens: 1, outputTokens: 2 }

const play = (events: ClaudeEvent[], from: ChatState = initialChatState()): ChatState => events.reduce(reduceChat, from)

describe('reduceChat', () => {
  it('starts empty, in the requested mode', () => {
    expect(initialChatState()).toMatchObject({ items: [], busy: false, sessionId: null, mode: 'default' })
    expect(initialChatState('plan').mode).toBe('plan')
  })

  it('records the session, mode, model and busy state', () => {
    const state = play([
      { kind: 'ready', sessionId: 's1', model: 'm1', permissionMode: 'acceptEdits', cwd: '/repo' },
      { kind: 'busy', busy: true },
      { kind: 'model', model: 'm2' },
      { kind: 'mode', permissionMode: 'plan' }
    ])
    expect(state).toMatchObject({ sessionId: 's1', model: 'm2', mode: 'plan', busy: true })
    expect(reduceChat(state, { kind: 'closed' }).busy).toBe(false)
  })

  it('streams text into the block it started', () => {
    const state = play([
      { kind: 'user', id: 'u1', text: 'hi' },
      { kind: 'block-start', key: 'b1', block: 'text', parentToolUseId: null },
      { kind: 'block-start', key: 'b2', block: 'thinking', parentToolUseId: null },
      { kind: 'block-delta', key: 'b1', text: 'Hel' },
      { kind: 'block-delta', key: 'b2', text: 'hmm' },
      { kind: 'block-delta', key: 'b1', text: 'lo' }
    ])
    expect(state.items).toEqual([
      { type: 'user', id: 'u1', text: 'hi' },
      { type: 'text', id: 'b1', text: 'Hello', parent: null },
      { type: 'thinking', id: 'b2', text: 'hmm', parent: null }
    ])
  })

  it('ignores a delta for a block it has not seen', () => {
    const before = play([{ kind: 'user', id: 'u1', text: 'hi' }])
    const after = reduceChat(before, { kind: 'block-delta', key: 'nope', text: 'x' })
    expect(after.items).toBe(before.items)
  })

  it('adds a whole block at once', () => {
    const state = play([{ kind: 'block-full', key: 'b', block: 'text', text: 'done', parentToolUseId: 't1' }])
    expect(state.items).toEqual([{ type: 'text', id: 'b', text: 'done', parent: 't1' }])
  })

  it('completes a tool call with its result, keeping an earlier diff', () => {
    const started = play([
      { kind: 'tool-use', toolUseId: 't1', name: 'Edit', input: { file_path: 'a.ts' }, parentToolUseId: null }
    ])
    expect(started.items[0]).toMatchObject({ type: 'tool', done: false })

    const withDiff = { ...started, items: [{ ...(started.items[0] as ChatItem & { type: 'tool' }), diff: 'D' }] }
    const finished = reduceChat(withDiff, { kind: 'tool-result', toolUseId: 't1', content: 'ok', isError: false })
    expect(finished.items[0]).toMatchObject({ type: 'tool', done: true, result: 'ok', isError: false, diff: 'D' })

    const replaced = reduceChat(withDiff, { kind: 'tool-result', toolUseId: 't1', content: 'ok', isError: false, diff: 'E' })
    expect(replaced.items[0]).toMatchObject({ diff: 'E' })
  })

  it("doesn't turn a text block into a tool result when ids collide", () => {
    const state = play([
      { kind: 'block-full', key: 'x', block: 'text', text: 'hello', parentToolUseId: null },
      { kind: 'tool-result', toolUseId: 'x', content: 'ok', isError: false }
    ])
    expect(state.items[0]).toEqual({ type: 'text', id: 'x', text: 'hello', parent: null })
  })

  it('tracks a permission request until it is answered', () => {
    const asked = play([
      { kind: 'permission', requestId: 'p1', toolName: 'Bash', input: { command: 'ls' }, canAlwaysAllow: true },
      { kind: 'permission', requestId: 'p2', toolName: 'Write', input: {}, canAlwaysAllow: false }
    ])
    expect(asked.items.map((i) => i.type === 'permission' && i.status)).toEqual(['pending', 'pending'])

    const answered = play(
      [
        { kind: 'permission-resolved', requestId: 'p2', allowed: false },
        { kind: 'permission-resolved', requestId: 'p1', allowed: true }
      ],
      asked
    )
    expect(answered.items.map((i) => i.type === 'permission' && i.status)).toEqual(['allowed', 'denied'])
  })

  it('gives every turn end and notice its own id', () => {
    const state = play([
      { kind: 'turn-end', isError: false, usage },
      { kind: 'notice', level: 'error', text: 'oops' },
      { kind: 'turn-end', isError: true, message: 'failed', usage }
    ])
    expect(new Set(state.items.map((i) => i.id)).size).toBe(3)
    expect(state.items[1]).toMatchObject({ type: 'notice', level: 'error', text: 'oops' })
    expect(state.items[2]).toMatchObject({ type: 'turn-end', isError: true, message: 'failed' })
  })

  it('keeps commands and models from the session', () => {
    const state = play([
      {
        kind: 'commands',
        commands: [{ name: 'compact', description: 'Compact the chat', argumentHint: '' }],
        models: [{ value: 'x', displayName: 'X', description: '' }]
      }
    ])
    expect(state.commands).toHaveLength(1)
    expect(state.models).toHaveLength(1)
  })

  it('never mutates the previous state', () => {
    const before = play([{ kind: 'block-start', key: 'b', block: 'text', parentToolUseId: null }])
    const snapshot = JSON.stringify(before)
    reduceChat(before, { kind: 'block-delta', key: 'b', text: 'more' })
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('latestTodos', () => {
  const todoWrite = (id: string, todos: unknown): ChatItem => ({
    type: 'tool',
    id,
    name: 'TodoWrite',
    input: { todos },
    parent: null,
    done: true
  })

  it('is the newest TodoWrite list', () => {
    const items: ChatItem[] = [
      todoWrite('1', [{ content: 'old', status: 'completed' }]),
      { type: 'text', id: 't', text: 'x', parent: null },
      todoWrite('2', [{ content: 'new', status: 'in_progress', activeForm: 'Doing new' }])
    ]
    expect(latestTodos(items)).toEqual([{ content: 'new', status: 'in_progress', activeForm: 'Doing new' }])
  })

  it('skips malformed lists and is null without any', () => {
    expect(latestTodos([todoWrite('1', [{ content: 'a', status: 'pending' }]), todoWrite('2', 'oops')])).toEqual([
      { content: 'a', status: 'pending' }
    ])
    expect(latestTodos([])).toBeNull()
  })
})
