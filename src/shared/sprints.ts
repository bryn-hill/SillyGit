/** Sprint markers on the commit graph. */
export interface SprintSettings {
  /** Off by default: no markers or shading. */
  enabled: boolean
  /** Length of every sprint in weeks. */
  lengthWeeks: number
  /** The first day of one sprint (YYYY-MM-DD). Every sprint starts a whole number of sprint lengths from it. */
  startDate: string
  /** The number of the sprint that starts on `startDate`; the rest count up and down from it. */
  startNumber: number
}

export const SPRINT_LENGTH_CHOICES = [1, 2, 3, 4]

export const DEFAULT_SPRINT_SETTINGS: SprintSettings = {
  enabled: false,
  lengthWeeks: 2,
  startDate: '2026-01-05',
  startNumber: 1
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Days since 1970-01-01 for a YYYY-MM-DD string, or null when it isn't a real date. */
export function parseDay(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const t = Date.UTC(y, mo, d)
  const back = new Date(t)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo || back.getUTCDate() !== d) return null
  return t / DAY_MS
}

/** The calendar day (days since 1970-01-01) an ISO timestamp falls on in local time, or null if unparseable. */
export function localDay(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS
}

/** A day number back to YYYY-MM-DD. */
export function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** Fills in anything missing or malformed in stored settings with the defaults. */
export function normalizeSprintSettings(stored: unknown): SprintSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<SprintSettings>
  const d = DEFAULT_SPRINT_SETTINGS
  const weeks = s.lengthWeeks
  const number = s.startNumber
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : d.enabled,
    lengthWeeks: typeof weeks === 'number' && weeks >= 1 && weeks <= 8 ? Math.round(weeks) : d.lengthWeeks,
    startDate: typeof s.startDate === 'string' && parseDay(s.startDate) !== null ? s.startDate : d.startDate,
    startNumber: typeof number === 'number' && Number.isFinite(number) ? Math.round(number) : d.startNumber
  }
}

export interface Sprint {
  /** Sprints since the one on `startDate` (negative before it). */
  index: number
  /** The sprint's number as the team counts it. */
  number: number
  /** First day, as a day number. */
  start: number
  /** Last day (inclusive), as a day number. */
  end: number
}

export function sprintAt(index: number, settings: SprintSettings): Sprint {
  const anchor = parseDay(settings.startDate) ?? (parseDay(DEFAULT_SPRINT_SETTINGS.startDate) as number)
  const length = settings.lengthWeeks * 7
  const start = anchor + index * length
  return { index, number: settings.startNumber + index, start, end: start + length - 1 }
}

/** Which sprint a calendar day falls in. */
export function sprintIndexOfDay(day: number, settings: SprintSettings): number {
  const anchor = parseDay(settings.startDate) ?? (parseDay(DEFAULT_SPRINT_SETTINGS.startDate) as number)
  return Math.floor((day - anchor) / (settings.lengthWeeks * 7))
}

function shortDate(day: number, withYear: boolean): string {
  const d = new Date(day * DAY_MS)
  const text = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return withYear ? `${text} ${d.getUTCFullYear()}` : text
}

/** "Sprint 12 · 3 Nov – 16 Nov", with years when the sprint isn't in `thisYear` or spans two years. */
export function sprintLabel(sprint: Sprint, thisYear: number): string {
  const startYear = new Date(sprint.start * DAY_MS).getUTCFullYear()
  const endYear = new Date(sprint.end * DAY_MS).getUTCFullYear()
  const range =
    startYear !== endYear
      ? `${shortDate(sprint.start, true)} – ${shortDate(sprint.end, true)}`
      : `${shortDate(sprint.start, false)} – ${shortDate(sprint.end, endYear !== thisYear)}`
  // Before sprint 1 the team wasn't counting yet, so show the dates alone.
  return sprint.number >= 1 ? `Sprint ${sprint.number} · ${range}` : range
}

export interface SprintMark {
  sprint: Sprint
  /** This row is the newest commit of its sprint: draw the divider and label above it. */
  starts: boolean
}

/**
 * Sprint markers for graph rows, newest first. Each row takes the sprint of
 * its date but never a later one than the row above, so a commit with a
 * skewed clock doesn't split a sprint into pieces. Rows without a usable
 * date get the sprint of the row above.
 */
export function sprintMarks(dates: string[], settings: SprintSettings): SprintMark[] {
  const marks: SprintMark[] = []
  let previous: number | null = null
  for (const date of dates) {
    const day = localDay(date)
    let index: number | null = day === null ? previous : sprintIndexOfDay(day, settings)
    if (index === null) index = 0
    if (previous !== null && index > previous) index = previous
    marks.push({ sprint: sprintAt(index, settings), starts: index !== previous })
    previous = index
  }
  return marks
}
