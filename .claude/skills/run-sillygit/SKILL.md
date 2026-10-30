---
name: run-sillygit
description: Build, run, and drive the SillyGit Electron desktop app without opening a visible window. Use when asked to start SillyGit, screenshot it, check that a UI change works, or debug its behavior.
---

SillyGit is an Electron + React app (electron-vite). It has a special mode
for drivers (`SILLYGIT_E2E=1`, see `showForE2E` in `src/main/window.ts`):
the window never takes focus and has no Dock icon; on macOS and Windows it's
shown fully transparent with clicks passing through, on Linux it's never
shown. Chromium still renders and can be driven over the DevTools Protocol,
so this never pops a window on the user's screen or steals focus. Drive it via the Playwright REPL at
`.claude/skills/run-sillygit/driver.mjs`.

All paths below are relative to the repo root.

## Build

The driver loads the production build (`out/`), not the Vite dev server —
simpler to automate and closer to what ships.

```bash
npm install
npm run build        # rebuild after any source change before testing it
```

## Run (agent path)

The driver has a **batch mode**: write the commands you want to run (one per
line) to a file and pass it as an argument. It runs them in order, prints
all output, quits the app, and exits — one Bash call, no interactive session
to hold open. This is the primary path since it needs no tmux:

```bash
cat > /tmp/sillygit-script.txt <<'EOF'
launch
ss 01-landing
click-text Open Repository
ss 02-after-click
EOF
node .claude/skills/run-sillygit/driver.mjs /tmp/sillygit-script.txt
```

Then open the PNGs (`/tmp/sillygit-shots/01-landing.png` etc. by default,
override with `SCREENSHOT_DIR`) to actually look at them.

If tmux happens to be available and you want an interactive session instead
(e.g. to poke around without planning every command up front), run the
driver with no argument to get a REPL and wrap it the usual way:

```bash
tmux new-session -d -s sillygit -x 200 -y 50
tmux send-keys -t sillygit 'cd /path/to/sillygit && node .claude/skills/run-sillygit/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t sillygit -p | grep -q "driver>"; do sleep 0.2; done'
tmux send-keys -t sillygit 'launch' Enter
timeout 30 bash -c 'until tmux capture-pane -t sillygit -p | grep -q "launched\."; do sleep 0.2; done'
tmux send-keys -t sillygit 'ss 01-landing' Enter
tmux capture-pane -t sillygit -p
```

### Commands

| command | what it does |
|---|---|
| `launch` | launch the built app hidden, wait for the window |
| `ss [name]` | screenshot -> `/tmp/sillygit-shots/<name>.png` |
| `click <css-sel>` | click element via DOM (works regardless of window geometry) |
| `rclick <css-sel>` | real coordinate click (mousedown/mouseup) — use when DOM `click` doesn't trigger focus, e.g. the xterm terminal |
| `click-text <text>` | click button/link containing text |
| `type <text>` / `press <key>` | keyboard input (`press` accepts combos, e.g. `Control+Backquote`) |
| `drag <x1> <y1> <x2> <y2>` | real mouse drag, for things like the terminal panel's resize handle |
| `wait <css-sel>` | wait for element, 10s timeout |
| `sleep <ms>` | pause (e.g. to let a CSS transition settle before measuring) |
| `eval <js>` | evaluate in the page, print JSON |
| `text [css-sel]` | print innerText |
| `windows` | list window URLs |
| `quit` | close app, exit |

Renderer `console.log`/`console.error`/uncaught exceptions print live in the
driver's own output (`[console:...]`, `[pageerror]`), and the app's main
process log — including renderer messages re-forwarded there — streams in
as `[app] ...` / `[app:err] ...`. No extra devtools wiring needed.

## End-to-end tests

For checks worth keeping, add a Playwright test instead of a one-off driver
script. The suite runs in CI (`.github/workflows/ci.yml`) and uses the same
hidden-window launch:

```bash
npm run test:e2e                      # builds, then runs playwright test
xvfb-run -a npm run test:e2e          # in a container with no display
CI=1 xvfb-run -a npm run test:e2e     # ~4x faster: shows the window (unfocused) on xvfb
```

Layout (page object model):

- `e2e/specs/*.spec.ts`: tests, one file per area. They talk only to page
  objects, never to raw selectors.
- `e2e/pages/`: one class per area (`CommitGraph`, `DetailPanel`,
  `CommitView`, `ClaudePanel`, `TerminalPanel`), all reachable from
  `SillyGitApp`. Locators prefer roles and accessible names; add an ARIA
  role/label or a `data-testid` to the component rather than reaching for a
  CSS class.
- `e2e/fixtures.ts`: `repo` (a fresh two-commit `FixtureRepo`),
  `electronApp` (trace kept on failure) and `sillygit` (the page object).
  Each worker launches one app and its tests share it: between tests the app
  is reset (fresh settings folder, IPC/dialog stubs put back, page reloaded),
  and after a failure it is replaced. `relaunch` and `appEnv` tests, or any
  test with `test.use({ freshApp: true })`, get an app of their own. Tests run
  in parallel (`fullyParallel`), so never rely on another test's state or
  order.
- `e2e/support/`: `FixtureRepo` and `stubIpc()` for replacing a main-process
  handler (the Claude panel tests stub `claude:start`).

On macOS and Windows the test windows are shown but fully transparent and
click-through, with no Dock icon, so the suite runs at full speed without
anything appearing or taking focus. Linux can't do that, so there the window
is only shown with `CI` set (under xvfb); a never-shown window makes each
click wait ~2s and can't screenshot. `E2E_SHOW_WINDOW=1` shows the windows
for real (still unfocused) so you can watch. Open a failure's trace with
`npx playwright show-trace test-results/<test>/attachments/trace-*.zip`.

## Run (human path)

```bash
npm run dev   # opens a real, visible window
```

## Gotchas

- **Claude Code's sandboxed Bash sets `ELECTRON_RUN_AS_NODE=1` globally**,
  which makes the Electron binary behave as plain Node instead of launching
  Electron at all. The driver's `launch` command explicitly deletes that
  var from the child process's env before spawning — if you write your own
  launch code instead of using the driver, do the same.
- The driver launches against the **production build** (`out/`), not the
  Vite dev server, so remember to `npm run build` after changing source —
  otherwise you're testing stale code.
- If there's no display (a bare Linux container), wrap the driver in
  `xvfb-run -a`; Electron won't start without an X server even when hidden.
- The Claude panel (spark button, `Ctrl+Esc`) starts a real Claude Code
  session through the Agent SDK, so it needs a logged-in `claude` or an API
  key, and each prompt costs real usage.
- Terminal panel tabs run real shells (`node-pty`). Closing the driver
  (`quit`) kills the Electron process, which kills any pty sessions with it
  — no manual cleanup needed.

## Troubleshooting

- **`ERROR: no build found at out/main/index.js`**: run `npm run build`.
- **Launch timeout (30s)**: check `[app:err]` output for a main-process
  crash (e.g. a native module ABI mismatch) printed before the window would
  have been ready.
- **A visible window popped up anyway**: `SILLYGIT_E2E` wasn't set in the
  child env — check nothing is stripping it out before `electron.launch()`.
