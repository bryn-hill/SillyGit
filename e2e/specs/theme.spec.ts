import { expect, test } from '../fixtures'

const DARK_BG = 'rgb(40, 42, 54)'
const LIGHT_BG = 'rgb(247, 247, 250)'

test.describe('light and dark themes', () => {
  test('starts dark, and Light in Settings turns the whole app light', async ({ sillygit, repo, electronApp }) => {
    await sillygit.openRepository(repo.path)
    await expect(sillygit.document).toHaveAttribute('data-theme', 'dark')
    await expect(sillygit.page.locator('body')).toHaveCSS('background-color', DARK_BG)

    await sillygit.settings.open()
    await expect(sillygit.settings.theme).toHaveText('Dark')
    await sillygit.settings.chooseTheme('Light')

    await expect(sillygit.document).toHaveAttribute('data-theme', 'light')
    await expect(sillygit.page.locator('body')).toHaveCSS('background-color', LIGHT_BG)
    // Native menus, scrollbars and the title bar follow too.
    await expect.poll(() => electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light')
    await sillygit.settings.close()

    // Graph lanes are theme tokens, so the first lane gets the light theme's darker purple.
    await expect(sillygit.graph.row('Initial commit').getByText('Initial commit')).toHaveCSS('color', 'rgb(124, 85, 224)')
  })

  test('"Match the system" follows the system appearance as it changes', async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await sillygit.settings.open()
    await sillygit.settings.chooseTheme('Match the system')

    await sillygit.page.emulateMedia({ colorScheme: 'light' })
    await expect(sillygit.document).toHaveAttribute('data-theme', 'light')
    await sillygit.page.emulateMedia({ colorScheme: 'dark' })
    await expect(sillygit.document).toHaveAttribute('data-theme', 'dark')
  })

  test('the terminal and file editor switch with the app', async ({ sillygit, repo }) => {
    repo.writeFile('hello.txt', 'hello\nworld\nchanged\n')
    await sillygit.openRepository(repo.path)
    await sillygit.terminalButton.click()
    await expect(sillygit.terminal.input).toBeAttached()
    await sillygit.details.editFile('hello.txt')
    await sillygit.editor.expectOpen('hello.txt', 'changed')
    await expect(sillygit.editor.surface).toHaveCSS('background-color', DARK_BG)
    await expect(sillygit.terminal.screen).toHaveCSS('background-color', DARK_BG)

    await sillygit.settings.open()
    await sillygit.settings.chooseTheme('Light')
    await sillygit.settings.close()

    await expect(sillygit.editor.surface).toHaveCSS('background-color', LIGHT_BG)
    await expect(sillygit.terminal.screen).toHaveCSS('background-color', LIGHT_BG)
  })

  test('keeps the chosen theme after a relaunch', async ({ sillygit, relaunch }) => {
    await sillygit.settings.open()
    await sillygit.settings.chooseTheme('Light')
    await sillygit.settings.close()

    const reopened = await relaunch()
    await expect(reopened.document).toHaveAttribute('data-theme', 'light')
    await reopened.settings.open()
    await expect(reopened.settings.theme).toHaveText('Light')
  })
})
