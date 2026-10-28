import { spawn } from 'child_process'
import { constants, promises as fsp } from 'fs'
import { homedir, tmpdir } from 'os'
import { basename, delimiter, extname, isAbsolute, join } from 'path'
import type { MergeToolResult } from '../shared/types'
import { buildMergeToolArgs, mergeToolName, mergeToolPreset, type MergeToolSettings } from '../shared/mergeTools'
import { getMergeToolSettings } from './settings'
import { GitError, runGit } from './gitExec'
import { hasConflictMarkers, pathsWithMarkers } from './conflicts'

// Opens a conflicted file in an external merge tool, GitKraken's "Open in
// <tool>". Like `git mergetool`, the tool gets the three versions as temporary
// files plus the file in the repo to write the result to. When it closes, a
// file without conflict markers is staged (marked resolved).

// Apps started from the Dock or Finder on macOS get a bare PATH, without
// Homebrew's or the user's own bin folders where tools like `code` live.
function searchPath(): string[] {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), 'bin'), join(homedir(), '.local', 'bin')]
  return [...(process.env.PATH ?? '').split(delimiter), ...extra].filter(Boolean)
}

async function isExecutable(path: string): Promise<boolean> {
  return fsp
    .access(path, constants.X_OK)
    .then(() => true)
    .catch(() => false)
}

/** The full path of `program`, looked up on PATH (plus the usual extra folders) and then in `fallbacks`. */
export async function findExecutable(program: string, fallbacks: string[] = []): Promise<string | null> {
  if (isAbsolute(program)) return (await isExecutable(program)) ? program : null
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const dir of searchPath()) {
    for (const ext of exts) {
      const candidate = join(dir, program + ext)
      if (await isExecutable(candidate)) return candidate
    }
  }
  for (const f of fallbacks) if (await isExecutable(f)) return f
  return null
}

function run(program: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // Pipes (not a terminal) on stdout make tools like opendiff wait until
    // the merge window closes instead of returning at once.
    const child = spawn(program, args, {
      cwd,
      env: { ...process.env, PATH: searchPath().join(delimiter) },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.resume()
    child.stderr.resume()
    child.on('error', (err) => reject(new GitError(`Couldn't start the merge tool: ${err.message}`)))
    child.on('close', (code) => resolve(code ?? 1))
  })
}

async function conflictStageShas(repoPath: string, path: string): Promise<Map<number, string>> {
  const out = await runGit(repoPath, ['ls-files', '-u', '-z', '--', path])
  const stages = new Map<number, string>()
  for (const entry of out.split('\0')) {
    const m = entry.match(/^\d+ ([0-9a-f]+) (\d)\t(.*)$/s)
    if (m && m[3] === path) stages.set(Number(m[2]), m[1])
  }
  return stages
}

/** Writes a blob's exact bytes to `file`, or an empty file for a missing side. */
async function writeBlob(repoPath: string, sha: string | undefined, file: string): Promise<void> {
  if (!sha) {
    await fsp.writeFile(file, '')
    return
  }
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn('git', ['cat-file', 'blob', sha], { cwd: repoPath })
    const chunks: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new GitError(`git cat-file exited ${code}`))))
  })
  await fsp.writeFile(file, bytes)
}

async function afterTool(repoPath: string, path: string, exitCode: number, name: string): Promise<MergeToolResult> {
  const file = join(repoPath, path)
  const text = await fsp.readFile(file, 'utf-8').catch(() => null)
  if (text === null) return { resolved: false, reason: `${path} is missing after ${name} closed.` }
  if ((await pathsWithMarkers(repoPath, [path])).length > 0 || hasConflictMarkers(text)) {
    return { resolved: false, reason: `${path} still has conflict markers, so it's still listed as conflicted.` }
  }
  if (exitCode !== 0) {
    return { resolved: false, reason: `${name} exited with code ${exitCode}, so ${path} wasn't marked resolved.` }
  }
  await runGit(repoPath, ['add', '--', path])
  return { resolved: true }
}

async function runGitMergetool(repoPath: string, path: string): Promise<MergeToolResult> {
  const tool = (await runGit(repoPath, ['config', '--get', 'merge.tool']).catch(() => '')).trim()
  if (!tool) throw new GitError('There is no merge tool set in git config (merge.tool).')
  // git mergetool stages the file itself when the merge succeeds.
  const code = await run('git', ['-c', 'mergetool.keepBackup=false', 'mergetool', '--no-prompt', '--', path], repoPath)
  const stillConflicted = (await conflictStageShas(repoPath, path)).size > 0
  if (!stillConflicted) return { resolved: true }
  return {
    resolved: false,
    reason: code === 0 ? `${path} is still listed as conflicted.` : `Could not run the merge tool "${tool}" from git config.`
  }
}

export async function openInMergeTool(
  repoPath: string,
  path: string,
  settings?: MergeToolSettings
): Promise<MergeToolResult> {
  const config = settings ?? (await getMergeToolSettings())
  const name = mergeToolName(config)
  if (config.tool === 'none' || !name) throw new GitError('There is no merge tool configured in your settings.')
  if (config.tool === 'git') return runGitMergetool(repoPath, path)

  const preset = mergeToolPreset(config.tool)
  const template = config.tool === 'custom' ? config.customCommand : preset?.command
  if (!template?.trim()) throw new GitError('There is no merge tool configured in your settings.')

  const stages = await conflictStageShas(repoPath, path)
  if (!stages.has(2) || !stages.has(3)) {
    throw new GitError(`One side deleted ${path}, so there is nothing to merge. Use the built-in merge tool instead.`)
  }

  const dir = await fsp.mkdtemp(join(tmpdir(), 'sillygit-mergetool-'))
  try {
    // Keep the extension so the tool can highlight the syntax.
    const ext = extname(path)
    const stem = basename(path, ext)
    const files = {
      LOCAL: join(dir, `${stem}.LOCAL${ext}`),
      REMOTE: join(dir, `${stem}.REMOTE${ext}`),
      BASE: join(dir, `${stem}.BASE${ext}`),
      MERGED: join(repoPath, path)
    }
    await Promise.all([
      writeBlob(repoPath, stages.get(2), files.LOCAL),
      writeBlob(repoPath, stages.get(3), files.REMOTE),
      writeBlob(repoPath, stages.get(1), files.BASE)
    ])
    const { program, args } = buildMergeToolArgs(template, files)
    const executable = await findExecutable(program, preset?.fallbacks)
    if (!executable) throw new GitError(`The configured merge tool was not found (${program}).`)
    const code = await run(executable, args, repoPath)
    return await afterTool(repoPath, path, code, name)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
