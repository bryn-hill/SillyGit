import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../fixtures'

// Run's output goes to a terminal (a canvas), so the run command reports
// where it ran, and what it saw, to a file outside both checkouts.
let outDir: string
let out: string
const report = (): string => (existsSync(out) ? readFileSync(out, 'utf8') : '')
const reportCommand = (): string =>
  `{ pwd; git log -1 --format=%s; test -f hello.txt && cat hello.txt; } > '${out}'`

// A run starts a login shell (the user's profile, nvm and all) and, for a
// commit, sets up a checkout first, which is slow on a busy machine.
const RUN_TIMEOUT = 25_000
test.slow()

test.beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'sillygit-run-out-'))
  out = join(outDir, 'report.txt')
})

test.afterEach(() => {
  rmSync(outDir, { recursive: true, force: true })
})

test('the first Run asks for the command, then runs the working tree', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'uncommitted\n')
  await sillygit.openRepository(repo.path)

  await sillygit.toolbarButton('Run').click()
  await sillygit.setRunCommand(reportCommand())

  await expect.poll(report, { timeout: RUN_TIMEOUT }).toContain('uncommitted')
  expect(report().split('\n')[0]).toBe(repo.path)
  await expect(sillygit.terminal.runTabs).toHaveCount(1)
  await expect(sillygit.toolbarButton('Run')).toHaveAttribute('title', /in the working tree/)
})

test('a selected commit runs in isolation without touching the working tree', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'uncommitted\n')
  await sillygit.openRepository(repo.path)
  await sillygit.toolbarButton('Run options').click()
  await sillygit.page.getByRole('menuitem', { name: 'Edit run command…' }).click()
  await sillygit.setRunCommand(reportCommand())

  await sillygit.graph.select('Initial commit')
  await sillygit.toolbarButton('Run').click()

  await expect.poll(report, { timeout: RUN_TIMEOUT }).toContain('Initial commit')
  const [cwd] = report().split('\n')
  expect(cwd).not.toBe(repo.path)
  // hello.txt doesn't exist yet at the initial commit.
  expect(report()).not.toContain('uncommitted')
  expect(repo.git('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')
  expect(repo.readFile('hello.txt')).toBe('uncommitted\n')
  await expect(sillygit.terminal.runTabs).toContainText('(isolated)')
})

test('Check out and run checks the commit out first, but not over uncommitted changes', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.runMenu('Edit run command…')
  await sillygit.setRunCommand(reportCommand())
  repo.writeFile('hello.txt', 'uncommitted\n')
  await expect(sillygit.graph.workingChangesRow()).toBeVisible()
  await sillygit.graph.select('Initial commit')

  await sillygit.runMenu('Check out and run')
  await expect(sillygit.page.getByRole('alert')).toContainText('Commit or stash your changes')
  expect(report()).toBe('')

  repo.git('checkout', '--', 'hello.txt')
  await expect(sillygit.graph.workingChangesRow()).toHaveCount(0)
  await sillygit.graph.expectSelected('Initial commit')
  await sillygit.toolbarButton('Run').click()
  await expect.poll(report, { timeout: RUN_TIMEOUT }).toContain('Initial commit')
  expect(report().split('\n')[0]).toBe(repo.path)
  expect(repo.git('log', '-1', '--format=%s').trim()).toBe('Initial commit')
})

test('Stop ends a run that is still going', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.toolbarButton('Run').click()
  await sillygit.setRunCommand('sleep 60')

  const stop = sillygit.toolbarButton('Stop')
  await expect(stop).toBeVisible()
  await stop.click()

  await expect(sillygit.toolbarButton('Run')).toBeVisible()
  await expect(sillygit.terminal.runTabs).toHaveCount(1)
})

test('an isolated run keeps going while the working tree runs too', async ({ sillygit, repo }) => {
  await sillygit.openRepository(repo.path)
  await sillygit.runMenu('Edit run command…')
  await sillygit.setRunCommand('sleep 60')

  await sillygit.graph.select('Initial commit')
  await sillygit.toolbarButton('Run').click()
  await expect(sillygit.toolbarButton('Stop')).toBeVisible()

  // The clean HEAD is the working tree, which has a Run of its own.
  await sillygit.graph.select('Add hello.txt')
  await sillygit.toolbarButton('Run').click()

  await expect(sillygit.terminal.runTabs).toHaveCount(2)
  await expect(sillygit.terminal.runTabs.filter({ hasText: '(isolated)' })).toHaveCount(1)
  await expect(sillygit.toolbarButton('Stop')).toBeVisible()
})

test('the run command prompt offers what it found, such as a Gradle app and a .NET API', async ({ sillygit, repo }) => {
  repo.writeFile('gradlew', '')
  repo.writeFile('build.gradle', "plugins { id 'org.springframework.boot' }\n")
  repo.writeFile('api/Api.csproj', '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>\n')
  await sillygit.openRepository(repo.path)

  await sillygit.runMenu('Edit run command…')
  const prompt = sillygit.page.getByRole('dialog', { name: 'Run command' })
  await expect(prompt.getByRole('textbox')).toHaveValue('./gradlew bootRun')
  await prompt.getByRole('button', { name: /cd api && dotnet run/ }).click()
  await expect(prompt.getByRole('textbox')).toHaveValue('cd api && dotnet run')
  await prompt.getByRole('button', { name: 'Save' }).click()

  await sillygit.toolbarButton('Run options').click()
  await expect(sillygit.page.getByRole('menu', { name: 'Run options' })).toContainText('cd api && dotnet run')
})
