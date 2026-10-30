import { expect, test } from '../fixtures'
import type { FixtureRepo } from '../support/fixtureRepo'

/** Commits touching different folders, newest first: Docs again, Rename token, Write guide, Add login. */
function addHistory(repo: FixtureRepo): void {
  repo.commitFile('src/main/login.ts', 'export const token = 1\n', 'Add login')
  repo.git('commit', '-q', '--amend', '-m', 'Add login\n\nUses a secret handshake')
  repo.writeFile('docs/guide.md', 'how to\n')
  repo.git('add', 'docs/guide.md')
  repo.git('commit', '-q', '--author', 'Grace Hopper <grace@navy.mil>', '-m', 'Write guide')
  repo.commitFile('src/main/login.ts', 'export const bearer = 1\n', 'Rename token')
  repo.commitFile('docs/guide.md', 'how to, again\n', 'Docs again')
}

test.describe('history search and filter', () => {
  test('searches by message body, author, path and changed text', async ({ sillygit, repo }) => {
    addHistory(repo)
    await sillygit.openRepository(repo.path)
    const graph = sillygit.graph

    // "All" reads the message body as well as the subject.
    await graph.search('handshake')
    await graph.expectMatches(['Add login'])
    await expect(graph.searchCount).toHaveText('1 of 1')

    await graph.search('grace', 'Author')
    await graph.expectMatches(['Write guide'])
    await sillygit.details.expectCommit('Write guide')

    await graph.search('src/main', 'File path')
    await graph.expectMatches(['Rename token', 'Add login'])

    // Pickaxe: the commits that add or remove the text.
    await graph.search('bearer', 'Changes')
    await graph.expectMatches(['Rename token'])

    // A typed prefix overrides the dropdown and shows in it.
    await graph.search('author:navy.mil')
    await expect(graph.searchMode).toHaveText('Author')
    await graph.expectMatches(['Write guide'])

    await graph.search('-Gexport const (token|nope)')
    await expect(graph.searchMode).toHaveText('Changes (regex)')
    await graph.expectMatches(['Rename token', 'Add login'])

    await graph.search('-G(')
    await expect(graph.searchCount).toHaveText('Invalid regex')
  })

  test('shows the history of a folder from a file’s menu and clears it from the chip', async ({ sillygit, repo }) => {
    addHistory(repo)
    await sillygit.openRepository(repo.path)
    const graph = sillygit.graph

    await graph.select('Rename token')
    await sillygit.details.fileMenu('src/main/login.ts', 'Show history of this folder')
    await expect(graph.filterChip).toContainText('History of src/main')
    await graph.expectSubjects(['Rename token', 'Add login'])

    // Search counts within the filter.
    await graph.search('o')
    await expect(graph.searchCount).toHaveText('1 of 2')
    await graph.searchBox.fill('')

    await graph.clearFilterButton.click()
    await expect(graph.filterChip).toBeHidden()
    await graph.expectSubjects(['Docs again', 'Rename token', 'Write guide', 'Add login', ...repoCommits()])
  })

  test('filters to one file, or to any path matching a File path search', async ({ sillygit, repo }) => {
    addHistory(repo)
    await sillygit.openRepository(repo.path)
    const graph = sillygit.graph

    await graph.select('Write guide')
    await sillygit.details.fileMenu('docs/guide.md', 'Show commits to this file in graph')
    await expect(graph.filterChip).toContainText('History of docs/guide.md')
    await graph.expectSubjects(['Docs again', 'Write guide'])

    await graph.search('LOGIN', 'File path')
    await graph.filterButton.click()
    await expect(graph.filterChip).toContainText('Paths containing “LOGIN”')
    await graph.expectSubjects(['Rename token', 'Add login'])
    await expect(graph.searchBox).toHaveValue('')
  })

  test('the command palette shows a folder’s history', async ({ sillygit, repo }) => {
    addHistory(repo)
    await sillygit.openRepository(repo.path)

    await sillygit.page.keyboard.press('ControlOrMeta+k')
    const palette = sillygit.page.getByRole('dialog', { name: 'Command palette' })
    await sillygit.page.getByRole('textbox', { name: 'Command' }).fill('history of folder')
    // The palette lists each folder under the command as it's searched.
    await palette.getByRole('option', { name: 'Show history of folder docs' }).click()

    await expect(sillygit.graph.filterChip).toContainText('History of docs')
    await sillygit.graph.expectSubjects(['Docs again', 'Write guide'])
  })

  test('showing a commit outside the filter clears it', async ({ sillygit, repo }) => {
    addHistory(repo)
    // "Rename token" only touches src/main.
    repo.git('branch', 'old', 'HEAD~1')
    await sillygit.openRepository(repo.path)
    const graph = sillygit.graph

    await graph.select('Write guide')
    await sillygit.details.fileMenu('docs/guide.md', 'Show history of this folder')
    await graph.expectSubjects(['Docs again', 'Write guide'])

    await sillygit.sidebar.branchNamed('old').click()
    await expect(graph.filterChip).toBeHidden()
    await graph.expectSelected('Rename token')
  })
})

function repoCommits(): string[] {
  return ['Add hello.txt', 'Initial commit']
}
