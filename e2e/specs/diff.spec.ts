import { expect, test } from '../fixtures'

const LONG_LINE = `const longLine = '${'x'.repeat(400)}' // END-OF-LONG-LINE`

test.describe('a changed file', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    await sillygit.openRepository(repo.path)
    await sillygit.details.openFile('hello.txt')
  })

  test('clicking a changed file opens its diff', async ({ sillygit }) => {
    await sillygit.commitView.expectShowing('hello.txt', 'world')
  })

  test('the back button returns to the commit graph', async ({ sillygit }) => {
    await sillygit.commitView.back()

    await sillygit.commitView.expectClosed()
    await expect(sillygit.graph.root).toBeVisible()
  })

  test('clicking the open file again closes the diff', async ({ sillygit }) => {
    await sillygit.commitView.file('hello.txt').click()

    await sillygit.commitView.expectClosed()
    await expect(sillygit.graph.root).toBeVisible()
  })
})

test.describe('a file with a line wider than the diff', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.commitFile('long.ts', `short\n${LONG_LINE}\n`, 'Add long.ts')
    await sillygit.openRepository(repo.path)
    await sillygit.details.openFile('long.ts')
    await sillygit.commitView.expectShowing('long.ts', 'END-OF-LONG-LINE')
  })

  for (const option of ['Unified view', 'Split view', 'File View'] as const) {
    test(`scrolls horizontally to the end of the line in ${option}`, async ({ sillygit }) => {
      const view = sillygit.commitView
      await view.show(option)
      await expect(view.scroller).toContainText('END-OF-LONG-LINE')
      expect(await view.isLineEndVisible('END-OF-LONG-LINE')).toBe(false)

      await view.scrollToRightEdge()

      await expect.poll(() => view.isLineEndVisible('END-OF-LONG-LINE')).toBe(true)
      if (option !== 'File View') {
        await expect(view.diff.getByRole('button', { name: /Revert Hunk/ })).toBeInViewport()
      }
    })
  }
})

test.describe('a line edited in place', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.commitFile('price.ts', 'const total = price * quantity\nconst other = 1\n', 'Add price.ts')
    repo.commitFile('price.ts', 'const total = cost * quantity\nconst other = 1\n', 'Use cost')
    await sillygit.openRepository(repo.path)
    await sillygit.details.openFile('price.ts')
    await sillygit.commitView.expectShowing('price.ts', 'cost')
  })

  for (const option of ['Unified view', 'Split view'] as const) {
    test(`highlights only the changed words in ${option}`, async ({ sillygit }) => {
      const view = sillygit.commitView
      await view.show(option)
      await expect(view.changedWords()).toHaveText(['price', 'cost'])
    })
  }
})

test.describe('a commit with a long file', () => {
  test.beforeEach(async ({ sillygit, repo }) => {
    repo.commitFile('long.txt', Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n') + '\n', 'Add long.txt')
    await sillygit.openRepository(repo.path)
    await sillygit.details.openFile('long.txt')
    await sillygit.commitView.expectShowing('long.txt', 'line 0')
  })

  for (const view of ['Diff View', 'File View'] as const) {
    test(`the ${view} scrolls with the wheel and the page keys`, async ({ sillygit }) => {
      const { commitView, page } = sillygit
      await commitView.show(view)
      const scrollTop = (): Promise<number> => commitView.scroller.evaluate((el) => el.scrollTop)

      const box = (await commitView.scroller.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(0, 400)
      await expect.poll(scrollTop).toBeGreaterThan(0)

      await commitView.file('long.txt').focus()
      await page.keyboard.press('End')
      await expect(commitView.diff).toContainText('line 299')
      await expect.poll(scrollTop).toBeGreaterThan(box.height)
    })
  }
})
