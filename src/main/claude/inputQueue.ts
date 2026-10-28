import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

export class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiting: ((result: IteratorResult<SDKUserMessage>) => void) | null = null
  private ended = false

  push(message: SDKUserMessage): void {
    if (this.waiting) {
      const w = this.waiting
      this.waiting = null
      w({ value: message, done: false })
    } else {
      this.items.push(message)
    }
  }

  end(): void {
    this.ended = true
    if (this.waiting) {
      this.waiting({ value: undefined, done: true })
      this.waiting = null
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item) return Promise.resolve({ value: item, done: false })
        if (this.ended) return Promise.resolve({ value: undefined, done: true })
        return new Promise((r) => (this.waiting = r))
      }
    }
  }
}
