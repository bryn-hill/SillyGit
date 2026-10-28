import type { JSX } from 'react'
import Select from '../Select'
import { STALE_DAY_CHOICES, type BranchListSettings } from '../../../../shared/branchStatus'

function staleChoiceLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`
  if (days % 30 === 0 && days >= 60) return `${days / 30} months`
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`
  return `${days} days`
}

export default function BranchesSection({
  branchList,
  onChange
}: {
  branchList: BranchListSettings
  onChange: (next: BranchListSettings) => void
}): JSX.Element {
  // Keep a value set elsewhere (or by hand in the settings file) selectable.
  const choices = STALE_DAY_CHOICES.includes(branchList.staleDays)
    ? STALE_DAY_CHOICES
    : [...STALE_DAY_CHOICES, branchList.staleDays].sort((a, b) => a - b)
  return (
    <section className="settings-section" aria-label="Branches">
      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={branchList.staleEnabled}
          onChange={(e) => onChange({ ...branchList, staleEnabled: e.target.checked })}
        />
        Tag stale branches
      </label>
      {branchList.staleEnabled && (
        <div className="settings-suboptions">
          <div className="settings-inline">
            <label htmlFor="stale-days">Stale after no commits for</label>
            <Select
              id="stale-days"
              value={branchList.staleDays}
              onChange={(staleDays) => onChange({ ...branchList, staleDays })}
              options={choices.map((d) => ({ value: d, label: staleChoiceLabel(d) }))}
            />
          </div>
        </div>
      )}
      <div className="modal-hint">
        The branch list tags a branch &quot;stale&quot; with how long since its last commit. Branches deleted on the
        remote are tagged &quot;deleted&quot; after a fetch.
      </div>
    </section>
  )
}
