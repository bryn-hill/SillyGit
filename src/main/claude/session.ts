import { resolve } from 'path'
import { randomUUID } from 'crypto'
import type {
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { getApiKey } from '../settings'
import { claudeExecutable } from './executable'
import type {
  ClaudeEvent,
  ClaudePermissionDecision,
  ClaudePermissionMode,
  ClaudeQuestion,
  ClaudeStartOptions
} from '../../shared/claude'
import { proposedDiff, structuredPatchText, toolResultText } from './diffs'
import { InputQueue } from './inputQueue'

// One chat: an Agent SDK query fed by an input queue, its permission prompts and events.

export interface ClaudeImage {
  mediaType: string
  data: string
}

export type Emit = (event: ClaudeEvent) => void

interface PendingPermission {
  resolve: (result: PermissionResult) => void
  input: Record<string, unknown>
  suggestions?: PermissionUpdate[]
}

function asPermissionMode(mode: string | undefined): ClaudePermissionMode {
  return mode === 'acceptEdits' || mode === 'plan' || mode === 'bypassPermissions' ? mode : 'default'
}

// Slash commands and local command output are stored in the transcript as
// XML-ish wrappers; show the command itself and hide the rest.
function displayUserText(text: string): string | null {
  const cmd = text.match(/<command-name>([^<]*)<\/command-name>/)
  if (cmd) {
    const args = text.match(/<command-args>([^<]*)<\/command-args>/)?.[1]?.trim()
    return args ? `${cmd[1]} ${args}` : cmd[1]
  }
  if (text.trimStart().startsWith('<')) return null
  return text
}

export class ChatSession {
  private queue = new InputQueue()
  private query: Query | null = null
  private pending = new Map<string, PendingPermission>()
  private streamedMessages = new Set<string>()
  private currentMessage = new Map<string, string>()
  private sessionId: string | undefined
  private closed = true
  private disposed = false
  private model: string | undefined
  private mode: ClaudePermissionMode

  constructor(
    private readonly cwd: string,
    private readonly emit: Emit,
    opts: ClaudeStartOptions
  ) {
    this.sessionId = opts.resume
    this.model = opts.model
    this.mode = opts.permissionMode ?? 'default'
  }

  async start(replay: boolean): Promise<void> {
    if (replay && this.sessionId) await this.replayHistory(this.sessionId)
    await this.launch()
  }

  private async launch(): Promise<void> {
    // An explicitly stored/env API key overrides subscription billing, the
    // same way as the one-shot AI review calls in ai.ts.
    const apiKey = await getApiKey()
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    this.queue = new InputQueue()
    this.closed = false

    this.query = query({
      prompt: this.queue,
      options: {
        cwd: this.cwd,
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        ...(this.model ? { model: this.model } : {}),
        permissionMode: this.mode,
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
        canUseTool: (toolName, input, options) => this.requestPermission(toolName, input, options),
        stderr: (data) => console.error('[claude]', data.trimEnd()),
        pathToClaudeCodeExecutable: claudeExecutable(),
        ...(apiKey ? { env: { ...process.env, ANTHROPIC_API_KEY: apiKey } } : {})
      }
    })

    this.loadCatalog(this.query)
    this.consume(this.query)
  }

  private async loadCatalog(q: Query): Promise<void> {
    try {
      const [commands, models] = await Promise.all([q.supportedCommands(), q.supportedModels()])
      this.emit({
        kind: 'commands',
        commands: commands.map((c) => ({
          name: c.name,
          description: c.description,
          argumentHint: c.argumentHint
        })),
        models: models.map((m) => ({
          value: m.value,
          resolvedModel: m.resolvedModel,
          displayName: m.displayName,
          description: m.description
        }))
      })
    } catch {
      // the session may have ended before initializing; the next launch retries
    }
  }

  private async consume(q: Query): Promise<void> {
    try {
      for await (const message of q) this.handle(message)
    } catch (err) {
      if (!this.disposed) {
        this.emit({ kind: 'notice', level: 'error', text: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      if (this.query === q) {
        this.closed = true
        this.query = null
        for (const p of this.pending.values()) p.resolve({ behavior: 'deny', message: 'Session ended.' })
        this.pending.clear()
        if (!this.disposed) this.emit({ kind: 'busy', busy: false })
      }
    }
  }

  send(text: string, images: ClaudeImage[] = []): void {
    if (this.disposed) return
    const content: SDKUserMessage['message']['content'] = images.length
      ? [
          ...images.map((img) => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              data: img.data
            }
          })),
          { type: 'text' as const, text }
        ]
      : text
    this.emit({
      kind: 'user',
      id: randomUUID(),
      text: images.length ? `${text}\n[${images.length} image(s)]` : text
    })
    this.emit({ kind: 'busy', busy: true })
    // The Claude Code process exits if it crashes or the panel was idle when
    // the app reloaded; pick the same session back up transparently.
    if (this.closed) this.launch()
    this.queue.push({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: null })
  }

  async interrupt(): Promise<void> {
    await this.query?.interrupt().catch(() => undefined)
  }

  async setMode(mode: ClaudePermissionMode): Promise<void> {
    this.mode = mode
    await this.query?.setPermissionMode(mode)
    this.emit({ kind: 'mode', permissionMode: mode })
  }

  async setModel(model: string): Promise<void> {
    this.model = model
    await this.query?.setModel(model)
    this.emit({ kind: 'model', model })
  }

  respond(requestId: string, decision: ClaudePermissionDecision): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)

    if (decision.behavior === 'deny') {
      const message = decision.message?.trim()
      pending.resolve(
        message
          ? { behavior: 'deny', message: `The user declined this action and said: ${message}` }
          : { behavior: 'deny', message: 'The user declined this action.', interrupt: true }
      )
    } else {
      const updatedPermissions: PermissionUpdate[] = []
      if (decision.always && pending.suggestions) updatedPermissions.push(...pending.suggestions)
      if (decision.setMode)
        updatedPermissions.push({ type: 'setMode', mode: decision.setMode, destination: 'session' })
      pending.resolve({
        behavior: 'allow',
        updatedInput: decision.answers ? { ...pending.input, answers: decision.answers } : pending.input,
        ...(updatedPermissions.length ? { updatedPermissions } : {})
      })
      // "Allow for this session" on an edit comes back as a suggestion to
      // switch the session to acceptEdits, so the mode picker must follow it.
      const modeUpdate = [...updatedPermissions].reverse().find((u) => u.type === 'setMode')
      if (modeUpdate && modeUpdate.type === 'setMode') {
        this.mode = asPermissionMode(modeUpdate.mode)
        this.emit({ kind: 'mode', permissionMode: this.mode })
      }
    }
    this.emit({ kind: 'permission-resolved', requestId, allowed: decision.behavior === 'allow' })
  }

  close(): void {
    this.disposed = true
    for (const p of this.pending.values()) p.resolve({ behavior: 'deny', message: 'Session closed.' })
    this.pending.clear()
    this.queue.end()
    this.query?.close()
    this.query = null
  }

  private async requestPermission(
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: AbortSignal
      suggestions?: PermissionUpdate[]
      decisionReason?: string
      toolUseID?: string
    }
  ): Promise<PermissionResult> {
    const requestId = randomUUID()
    let diff: string | undefined
    try {
      diff = await proposedDiff(this.cwd, toolName, input)
    } catch {
      diff = undefined
    }
    const questions =
      toolName === 'AskUserQuestion' && Array.isArray(input.questions)
        ? (input.questions as ClaudeQuestion[])
        : undefined
    const plan = toolName === 'ExitPlanMode' && typeof input.plan === 'string' ? input.plan : undefined

    return new Promise<PermissionResult>((resolvePermission) => {
      this.pending.set(requestId, { resolve: resolvePermission, input, suggestions: options.suggestions })
      options.signal.addEventListener('abort', () => {
        if (!this.pending.delete(requestId)) return
        resolvePermission({ behavior: 'deny', message: 'Cancelled.' })
        this.emit({ kind: 'permission-resolved', requestId, allowed: false })
      })
      this.emit({
        kind: 'permission',
        requestId,
        toolUseId: options.toolUseID,
        toolName,
        input,
        reason: options.decisionReason,
        canAlwaysAllow: !!options.suggestions?.length,
        diff,
        questions,
        plan
      })
    })
  }

  private handle(message: SDKMessage): void {
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          this.sessionId = message.session_id
          this.mode = asPermissionMode(message.permissionMode)
          this.emit({
            kind: 'ready',
            sessionId: message.session_id,
            model: message.model,
            permissionMode: this.mode,
            cwd: message.cwd
          })
        } else if (message.subtype === 'compact_boundary') {
          this.emit({ kind: 'notice', level: 'info', text: 'Conversation compacted' })
        }
        return

      case 'stream_event': {
        const parent = message.parent_tool_use_id
        const scope = parent ?? ''
        const ev = message.event
        if (ev.type === 'message_start') {
          this.currentMessage.set(scope, ev.message.id)
          this.streamedMessages.add(ev.message.id)
        } else if (ev.type === 'content_block_start') {
          const block = ev.content_block.type
          if (block === 'text' || block === 'thinking') {
            const key = `${this.currentMessage.get(scope)}:${ev.index}`
            this.emit({ kind: 'block-start', key, block, parentToolUseId: parent })
          }
        } else if (ev.type === 'content_block_delta') {
          const key = `${this.currentMessage.get(scope)}:${ev.index}`
          if (ev.delta.type === 'text_delta') this.emit({ kind: 'block-delta', key, text: ev.delta.text })
          else if (ev.delta.type === 'thinking_delta')
            this.emit({ kind: 'block-delta', key, text: ev.delta.thinking })
        }
        return
      }

      case 'assistant': {
        const msg = message.message
        const streamed = this.streamedMessages.has(msg.id)
        msg.content.forEach((block, i) => {
          if (block.type === 'tool_use') {
            this.emit({
              kind: 'tool-use',
              toolUseId: block.id,
              name: block.name,
              input: (block.input ?? {}) as Record<string, unknown>,
              parentToolUseId: message.parent_tool_use_id
            })
          } else if (!streamed && (block.type === 'text' || block.type === 'thinking')) {
            this.emit({
              kind: 'block-full',
              key: `${message.uuid}:${i}`,
              block: block.type,
              text: block.type === 'text' ? block.text : block.thinking,
              parentToolUseId: message.parent_tool_use_id
            })
          }
        })
        if (message.error) this.emit({ kind: 'notice', level: 'error', text: `API error: ${message.error}` })
        return
      }

      case 'user': {
        const content = message.message.content
        if (!Array.isArray(content)) return
        for (const block of content) {
          if (block.type !== 'tool_result') continue
          this.emit({
            kind: 'tool-result',
            toolUseId: block.tool_use_id,
            content: toolResultText(block.content),
            isError: !!block.is_error,
            diff: structuredPatchText(message.tool_use_result)
          })
        }
        return
      }

      case 'result': {
        const isError = message.subtype !== 'success' || message.is_error
        this.emit({
          kind: 'turn-end',
          isError,
          message:
            message.subtype === 'success'
              ? message.is_error
                ? message.result
                : undefined
              : message.errors.join('; ') || message.subtype,
          usage: {
            costUsd: message.total_cost_usd,
            durationMs: message.duration_ms,
            numTurns: message.num_turns,
            inputTokens: message.usage?.input_tokens,
            outputTokens: message.usage?.output_tokens
          }
        })
        this.emit({ kind: 'busy', busy: false })
        return
      }

      default:
        return
    }
  }

  private async replayHistory(sessionId: string): Promise<void> {
    const { getSessionMessages } = await import('@anthropic-ai/claude-agent-sdk')
    let messages
    try {
      messages = await getSessionMessages(sessionId, { dir: this.cwd })
    } catch (err) {
      this.emit({ kind: 'notice', level: 'error', text: `Could not load the conversation: ${String(err)}` })
      return
    }
    for (const m of messages) {
      const msg = m.message as { content?: unknown } | null
      const content = msg?.content
      if (m.type === 'user') {
        if (typeof content === 'string') {
          const text = displayUserText(content)
          if (text) this.emit({ kind: 'user', id: m.uuid, text })
          continue
        }
        if (!Array.isArray(content)) continue
        const texts: string[] = []
        for (const block of content as { type: string; [k: string]: unknown }[]) {
          if (block.type === 'tool_result') {
            this.emit({
              kind: 'tool-result',
              toolUseId: String(block.tool_use_id),
              content: toolResultText(block.content),
              isError: !!block.is_error
            })
          } else if (block.type === 'text') {
            const text = displayUserText(String(block.text))
            if (text) texts.push(text)
          } else if (block.type === 'image') {
            texts.push('[image]')
          }
        }
        if (texts.length && !m.parent_tool_use_id)
          this.emit({ kind: 'user', id: m.uuid, text: texts.join('\n') })
      } else if (m.type === 'assistant' && Array.isArray(content)) {
        ;(content as { type: string; [k: string]: unknown }[]).forEach((block, i) => {
          if (block.type === 'text' || block.type === 'thinking') {
            this.emit({
              kind: 'block-full',
              key: `${m.uuid}:${i}`,
              block: block.type,
              text: String(block.type === 'text' ? block.text : block.thinking),
              parentToolUseId: m.parent_tool_use_id
            })
          } else if (block.type === 'tool_use') {
            this.emit({
              kind: 'tool-use',
              toolUseId: String(block.id),
              name: String(block.name),
              input: (block.input ?? {}) as Record<string, unknown>,
              parentToolUseId: m.parent_tool_use_id
            })
          }
        })
      }
    }
  }
}
