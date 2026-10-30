import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { expect, test } from '../fixtures'
import { FixtureRepo } from '../support/fixtureRepo'

// The second instance must share the app's settings folder, which a reused worker app doesn't.
test.use({ freshApp: true })

/** Runs SillyGit again, the way the `sillygit` script does, and waits for it to hand over and quit. */
function launchAgain(userData: string, cwd: string, ...paths: string[]): Promise<number | null> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), SILLYGIT_E2E: '1' }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'CLAUDECODE', 'CLAUDE_CODE_SESSION_ID']) delete env[key]
  // Playwright adds --no-sandbox to the apps it starts; Electron won't start as root (CI containers) without it.
  const args = [resolve(__dirname, '../..'), '--no-sandbox', `--user-data-dir=${userData}`, ...paths]
  const child = spawn(electronPath as unknown as string, args, { cwd, env, stdio: 'ignore' })
  return new Promise((done) => child.on('exit', done))
}

test('sillygit <folder> opens that repository as a tab in the running app', async ({ sillygit, repo, userData }) => {
  const other = new FixtureRepo()
  try {
    await sillygit.openRepository(repo.path)
    mkdirSync(join(other.path, 'src'), { recursive: true })

    // A folder inside the repo, relative to where the command ran, opens the whole repo.
    await launchAgain(userData, other.path, 'src')

    await sillygit.tabs.expectNames([repo.name, other.name])
    await sillygit.tabs.expectActive(other.name)

    // Again for a repo that's already open just switches back to its tab.
    await launchAgain(userData, '/', repo.path)
    await sillygit.tabs.expectNames([repo.name, other.name])
    await sillygit.tabs.expectActive(repo.name)
  } finally {
    other.remove()
  }
})

test('says so when the folder does not exist', async ({ sillygit, repo, userData }) => {
  await sillygit.openRepository(repo.path)
  const missing = join(repo.path, '..', 'no-such-folder')

  await launchAgain(userData, '/', missing)

  await expect(sillygit.page.getByText(/no such file or folder/)).toBeVisible()
  await sillygit.tabs.expectNames([repo.name])
})
