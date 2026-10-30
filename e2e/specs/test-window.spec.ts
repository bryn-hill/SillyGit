import { expect, test } from '../fixtures'

// The suite runs on developers' Macs and the self-hosted Mac runner, so its
// windows must stay out of the way (see showForE2E in src/main/window.ts).
test.describe('test window', () => {
  test.skip(process.env['E2E_SHOW_WINDOW'] === '1', 'the window is meant to be seen')

  test('renders without taking focus or being seen', async ({ sillygit }) => {
    const presence = await sillygit.desktopPresence()
    expect(presence.inDock).toBe(false)
    // xvfb has no window manager, so a Linux window's focus means nothing there.
    if (process.platform !== 'linux') {
      expect(presence).toMatchObject({ shown: true, focused: false, opacity: 0 })
    }
    // A shown window renders frames, so screenshots don't hang.
    if (presence.shown) await sillygit.page.screenshot({ timeout: 5_000 })
  })
})
