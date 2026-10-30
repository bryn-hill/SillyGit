/** "WIP on main: 1a2b3c4 Subject" -> "Subject"; "On main: my note" -> "my note". */
export function stashTitle(message: string): string {
  const wip = message.match(/^WIP on [^:]+: [0-9a-f]+ (.*)$/)
  if (wip) return wip[1]
  const named = message.match(/^On [^:]+: (.*)$/)
  return named ? named[1] : message
}

/** The branch a stash was made on, from its message, or null when git didn't say. */
export function stashBranch(message: string): string | null {
  return message.match(/^(?:WIP on|On) ([^:]+):/)?.[1] ?? null
}
