/**
 * The folder name `git clone` would pick for a URL: its last path segment
 * without `.git`, e.g. https://github.com/a/b.git and git@github.com:a/b → b.
 */
export function repoNameFromUrl(url: string): string | null {
  const trimmed = url.trim().replace(/[/\\]+$/, '').replace(/\.git$/i, '').replace(/[/\\]+$/, '')
  const name = trimmed.split(/[/\\:]/).pop() ?? ''
  return name && name !== '.' && name !== '..' ? name : null
}
