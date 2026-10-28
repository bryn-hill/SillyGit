// Interactive rebase: the plan the user builds in the rebase editor, and the
// pure rules that check it and turn it into git's todo list. Everything here
// works in todo order: oldest commit first, the way git applies them.

export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

export const REBASE_ACTIONS: RebaseAction[] = ['pick', 'reword', 'squash', 'fixup', 'drop']

/** A commit the interactive rebase will replay. */
export interface RebaseCommit {
  hash: string
  shortHash: string
  subject: string
  /** The full message, as git stores it. */
  message: string
  author: string
  authorEmail: string
  date: string
}

/** What `planInteractiveRebase` finds: the commits after `base` on the current branch. */
export interface RebasePlan {
  branch: string
  /** HEAD when the plan was made; starting fails if the branch moved since. */
  head: string
  base: { hash: string; shortHash: string; subject: string }
  /** Oldest first. */
  commits: RebaseCommit[]
}

/** One line of the plan as the user left it. */
export interface RebaseStep {
  hash: string
  action: RebaseAction
  /**
   * The message the user typed for the commit this step starts (a reword, or
   * a commit that others squash into). Left out, the default is used.
   */
  message?: string
}

/** A commit that survives the rebase, with the steps folded into it. */
export interface RebaseGroup {
  /** The pick or reword the group starts with. */
  head: RebaseStep
  /** The squashes and fixups that follow it, in order. */
  members: RebaseStep[]
}

/** The commits the plan produces, oldest first. Drops are left out. */
export function groupSteps(steps: RebaseStep[]): RebaseGroup[] {
  const groups: RebaseGroup[] = []
  for (const step of steps) {
    if (step.action === 'drop') continue
    if ((step.action === 'squash' || step.action === 'fixup') && groups.length > 0) {
      groups[groups.length - 1].members.push(step)
    } else {
      groups.push({ head: step, members: [] })
    }
  }
  return groups
}

/** The group a step belongs to, or undefined for a drop. */
export function groupOf(steps: RebaseStep[], hash: string): RebaseGroup | undefined {
  return groupSteps(steps).find((g) => g.head.hash === hash || g.members.some((m) => m.hash === hash))
}

/** Whether a group's commit gets a message other than its first commit's own. */
export function groupNeedsMessage(group: RebaseGroup): boolean {
  return group.head.action === 'reword' || group.members.some((m) => m.action === 'squash')
}

/**
 * The message a group's commit gets unless the user typed one: the first
 * commit's message followed by each squashed commit's, like git's own
 * squash; fixups contribute nothing.
 */
export function defaultGroupMessage(group: RebaseGroup, messageOf: (hash: string) => string): string {
  return [group.head, ...group.members.filter((m) => m.action === 'squash')]
    .map((s) => messageOf(s.hash).trim())
    .filter((m) => m.length > 0)
    .join('\n\n')
}

/** The message a group's commit ends up with, or null when it keeps its own. */
export function finalGroupMessage(group: RebaseGroup, messageOf: (hash: string) => string): string | null {
  if (!groupNeedsMessage(group)) return null
  return group.head.message ?? defaultGroupMessage(group, messageOf)
}

/** Why the plan can't run, or null when it can. */
export function validateSteps(steps: RebaseStep[], messageOf: (hash: string) => string): string | null {
  const first = steps.find((s) => s.action !== 'drop')
  if (first && (first.action === 'squash' || first.action === 'fixup')) {
    return `The oldest commit can't be ${first.action === 'squash' ? 'squashed' : 'fixed up'}: there is no commit below it to combine with.`
  }
  for (const group of groupSteps(steps)) {
    const message = finalGroupMessage(group, messageOf)
    if (message !== null && !message.trim()) return 'A commit message can\'t be empty.'
  }
  return null
}

/** Whether the plan changes anything at all. */
export function isNoop(steps: RebaseStep[], original: string[], messageOf: (hash: string) => string): boolean {
  if (steps.length !== original.length || steps.some((s, i) => s.hash !== original[i])) return false
  return steps.every(
    (s) => s.action === 'pick' || (s.action === 'reword' && (s.message ?? messageOf(s.hash)).trim() === messageOf(s.hash).trim())
  )
}

/**
 * Git's todo list for the plan. Squashes run as git's own squash so its
 * editor is asked for the combined message, which the app's editor script
 * then fills in from `messageFiles`.
 */
export function buildTodo(steps: RebaseStep[]): string {
  const lines = steps.map((s) => `${s.action} ${s.hash}`)
  // A todo with nothing left to apply makes git stop with "nothing to do".
  return (lines.length > 0 ? lines : ['noop']).join('\n') + '\n'
}

/**
 * The messages the app's editor script hands git, by the commit git is on
 * when it asks: a reword is asked about at its own step, and a group with a
 * squash at its last step.
 */
export function messageFiles(steps: RebaseStep[], messageOf: (hash: string) => string): Map<string, string> {
  const files = new Map<string, string>()
  for (const group of groupSteps(steps)) {
    const message = finalGroupMessage(group, messageOf)
    if (message === null) continue
    const text = message.trim() + '\n'
    if (group.head.action === 'reword') files.set(group.head.hash, text)
    if (group.members.length > 0) files.set(group.members[group.members.length - 1].hash, text)
  }
  return files
}
