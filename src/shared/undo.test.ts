import { describe, expect, it } from 'vitest'
import { planUndo } from './undo'

describe('planUndo', () => {
  it('undoes a checkout by checking the previous branch out', () => {
    expect(planUndo('checkout: moving from main to feature', 'commit: older')).toEqual({
      kind: 'checkout',
      target: 'main',
      label: 'Undo checkout of feature'
    })
  })

  it('ignores a checkout of the branch that was already out', () => {
    expect(planUndo('checkout: moving from main to main', null)).toBeNull()
  })

  it('undoes a commit softly so its changes stay staged', () => {
    expect(planUndo('commit: Add login', 'commit: Add login')).toEqual({
      kind: 'reset',
      mode: 'soft',
      label: 'Undo commit “Add login”'
    })
  })

  it('undoes an amend softly', () => {
    expect(planUndo('commit (amend): Fix', 'commit (amend): Fix')?.label).toBe('Undo amend of “Fix”')
  })

  it('keeps uncommitted changes safe when undoing merges, pulls, rebases and picks', () => {
    for (const subject of [
      'merge feature: Fast-forward',
      'commit (merge): Merge branch x',
      'pull: Fast-forward',
      'pull --rebase (finish): refs/heads/main onto abc',
      'rebase (finish): refs/heads/feature onto abc',
      'cherry-pick: Add thing',
      'revert: Revert "Add thing"'
    ]) {
      expect(planUndo('x: y', subject)).toMatchObject({ kind: 'reset', mode: 'keep' })
    }
  })

  it('undoes a reset, falling back to mixed when files were left changed', () => {
    expect(planUndo('reset: moving to HEAD~1', 'reset: moving to HEAD~1')).toMatchObject({ mode: 'keep-or-mixed' })
  })

  it('has nothing to undo for the first commit or a new branch', () => {
    expect(planUndo('commit (initial): First', 'commit (initial): First')).toBeNull()
    expect(planUndo('commit: x', 'branch: Created from HEAD')).toBeNull()
    expect(planUndo(null, null)).toBeNull()
  })

  it('shortens long subjects', () => {
    const label = planUndo('commit: x', `commit: ${'a'.repeat(80)}`)!.label
    expect(label.length).toBeLessThan(70)
  })
})
