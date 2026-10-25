// REPL driver for SillyGit (Electron + React, electron-vite).
// Launches the built app with its window never shown (SILLYGIT_E2E=1, see
// src/main/index.ts) and drives it over the DevTools Protocol via
// playwright-core's Electron support. Chromium still renders and can be
// screenshotted/clicked even though the window is never mapped to the
// screen, so this never disturbs the user's desktop.
//
// Designed for agents: wrap in tmux, send-keys commands, capture-pane output.
import { _electron as electron } from 'playwright-core'
import * as readline from 'node:readline'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(__dirname, '../../..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/sillygit-shots'
fs.mkdirSync(SHOT_DIR, { recursive: true })

let app = null
let page = null

const electronBin =
  process.platform === 'darwin'
    ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(APP_DIR, 'node_modules/electron/dist/electron')

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched')

    const builtMain = path.join(APP_DIR, 'out/main/index.js')
    if (!fs.existsSync(builtMain)) {
      console.log('ERROR: no build found at out/main/index.js — run `npm run build` first')
      return
    }

    // The window must never be shown (SILLYGIT_E2E=1). Also strip
    // ELECTRON_RUN_AS_NODE: some shells (including Claude Code's sandboxed
    // Bash) set it globally to stop Electron GUIs launching from Bash, which
    // would make Electron start as a plain Node process instead. We want a
    // real (just hidden) Electron process here.
    const env = { ...process.env, SILLYGIT_E2E: '1' }
    delete env.ELECTRON_RUN_AS_NODE

    app = await electron.launch({
      executablePath: electronBin,
      args: [APP_DIR],
      env,
      timeout: 30_000
    })
    app.process().stdout?.on('data', (d) => process.stdout.write(`[app] ${d}`))
    app.process().stderr?.on('data', (d) => process.stderr.write(`[app:err] ${d}`))

    page = await app.firstWindow()
    page.on('console', (msg) => console.log(`[console:${msg.type()}] ${msg.text()}`))
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))

    await page.waitForLoadState('domcontentloaded')
    console.log('launched.', app.windows().length, 'window(s)')
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first')
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png')
    await page.screenshot({ path: f })
    console.log('screenshot:', f)
  },

  // DOM click, not coordinate click — robust regardless of window geometry.
  async click(sel) {
    if (!page) return console.log('ERROR: launch first')
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK'
    }, sel)
    console.log('click', sel, '->', r)
  },

  // Real coordinate-based click (vs. DOM `click`) — needed for elements
  // that rely on genuine mousedown/mouseup to focus, e.g. the xterm
  // terminal's hidden textarea.
  async rclick(sel) {
    if (!page) return console.log('ERROR: launch first')
    try {
      await page.click(sel, { timeout: 5000 })
      console.log('rclick', sel, '-> OK')
    } catch (e) {
      console.log('rclick', sel, '-> ERROR:', e.message)
    }
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first')
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')]
      const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t))
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK: ' + el.tagName
    }, text)
    console.log('click-text', JSON.stringify(text), '->', r)
  },

  async type(text) {
    if (page) await page.keyboard.type(text, { delay: 20 })
  },
  async press(key) {
    if (page) await page.keyboard.press(key)
  },

  // Real mouse input over CDP — works for drag interactions (e.g. the
  // terminal panel's resize handle) even though the window isn't visible.
  async drag(args) {
    if (!page) return console.log('ERROR: launch first')
    const [x1, y1, x2, y2] = args.split(/\s+/).map(Number)
    await page.mouse.move(x1, y1)
    await page.mouse.down()
    await page.mouse.move(x2, Math.round((y1 + y2) / 2))
    await page.mouse.move(x2, y2)
    await page.mouse.up()
    console.log(`drag (${x1},${y1}) -> (${x2},${y2})`)
  },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first')
    try {
      await page.waitForSelector(sel, { timeout: 10_000 })
      console.log('found:', sel)
    } catch {
      console.log('TIMEOUT:', sel)
    }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first')
    try {
      console.log(JSON.stringify(await page.evaluate(expr)))
    } catch (e) {
      console.log('ERROR:', e.message)
    }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first')
    console.log(
      await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', sel || null)
    )
  },

  async sleep(ms) {
    await new Promise((r) => setTimeout(r, Number(ms) || 500))
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first')
    for (const w of app.windows()) console.log(' ', w.url())
  },

  async quit() {
    if (app) await app.close().catch(() => {})
    app = null
    page = null
  },
  help() {
    console.log('commands:', Object.keys(COMMANDS).join(', '))
  }
}

async function runLine(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/)
  if (!cmd) return
  const fn = COMMANDS[cmd]
  if (!fn) {
    console.log('unknown:', cmd, '- try: help')
    return
  }
  try {
    await fn(rest.join(' '))
  } catch (e) {
    console.log('ERROR:', e.message)
  }
}

const scriptPath = process.argv[2]

if (scriptPath) {
  // Batch mode: run a newline-separated list of commands from a file, then
  // exit. Best fit for one-shot tool invocations that can't hold an
  // interactive stdin session open across calls (e.g. no tmux available).
  const lines = fs
    .readFileSync(scriptPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  for (const line of lines) {
    console.log(`driver> ${line}`)
    await runLine(line)
  }
  if (app) await COMMANDS.quit()
  process.exit(0)
} else {
  // Interactive REPL — for a human terminal, or wrapped in tmux by an agent.
  // Reads the raw fd so Electron can't steal stdin from us.
  const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') })
  const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' })

  rl.on('line', async (line) => {
    await runLine(line)
    if (line.trim() === 'quit') {
      rl.close()
      process.exit(0)
    }
    rl.prompt()
  })
  rl.on('close', async () => {
    await COMMANDS.quit()
    process.exit(0)
  })

  console.log('SillyGit driver - "help" for commands, "launch" to start')
  rl.prompt()
}
