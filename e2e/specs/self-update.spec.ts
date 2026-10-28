import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../fixtures'

// A stand-in for the checkout SillyGit runs from, with a bare origin and a
// second clone that pushes new work to main.
const root = mkdtempSync(join(tmpdir(), 'sillygit-e2e-self-update-'))
const origin = join(root, 'origin.git')
const checkout = join(root, 'sillygit')
const dev = join(root, 'dev')

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args], { cwd, encoding: 'utf8' }).trim()

function pushToMain(file: string, content: string, message: string): void {
  writeFileSync(join(dev, file), content)
  git(dev, 'add', '.')
  git(dev, 'commit', '-q', '-m', message)
  git(dev, 'push', '-q', 'origin', 'main')
}

test.use({ appEnv: { SILLYGIT_UPDATE_CHECKOUT: checkout } })

test.describe('Update SillyGit', () => {
  test.beforeEach(() => {
    rmSync(root, { recursive: true, force: true })
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
    execFileSync('git', ['init', '-q', '-b', 'main', dev])
    // No build script, so the update stops after pulling, before it would restart the app.
    writeFileSync(join(dev, 'package.json'), '{ "name": "sillygit" }\n')
    git(dev, 'add', '.')
    git(dev, 'commit', '-q', '-m', 'First')
    git(dev, 'remote', 'add', 'origin', origin)
    git(dev, 'push', '-q', '-u', 'origin', 'main')
    execFileSync('git', ['clone', '-q', origin, checkout])
  })

  test.afterAll(() => rmSync(root, { recursive: true, force: true }))

  test('lists the new commits on main and pulls them in', async ({ sillygit }) => {
    const { page } = sillygit
    pushToMain('app.ts', 'new\n', 'feat: shiny new thing')

    const button = page.getByRole('button', { name: 'Update SillyGit' })
    await button.click()
    const dialog = page.getByRole('dialog', { name: 'Update SillyGit' })
    await dialog.getByRole('button', { name: 'Check again' }).click()
    await expect(dialog.getByRole('list', { name: 'Incoming commits' })).toContainText('feat: shiny new thing')
    await expect(dialog).toContainText('1 new commit on main')
    await expect(button).toContainText('1')

    await dialog.getByRole('button', { name: 'Update and restart' }).click()
    // The pull lands; the missing build script stops it before the restart.
    await expect(dialog.getByRole('alert')).toContainText('run build')
    expect(readFileSync(join(checkout, 'app.ts'), 'utf8')).toBe('new\n')
    await expect(dialog).toContainText('up to date with main')
    await expect(dialog.getByRole('button', { name: 'Update and restart' })).toBeDisabled()
  })

  test("won't update a checkout that's on another branch", async ({ sillygit }) => {
    const { page } = sillygit
    pushToMain('app.ts', 'new\n', 'feat: shiny new thing')
    git(checkout, 'checkout', '-q', '-b', 'experiment')

    await page.getByRole('button', { name: 'Update SillyGit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Update SillyGit' })
    await dialog.getByRole('button', { name: 'Check again' }).click()
    await expect(dialog).toContainText('on the branch experiment')
    await expect(dialog.getByRole('button', { name: 'Update and restart' })).toBeDisabled()
  })
})
