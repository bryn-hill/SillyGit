import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { expect, test } from '../fixtures'

// Fake `code` and `webstorm` commands on PATH that write down what they were
// asked to open, so nothing real starts.
const fakes = mkdtempSync(join(tmpdir(), 'sillygit-e2e-editors-'))
const bin = join(fakes, 'bin')
mkdirSync(bin)
for (const name of ['code', 'webstorm']) {
  writeFileSync(join(bin, name), `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(fakes, name)}.args"\n`)
  chmodSync(join(bin, name), 0o755)
}

function opened(name: string): Promise<string[]> {
  const file = join(fakes, `${name}.args`)
  return expect
    .poll(() => existsSync(file))
    .toBe(true)
    .then(() => {
      const args = readFileSync(file, 'utf8').trimEnd().split('\n')
      rmSync(file)
      return args
    })
}

test.describe('open in editor', () => {
  test.skip(process.platform === 'win32', 'the fake editors are shell scripts')
  test.use({ appEnv: { PATH: `${bin}${delimiter}${process.env.PATH}`, SILLYGIT_APP_FOLDERS: '' } })
  test.afterAll(() => rmSync(fakes, { recursive: true, force: true }))

  test('the toolbar opens the repo in the first editor found, and its menu picks another', async ({
    sillygit,
    repo
  }) => {
    await sillygit.openRepository(repo.path)
    const button = sillygit.toolbarButton('Editor')
    await expect(button).toHaveAttribute('title', /in Visual Studio Code/)
    await expect(button).toContainText('VS Code')

    await button.click()
    expect(await opened('code')).toEqual([repo.path])

    await sillygit.toolbarButton('Editor options').click()
    const menu = sillygit.page.getByRole('menu', { name: 'Editor options' })
    await expect(menu.getByRole('menuitemradio', { name: 'Open in Visual Studio Code' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await menu.getByRole('menuitemradio', { name: 'Open in WebStorm' }).click()
    expect(await opened('webstorm')).toEqual([repo.path])
    await expect(button).toContainText('WebStorm')

    // The choice is saved: Settings shows it.
    await sillygit.settings.open()
    await expect(sillygit.settings.root.getByLabel('Open in editor')).toContainText('WebStorm')
    await sillygit.settings.close()
  })

  test("a file's right-click menu opens it in the repo's window", async ({ sillygit, repo }) => {
    repo.writeFile('hello.txt', 'hello\nchanged\n')
    await sillygit.openRepository(repo.path)
    await sillygit.details.fileMenu('hello.txt', 'Open in Visual Studio Code')
    expect(await opened('code')).toEqual([repo.path, '--goto', join(repo.path, 'hello.txt')])
  })
})
