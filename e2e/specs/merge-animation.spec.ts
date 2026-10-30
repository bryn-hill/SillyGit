import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../fixtures'

test.describe('new commit animation', () => {
  test.beforeEach(async ({ repo }) => {
    repo.addFeatureBranch()
  })

  test('plays over the new merge commit, then goes away', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)

    await sillygit.graph.badge('feature').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Merge feature into main' }).click()

    const mergeRow = sillygit.graph.row("Merge branch 'feature'")
    await expect(mergeRow.getByTestId('merge-burst')).toHaveCount(1)
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)
  })

  test('plays over a new commit on the checked-out branch, made in the app or elsewhere', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)

    repo.commitFile('outside.txt', 'made elsewhere\n', 'Commit from the command line')

    const row = sillygit.graph.row('Commit from the command line')
    await expect(row.getByTestId('merge-burst')).toHaveCount(1)
    // The branch pill moved up with it, and its line grows out to the node.
    await expect(row.getByTestId('ref-connector')).toHaveClass(/ref-connector-burst/)
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)
    await expect(row.getByTestId('ref-connector')).not.toHaveClass(/ref-connector-burst/)
  })

  test('plays over each commit a fetch brings in', async ({ sillygit, repo }) => {
    const clone = mkdtempSync(join(tmpdir(), 'sillygit-clone-'))
    try {
      repo.git('clone', '-q', repo.path, clone)
      repo.git('remote', 'add', 'origin', clone)
      await sillygit.openRepository(repo.path)
      for (const n of [1, 2]) {
        writeFileSync(join(clone, `remote${n}.txt`), `${n}\n`)
        repo.git('-C', clone, 'add', '.')
        repo.git('-C', clone, 'commit', '-q', '-m', `Remote work ${n}`)
      }

      await sillygit.pullMenu('Fetch')

      await expect(sillygit.graph.row('Remote work 1').getByTestId('merge-burst')).toHaveCount(1)
      await expect(sillygit.graph.row('Remote work 2').getByTestId('merge-burst')).toHaveCount(1)
      await expect(sillygit.graph.mergeBurst).toHaveCount(0)
    } finally {
      rmSync(clone, { recursive: true, force: true })
    }
  })

  test('can be turned off in Settings', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await sillygit.settings.open()
    await expect(sillygit.settings.mergeAnimation).toBeChecked()
    await sillygit.settings.mergeAnimation.uncheck()
    await sillygit.settings.close()

    await sillygit.graph.badge('feature').click({ button: 'right' })
    await sillygit.page.getByRole('menuitem', { name: 'Merge feature into main' }).click()

    await expect(sillygit.graph.rows.first()).toContainText("Merge branch 'feature'")
    await expect(sillygit.graph.mergeBurst).toHaveCount(0)
  })
})
