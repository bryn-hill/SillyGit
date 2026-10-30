import { expect, test } from '../fixtures'
import { FixtureRepo } from '../support/fixtureRepo'

// Each test is a chain of lanes steps, run one at a time, each several git
// processes. On the loaded Mac runner a step takes 3-5s, so a whole test runs
// past the default 30s even though every step finishes.
test.slow()

const subjects = (repo: FixtureRepo, ref: string): string[] => repo.git('log', '--format=%s', ref).trim().split('\n')
const show = (repo: FixtureRepo, ref: string, path: string): string => repo.git('show', `${ref}:${path}`)
const numbered = (n: number, change: Record<number, string> = {}): string =>
  Array.from({ length: n }, (_, i) => change[i + 1] ?? `line ${i + 1}`).join('\n') + '\n'

test('splits uncommitted work into two lanes and commits each to its own branch', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nlanes\n')
  repo.writeFile('notes.txt', 'notes\n')
  await sillygit.openRepository(repo.path)

  const lanes = sillygit.lanes
  await lanes.start('main', 'greeting')
  await lanes.expectFiles('greeting', ['hello.txt', 'notes.txt'])
  await expect(sillygit.branchCrumb).toContainText('Lanes')
  expect(repo.git('symbolic-ref', '--short', 'HEAD').trim()).toBe('sillygit/workspace')

  await lanes.createLane('docs')
  await lanes.moveFile('notes.txt', 'greeting', 'docs')
  await lanes.expectFiles('greeting', ['hello.txt'])
  await lanes.expectFiles('docs', ['notes.txt'])

  await lanes.commit('docs', 'Add notes')
  await expect(lanes.lane('docs')).toContainText('No uncommitted changes')
  await lanes.commit('greeting', 'Say hello to lanes')
  await expect(lanes.lane('greeting')).toContainText('1 commit')

  expect(subjects(repo, 'docs')).toEqual(['Add notes', ...FixtureRepo.commits])
  expect(subjects(repo, 'greeting')).toEqual(['Say hello to lanes', ...FixtureRepo.commits])
  expect(repo.git('show', '--stat', '--format=', 'docs').trim()).toMatch(/^notes\.txt/)
  expect(show(repo, 'greeting', 'hello.txt')).toBe('hello\nlanes\n')
  // The files are as typed, and nothing is left uncommitted.
  expect(repo.readFile('notes.txt')).toBe('notes\n')
  expect(repo.git('status', '--porcelain').trim()).toBe('')
})

test('moves single lines of a file to another lane from its diff', async ({ sillygit, repo }) => {
  repo.commitFile('long.txt', numbered(30), 'Add long.txt')
  repo.writeFile('long.txt', numbered(30, { 2: 'first lane', 25: 'second lane' }))
  await sillygit.openRepository(repo.path)
  const lanes = sillygit.lanes
  await lanes.start('main', 'first')
  await lanes.createLane('second')

  await lanes.file('first', 'long.txt').click()
  const view = sillygit.workingFile
  await view.expectShowing('long.txt', 'second lane')
  await expect(view.diff.locator('.hunk-lane-chip')).toHaveText(['first', 'first'])
  // Pick the second hunk's lines and give them to the other lane.
  await view.line('removed', 25).click()
  await view.line('added', 25).click()
  await view.hunkButton('Move 2 Lines').click()
  await sillygit.page.getByRole('menuitem', { name: 'Move to second', exact: true }).click()

  await expect(view.diff.locator('.hunk-lane-chip')).toHaveText(['first', 'second'])
  await lanes.expectFiles('second', ['long.txt'])
  await lanes.commit('second', 'Second lane change')
  await expect(lanes.lane('second')).toContainText('No uncommitted changes')

  expect(show(repo, 'second', 'long.txt')).toBe(numbered(30, { 25: 'second lane' }))
  expect(show(repo, 'first', 'long.txt')).toBe(numbered(30))
  expect(repo.readFile('long.txt')).toBe(numbered(30, { 2: 'first lane', 25: 'second lane' }))
})

test('drags a file to another lane, unapplies it and applies it back', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nchanged\n')
  repo.writeFile('extra.txt', 'extra\n')
  await sillygit.openRepository(repo.path)
  const lanes = sillygit.lanes
  await lanes.start('main', 'one')
  await lanes.createLane('two')

  await lanes.file('one', 'extra.txt').dragTo(lanes.lane('two'))
  await lanes.expectFiles('two', ['extra.txt'])

  await lanes.laneMenu('two', 'Unapply')
  await expect(lanes.lane('two')).toHaveCount(0)
  await expect(lanes.root.locator('.lanes-unapplied')).toContainText('saved changes')
  expect(repo.readFileIfPresent('extra.txt')).toBeNull()
  expect(repo.readFile('hello.txt')).toBe('hello\nchanged\n')

  await lanes.root.locator('.lane-unapplied-row').filter({ hasText: 'two' }).getByRole('button', { name: 'Apply' }).click()
  await lanes.expectFiles('two', ['extra.txt'])
  expect(repo.readFile('extra.txt')).toBe('extra\n')

  // Undo puts the lane back the way it was before applying.
  await lanes.menu('Undo applying two')
  await expect(lanes.lane('two')).toHaveCount(0)
  expect(repo.readFileIfPresent('extra.txt')).toBeNull()
})

test('turns lanes off onto one lane, setting the others aside', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nchanged\n')
  repo.writeFile('extra.txt', 'extra\n')
  await sillygit.openRepository(repo.path)
  const lanes = sillygit.lanes
  await lanes.start('main', 'one')
  await lanes.createLane('two')
  await lanes.moveFile('extra.txt', 'one', 'two')

  await lanes.menu('Turn off lanes…')
  await lanes.answer('Turn off lanes', 'Check out (its uncommitted changes come along; other lanes’ are set aside)', 'one', 'Turn off lanes')
  await expect(sillygit.notice).toContainText('Lanes are off')
  await expect(lanes.root).toHaveCount(0)
  await expect(sillygit.branchCrumb).toContainText('one')
  expect(repo.git('status', '--porcelain').trim()).toBe('M hello.txt')
  expect(repo.readFileIfPresent('extra.txt')).toBeNull()
  expect(repo.git('rev-parse', '--verify', 'refs/sillygit/wip/two').trim()).toMatch(/^[0-9a-f]{40}$/)
})

test('a commit made in a terminal on the workspace can be moved into a lane', async ({ sillygit, repo }) => {
  repo.writeFile('hello.txt', 'hello\nchanged\n')
  await sillygit.openRepository(repo.path)
  const lanes = sillygit.lanes
  await lanes.start('main', 'one')

  repo.git('commit', '-q', '-am', 'From the terminal')
  await expect(lanes.drift).toContainText('1 commit was made on the workspace outside SillyGit')
  await lanes.drift.getByRole('button', { name: 'Move to one' }).click()
  await expect(lanes.drift).toHaveCount(0)
  expect(subjects(repo, 'one')).toEqual(['From the terminal', ...FixtureRepo.commits])
})
