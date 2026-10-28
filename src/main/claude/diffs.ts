import { execFile } from 'child_process'
import { promises as fsp } from 'fs'
import { tmpdir } from 'os'
import { join, isAbsolute, resolve } from 'path'
import { randomUUID } from 'crypto'

// Turning tool results and proposed edits into text and diffs for the chat panel.

const MAX_TOOL_RESULT_CHARS = 20000
const MAX_DIFF_FILE_BYTES = 2 * 1024 * 1024

export function toolResultText(content: unknown): string {
  let text: string
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    text = content
      .map((c) => {
        if (c && typeof c === 'object' && 'type' in c) {
          if (c.type === 'text' && 'text' in c) return String(c.text)
          if (c.type === 'image') return '[image]'
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  } else text = ''
  return text.length > MAX_TOOL_RESULT_CHARS ? text.slice(0, MAX_TOOL_RESULT_CHARS) + '\n[truncated]' : text
}

interface StructuredHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export function structuredPatchText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object' || !('structuredPatch' in result)) return undefined
  const hunks = (result as { structuredPatch: unknown }).structuredPatch
  if (!Array.isArray(hunks) || hunks.length === 0) return undefined
  return (hunks as StructuredHunk[])
    .map((h) => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines].join('\n'))
    .join('\n')
}

// `git diff --no-index` exits 1 when the files differ, which execFile reports
// as an error, so read stdout off the error in that case.
function gitDiffNoIndex(a: string, b: string): Promise<string> {
  return new Promise((res) => {
    execFile(
      'git',
      ['diff', '--no-index', '--no-color', '-U3', '--', a, b],
      { maxBuffer: 1024 * 1024 * 16 },
      (err, stdout) => {
        if (err && (err as { code?: number }).code !== 1) res('')
        else res(stdout)
      }
    )
  })
}

/** Unified diff (hunks only) of what an Edit/Write tool call would change, for the permission card. */
export async function proposedDiff(
  cwd: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<string | undefined> {
  const filePath = typeof input.file_path === 'string' ? input.file_path : null
  if (!filePath) return undefined
  const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath)

  let before = ''
  try {
    const stat = await fsp.stat(abs)
    if (stat.size > MAX_DIFF_FILE_BYTES) return undefined
    before = await fsp.readFile(abs, 'utf-8')
  } catch {
    // new file
  }

  let after: string
  if (toolName === 'Write') {
    if (typeof input.content !== 'string') return undefined
    after = input.content
  } else if (toolName === 'Edit') {
    const oldStr = typeof input.old_string === 'string' ? input.old_string : null
    const newStr = typeof input.new_string === 'string' ? input.new_string : null
    if (oldStr == null || newStr == null) return undefined
    const at = before.indexOf(oldStr)
    if (oldStr === '' || at < 0) return undefined
    after = input.replace_all
      ? before.split(oldStr).join(newStr)
      : before.slice(0, at) + newStr + before.slice(at + oldStr.length)
  } else {
    return undefined
  }

  const dir = join(tmpdir(), `sillygit-claude-${randomUUID()}`)
  await fsp.mkdir(dir, { recursive: true })
  try {
    const a = join(dir, 'before')
    const b = join(dir, 'after')
    await Promise.all([fsp.writeFile(a, before), fsp.writeFile(b, after)])
    const out = await gitDiffNoIndex(a, b)
    const start = out.indexOf('\n@@')
    return start >= 0 ? out.slice(start + 1).replace(/\n$/, '') : undefined
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
}
