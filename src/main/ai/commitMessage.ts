import { MAX_DIFF_CHARS, callClaude } from './client'

// Writing a commit message from the staged diff.

function buildCommitMessagePrompt(diff: string): string {
  let trimmedDiff = diff
  let truncatedNote = ''
  if (trimmedDiff.length > MAX_DIFF_CHARS) {
    trimmedDiff = trimmedDiff.slice(0, MAX_DIFF_CHARS)
    truncatedNote = '\n\n[diff truncated for length]'
  }
  return [
    'Write a git commit message for the following staged changes.',
    '',
    'Diff (unified format):',
    '```diff',
    trimmedDiff + truncatedNote,
    '```',
    '',
    'Use the conventional style: a concise, imperative-mood subject line under 72 characters (e.g. "fix: handle empty input"), optionally followed by a blank line and a short body explaining the why if it is not obvious from the subject. Do not describe every line changed. Respond with ONLY the commit message text, no prose outside of it, no quotes or markdown fences around it.'
  ].join('\n')
}

export async function generateCommitMessage(diff: string): Promise<string> {
  const prompt = buildCommitMessagePrompt(diff)
  const text = await callClaude(prompt)
  return text.trim()
}
