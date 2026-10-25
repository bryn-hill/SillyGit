import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '../fixtures'

test.beforeEach(async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.toggleTerminal()
})

test('opening the terminal starts one shell tab', async ({ sillygit }) => {
  await expect(sillygit.terminal.root).toBeVisible()
  await expect(sillygit.terminal.tabs).toHaveCount(1)
})

test('the shell runs in the repository', async ({ sillygit, repo }) => {
  // xterm draws to a canvas, so check the shell's effect instead of its
  // output: a file written by a relative path lands in the repository.
  await sillygit.terminal.run('echo ok > from-terminal.txt')

  await expect.poll(() => existsSync(join(repo.path, 'from-terminal.txt'))).toBe(true)
})

test('the plus button adds a second tab', async ({ sillygit }) => {
  await sillygit.terminal.newTabButton.click()

  await expect(sillygit.terminal.tabs).toHaveCount(2)
})
