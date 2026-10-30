import type { ElectronApplication } from '@playwright/test'
import { expect, test } from '../fixtures'

const failing = (sha: string): unknown => ({
  sha,
  state: 'failure',
  checks: [
    {
      name: 'test',
      state: 'failure',
      url: 'https://github.com/bryn/app/actions/runs/5/job/11',
      description: 'Process completed with exit code 1',
      rerun: { kind: 'github-workflow-run', id: 5 }
    },
    { name: 'lint', state: 'success' }
  ]
})
const passing = (sha: string): unknown => ({ sha, state: 'success', checks: [{ name: 'test', state: 'success' }] })
const running = (sha: string): unknown => ({ sha, state: 'pending', checks: [{ name: 'test', state: 'pending' }] })

/**
 * Stands in for GitHub: the newest commit's checks failed and the one before
 * passed, until a re-run starts the newest again. Calls are kept on
 * globalThis.ipcCalls.
 */
async function stubCi(app: ElectronApplication): Promise<void> {
  await app.evaluate(
    ({ ipcMain }, shapes) => {
      const g = globalThis as unknown as { ipcCalls?: Record<string, unknown[][]>; ciRerun?: boolean }
      g.ipcCalls = { 'ci:rerun': [] }
      ipcMain.removeHandler('ci:statuses')
      ipcMain.removeHandler('ci:rerun')
      ipcMain.handle('ci:statuses', (_e, _repoPath: string, shas: string[]) => {
        const data: Record<string, unknown> = {}
        shas.forEach((sha, i) => {
          const shape = i === 0 ? (g.ciRerun ? shapes.running : shapes.failing) : shapes.passing
          data[sha] = { ...(shape as object), sha }
        })
        return { ok: true, data }
      })
      ipcMain.handle('ci:rerun', (_e, ...args: unknown[]) => {
        g.ipcCalls!['ci:rerun'].push(args)
        g.ciRerun = true
        return { ok: true, data: undefined }
      })
    },
    { failing: failing(''), passing: passing(''), running: running('') }
  )
}

test('pushed commits show their CI result, and failed checks can be re-run', async ({ sillygit, electronApp, repo }) => {
  await stubCi(electronApp)
  await sillygit.openRepository(repo.path)
  const { graph } = sillygit

  await expect(graph.ciDot('Add hello.txt')).toHaveAttribute('data-state', 'failure')
  await expect(graph.ciDot('Add hello.txt')).toHaveAccessibleName('CI: 1 of 2 checks failed')
  await expect(graph.ciDot('Initial commit')).toHaveAttribute('data-state', 'success')

  // Clicking the dot opens its checks without selecting a different commit.
  await graph.row('Initial commit').click()
  await graph.ciDot('Add hello.txt').click()
  const popover = graph.ciPopover
  await expect(popover).toBeVisible()
  // Failures first.
  await expect(popover.getByTestId('ci-check')).toHaveText([/test.*exit code 1/, /lint/])
  await expect(popover.getByRole('button', { name: 'test' })).toHaveAttribute('title', 'Open test on the web')
  await expect(graph.selectedRow).toHaveText(/Initial commit/)

  await popover.getByRole('button', { name: 'Re-run failed' }).click()
  await expect(graph.ciDot('Add hello.txt')).toHaveAttribute('data-state', 'pending')
  const calls = await electronApp.evaluate(
    () => (globalThis as unknown as { ipcCalls: Record<string, unknown[][]> }).ipcCalls['ci:rerun']
  )
  expect(calls).toHaveLength(1)
  expect(calls[0].slice(2)).toEqual([[{ kind: 'github-workflow-run', id: 5 }]])

  await sillygit.page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
})

test('repos without CI show no dots', async ({ sillygit, repo }) => {
  // The fixture repo has no GitHub or Azure DevOps remote.
  await sillygit.openRepository(repo.path)
  await expect(sillygit.graph.row('Add hello.txt')).toBeVisible()
  await expect(sillygit.graph.root.getByTestId('ci-dot')).toHaveCount(0)
})
