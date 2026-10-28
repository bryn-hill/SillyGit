import { expect, test } from '../fixtures'

// Without SILLYGIT_UPDATE_CHECKOUT the app has no checkout to update, the
// same as a packaged build (npm run dist), so Update is nowhere to be seen.
test('a build that can’t update itself shows no Update button or palette entry', async ({ sillygit, repo }) => {
  const { page } = sillygit
  await sillygit.openRepository(repo.path)

  await expect(page.getByRole('button', { name: 'Update SillyGit' })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('textbox', { name: 'Command' }).fill('update')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('option', { name: /Update SillyGit/ })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Update SillyGit' })).toHaveCount(0)
})
