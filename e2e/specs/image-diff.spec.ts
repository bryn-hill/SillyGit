import { expect, test } from '../fixtures'

const RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==', 'base64')
const BLUE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAADCAIAAAA/Y+msAAAAEElEQVR4nGNgYPiPgYgRAgDtWRHvQsLkFAAAAABJRU5ErkJggg==', 'base64')
const SVG = (fill: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${fill}"/></svg>\n`

test.describe('image diff', () => {
  test('shows a changed image before and after, and swipes and fades between them', async ({ sillygit, repo }) => {
    repo.commitFile('logo.png', RED, 'Add logo')
    repo.writeFile('logo.png', BLUE)
    await sillygit.openRepository(repo.path)
    await sillygit.details.listedFile('Unstaged', 'logo.png').click()

    const image = sillygit.workingFile.diff.getByRole('figure', { name: 'Image diff' })
    await expect(image.getByRole('img', { name: 'logo.png before' })).toBeVisible()
    await expect(image.getByRole('img', { name: 'logo.png after' })).toBeVisible()
    await expect(image).toContainText('4 × 3')
    await expect(image).toContainText('6 × 3')

    await image.getByRole('button', { name: 'Swipe' }).click()
    await expect(image.getByRole('slider', { name: 'Swipe position' })).toBeVisible()
    await image.getByRole('button', { name: 'Onion skin' }).click()
    await expect(image.getByRole('slider', { name: 'After opacity' })).toBeVisible()
  })

  test("shows a commit's new image with nothing before it", async ({ sillygit, repo }) => {
    repo.commitFile('art/icon.png', BLUE, 'Add icon')
    await sillygit.openRepository(repo.path)
    // The newest commit may already be selected, and clicking it again would deselect it.
    await sillygit.graph.select('Add hello.txt')
    await sillygit.graph.select('Add icon')
    await sillygit.details.openFile('icon.png')

    const image = sillygit.commitView.diff.getByRole('figure', { name: 'Image diff' })
    await expect(image.getByRole('img', { name: 'art/icon.png after' })).toBeVisible()
    await expect(image).toContainText('Added')
    await expect(image.getByRole('button', { name: 'Swipe' })).toHaveCount(0)
  })

  test('an SVG switches between its picture and its text diff', async ({ sillygit, repo }) => {
    repo.commitFile('dot.svg', SVG('red'), 'Add dot')
    repo.writeFile('dot.svg', SVG('blue'))
    await sillygit.openRepository(repo.path)
    await sillygit.details.listedFile('Unstaged', 'dot.svg').click()

    const diff = sillygit.workingFile.diff
    await diff.getByRole('button', { name: 'Text diff' }).click()
    await expect(diff).toContainText('fill="blue"')
    await diff.getByRole('button', { name: 'Image diff' }).click()
    await expect(diff.getByRole('img', { name: 'dot.svg after' })).toBeVisible()
  })
})
