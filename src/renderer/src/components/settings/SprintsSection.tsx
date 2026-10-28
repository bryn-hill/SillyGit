import { useState, type JSX } from 'react'
import {
  SPRINT_LENGTH_CHOICES,
  localDay,
  parseDay,
  sprintAt,
  sprintIndexOfDay,
  sprintLabel,
  type SprintSettings
} from '../../../../shared/sprints'
import Select from '../Select'

export default function SprintsSection({
  sprints,
  onChange
}: {
  sprints: SprintSettings
  onChange: (next: SprintSettings) => void
}): JSX.Element {
  // Drafts, so a half-typed date or number isn't thrown away mid-edit.
  const [startDate, setStartDate] = useState(sprints.startDate)
  const [startNumber, setStartNumber] = useState(String(sprints.startNumber))
  // Take saved values that changed elsewhere, while rendering rather than in an effect.
  const [saved, setSaved] = useState(sprints)
  if (saved.startDate !== sprints.startDate || saved.startNumber !== sprints.startNumber) {
    if (saved.startDate !== sprints.startDate) setStartDate(sprints.startDate)
    if (saved.startNumber !== sprints.startNumber) setStartNumber(String(sprints.startNumber))
    setSaved(sprints)
  }

  const today = localDay(new Date().toISOString())
  const current = today === null ? null : sprintAt(sprintIndexOfDay(today, sprints), sprints)

  return (
    <section className="settings-section" aria-label="Sprints">
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={sprints.enabled}
          onChange={(e) => onChange({ ...sprints, enabled: e.target.checked })}
        />
        Show sprints on the graph
      </label>
      <div className="modal-hint">
        Draws a divider where each sprint starts and shades alternate sprints, so you can see which commits landed in
        which sprint.
      </div>
      {sprints.enabled && (
        <div className="settings-suboptions">
          <div className="settings-inline">
            <label htmlFor="sprint-length">Sprints last</label>
            <Select
              id="sprint-length"
              value={sprints.lengthWeeks}
              onChange={(lengthWeeks) => onChange({ ...sprints, lengthWeeks })}
              options={SPRINT_LENGTH_CHOICES.map((w) => ({ value: w, label: w === 1 ? '1 week' : `${w} weeks` }))}
            />
          </div>
          <div className="settings-inline sprint-start-row">
            <label htmlFor="sprint-start">A sprint started on</label>
            <input
              id="sprint-start"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                if (parseDay(e.target.value) !== null) onChange({ ...sprints, startDate: e.target.value })
              }}
            />
            <label htmlFor="sprint-number">and was number</label>
            <input
              id="sprint-number"
              className="sprint-number-input"
              type="number"
              value={startNumber}
              onChange={(e) => {
                setStartNumber(e.target.value)
                const n = Number(e.target.value)
                if (e.target.value.trim() && Number.isInteger(n)) onChange({ ...sprints, startNumber: n })
              }}
            />
          </div>
          {current && (
            <div className="modal-hint" data-testid="current-sprint">
              Now: {sprintLabel(current, new Date().getFullYear())}. Commits are placed by commit date in your time
              zone.
            </div>
          )}
        </div>
      )}
    </section>
  )
}
