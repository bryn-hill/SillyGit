import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../fixtures'
import { chooseOption } from '../pages/Select'
import type { SillyGitApp } from '../pages/SillyGitApp'

// Commands run in the terminal (a canvas), so they report to a file instead.
let outDir: string
let out: string
const report = (): string => (existsSync(out) ? readFileSync(out, 'utf8') : '')
const RUN_TIMEOUT = 25_000
test.slow()

test.beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'sillygit-custom-out-'))
  out = join(outDir, 'report.txt')
})

test.afterEach(() => {
  rmSync(outDir, { recursive: true, force: true })
})

async function addCommand(sillygit: SillyGitApp, name: string, command: string, scope: string): Promise<void> {
  await sillygit.settings.open()
  const section = sillygit.settings.root.getByRole('region', { name: 'Custom commands' })
  await section.getByRole('button', { name: '+ Add command' }).click()
  await section.getByLabel('Command name').last().fill(name)
  await section.getByLabel('Shell command').last().fill(command)
  await chooseOption(section.getByRole('combobox', { name: `Where ${name} shows` }), scope)
  await sillygit.settings.close()
}

test('a commit command runs from the commit menu with its SHA filled in', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await addCommand(sillygit, 'Show subject', `git log -1 --format=%s $SHA > '${out}'`, 'Commit')

  await sillygit.graph.row('Initial commit').click({ button: 'right' })
  await sillygit.page.getByRole('menu').getByText('Custom commands').hover()
  await sillygit.page.getByRole('menuitem', { name: 'Show subject' }).click()

  await expect.poll(report, { timeout: RUN_TIMEOUT }).toBe('Initial commit\n')
})

test('a repository command runs from the command palette', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await addCommand(sillygit, 'Where am I', `{ pwd; echo $CURRENT_BRANCH; } > '${out}'`, 'Repository')

  await sillygit.page.keyboard.press('ControlOrMeta+k')
  await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('where am i')
  const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('option', { selected: true })).toContainText('Where am I')
  await sillygit.page.keyboard.press('Enter')

  await expect.poll(report, { timeout: RUN_TIMEOUT }).toBe(`${repo.path}\nmain\n`)
})
