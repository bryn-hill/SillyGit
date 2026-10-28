import type { Locator } from '@playwright/test'

/**
 * Drags `from` onto `to` with the mouse, in small steps like a person would.
 * The app's drag and drop runs on pointer events, so Playwright's dragTo
 * (HTML5 drag events) doesn't drive it.
 */
export async function dragOnto(from: Locator, to: Locator): Promise<void> {
  const page = from.page()
  const a = await from.boundingBox()
  if (!a) throw new Error('drag source is not visible')
  await page.mouse.move(a.x + Math.min(12, a.width / 2), a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 30, a.y + a.height / 2 + 10, { steps: 4 })
  const b = await to.boundingBox()
  if (!b) throw new Error('drop target is not visible')
  await page.mouse.move(b.x + Math.min(12, b.width / 2), b.y + b.height / 2, { steps: 8 })
  await page.mouse.up()
}
