import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPRINT_SETTINGS,
  normalizeSprintSettings,
  parseDay,
  sprintAt,
  sprintIndexOfDay,
  sprintLabel,
  sprintMarks,
  type SprintSettings
} from './sprints'

const settings: SprintSettings = { enabled: true, lengthWeeks: 2, startDate: '2026-10-05', startNumber: 10 }
const day = (ymd: string): number => parseDay(ymd) as number
// Midday local time, so the local calendar day is the one written.
const at = (ymd: string): string => new Date(`${ymd}T12:00:00`).toISOString()

describe('parseDay', () => {
  it('rejects malformed and impossible dates', () => {
    expect(parseDay('2026-02-30')).toBeNull()
    expect(parseDay('26-1-1')).toBeNull()
    expect(parseDay('2026-01-05')).not.toBeNull()
  })
})

describe('sprint maths', () => {
  it('puts the start date and the last day in the same sprint', () => {
    expect(sprintIndexOfDay(day('2026-10-05'), settings)).toBe(0)
    expect(sprintIndexOfDay(day('2026-10-18'), settings)).toBe(0)
    expect(sprintIndexOfDay(day('2026-10-19'), settings)).toBe(1)
    expect(sprintIndexOfDay(day('2026-10-04'), settings)).toBe(-1)
  })

  it('numbers sprints from the start number', () => {
    expect(sprintAt(2, settings).number).toBe(12)
    expect(sprintAt(-3, settings).number).toBe(7)
  })

  it('labels a sprint with its number and dates', () => {
    expect(sprintLabel(sprintAt(1, settings), 2026)).toBe('Sprint 11 · 19 Oct – 1 Nov')
    expect(sprintLabel(sprintAt(1, settings), 2027)).toBe('Sprint 11 · 19 Oct – 1 Nov 2026')
    expect(sprintLabel(sprintAt(6, settings), 2026)).toBe('Sprint 16 · 28 Dec 2026 – 10 Jan 2027')
    expect(sprintLabel(sprintAt(-10, settings), 2026)).toBe('18 May – 31 May')
  })
})

describe('sprintMarks', () => {
  it('starts a new sprint where the date crosses a boundary', () => {
    const marks = sprintMarks(
      [at('2026-10-27'), at('2026-10-20'), at('2026-10-19'), at('2026-10-18'), at('2026-10-06')],
      settings
    )
    expect(marks.map((m) => m.sprint.number)).toEqual([11, 11, 11, 10, 10])
    expect(marks.map((m) => m.starts)).toEqual([true, false, false, true, false])
  })

  it('keeps a commit with a skewed clock in the sprint above it', () => {
    const marks = sprintMarks([at('2026-10-20'), at('2026-10-10'), at('2026-10-25'), at('2026-10-08')], settings)
    expect(marks.map((m) => m.sprint.number)).toEqual([11, 10, 10, 10])
    expect(marks.map((m) => m.starts)).toEqual([true, true, false, false])
  })

  it('marks a gap of several sprints with one divider', () => {
    const marks = sprintMarks([at('2026-10-20'), at('2026-08-01')], settings)
    expect(marks[1].starts).toBe(true)
    expect(marks[1].sprint.number).toBe(5)
  })
})

describe('normalizeSprintSettings', () => {
  it('is off by default', () => {
    expect(normalizeSprintSettings(undefined)).toEqual(DEFAULT_SPRINT_SETTINGS)
    expect(DEFAULT_SPRINT_SETTINGS.enabled).toBe(false)
  })

  it('replaces bad values with defaults', () => {
    expect(normalizeSprintSettings({ enabled: true, lengthWeeks: 0, startDate: 'soon', startNumber: 'x' })).toEqual({
      ...DEFAULT_SPRINT_SETTINGS,
      enabled: true
    })
  })
})
