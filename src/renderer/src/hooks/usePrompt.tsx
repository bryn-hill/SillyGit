import { useState, type JSX } from 'react'
import PromptDialog, { type PromptRequest } from '../components/PromptDialog'

/**
 * Asks for one line of text in a dialog. `askText` resolves to null when it's
 * cancelled; render `dialog` wherever the dialog should go.
 */
export function usePrompt(): { askText: (request: PromptRequest) => Promise<string | null>; dialog: JSX.Element | null } {
  const [prompt, setPrompt] = useState<(PromptRequest & { resolve: (value: string | null) => void }) | null>(null)
  const askText = (request: PromptRequest): Promise<string | null> =>
    new Promise((resolve) => setPrompt({ ...request, resolve }))
  const dialog = prompt && (
    <PromptDialog
      key={prompt.title}
      {...prompt}
      onSubmit={(value) => {
        setPrompt(null)
        prompt.resolve(value)
      }}
      onCancel={() => {
        setPrompt(null)
        prompt.resolve(null)
      }}
    />
  )
  return { askText, dialog }
}
