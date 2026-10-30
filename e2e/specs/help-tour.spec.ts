import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '../fixtures'
import { Tour } from '../pages/Tour'
import { TOUR_VERSION } from '../../src/shared/help/tour'

const settingsFile = (userData: string): string => join(userData, 'sillygit-settings.json')
const savedHelp = (userData: string): unknown => JSON.parse(readFileSync(settingsFile(userData), 'utf8')).help

test.describe('first-use walkthrough', () => {
  // The fixtures mark the walkthrough as seen; these tests start as a new user.
  test.beforeEach(async ({ sillygit, userData }) => {
    const settings = JSON.parse(readFileSync(settingsFile(userData), 'utf8'))
    delete settings.help
    writeFileSync(settingsFile(userData), JSON.stringify(settings))
    await sillygit.page.reload()
  })

  test('starts once a repository is open, walks through and stays finished', async ({ sillygit, repo, userData, relaunch }) => {
    const tour = new Tour(sillygit.page)
    await expect(sillygit.emptyState).toBeVisible()
    await expect(tour.overlay).toHaveCount(0)

    await sillygit.openRepository(repo.path)
    await tour.expectStep('Welcome to SillyGit')
    await expect(tour.progress).toHaveText(/^Step 1 of \d+$/)
    await expect(tour.backButton).toHaveCount(0)

    await tour.nextButton.click()
    await tour.expectStep('Repositories open as tabs')
    await tour.expectSpotlightOn('repo-tabs')
    await tour.nextButton.click()
    await tour.expectStep('The commit graph')
    await tour.expectSpotlightOn('graph')
    await tour.backButton.click()
    await tour.expectStep('Repositories open as tabs')

    // Arrow keys step through to the end.
    const total = Number((await tour.progress.textContent())!.match(/of (\d+)/)![1])
    for (let i = 2; i < total; i++) await sillygit.page.keyboard.press('ArrowRight')
    await tour.expectStep("You're all set")
    await expect(tour.skipButton).toHaveCount(0)
    await tour.doneButton.click()

    await expect(tour.overlay).toHaveCount(0)
    await expect.poll(() => savedHelp(userData)).toEqual({ tourCompleted: true, tourVersion: TOUR_VERSION })
    const relaunched = await relaunch()
    await expect(relaunched.graph.row('Initial commit')).toBeVisible()
    await expect(new Tour(relaunched.page).overlay).toHaveCount(0)
  })

  test('can be skipped, and restarted from the command palette', async ({ sillygit, repo, userData }) => {
    const tour = new Tour(sillygit.page)
    await sillygit.openRepository(repo.path)
    await tour.expectStep('Welcome to SillyGit')
    await tour.skipButton.click()
    await expect(tour.overlay).toHaveCount(0)
    await expect.poll(() => savedHelp(userData)).toEqual({ tourCompleted: true, tourVersion: TOUR_VERSION })

    await sillygit.page.keyboard.press('ControlOrMeta+k')
    await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('start walkthrough')
    const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette.getByRole('option', { selected: true })).toContainText('Start walkthrough')
    await sillygit.page.keyboard.press('Enter')

    await tour.expectStep('Welcome to SillyGit')
    // Escape skips as well.
    await sillygit.page.keyboard.press('Escape')
    await expect(tour.overlay).toHaveCount(0)
  })
})
