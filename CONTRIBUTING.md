# Contributing

Thanks for helping with SillyGit. Bug reports, ideas and pull requests are all welcome.
Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Please report security problems privately, as described in [SECURITY.md](SECURITY.md),
not in a public issue.

## Issues

Search the existing issues first, then use the bug report or feature request form. For
anything bigger than a small fix, open an issue before writing code so we can agree on
the approach.

## Getting set up

The [README](README.md#getting-started) covers prerequisites, installing and running the
app. `npm install` also points git at `.githooks/`, which checks your commit messages.

## Branches

Branch new work from `dev` and open pull requests against `dev`. `main` is the stable
branch and only receives `dev` when a release is promoted. The in-app "Update SillyGit"
button pulls `main`.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject in the imperative, lowercase, no trailing period

Optional body explaining what changed and why, wrapped at ~72 columns.
```

**Types:** `feat`, `fix`, `perf`, `refactor`, `style` (formatting only), `test`,
`docs`, `build`, `ci`, `chore`, `revert`. Add `!` after the type or scope for a
breaking change.

**Scopes** are optional, lowercase, and name the area of the app:
`graph`, `branch-menu`, `commit`, `conflicts`, `terminal`, `ai`, `claude`,
`launchpad`, `accounts`, `session`, `e2e`, `deps`, `release`, `dev`. Add a new one when none fits.

Examples:

```
feat(conflicts): add GitKraken-style merge conflict handling
fix(terminal): use xterm 5.5 with canvas addon for correct Powerline glyph rendering
chore(deps): update dependency electron to v45
```

Merge commits, `Revert "..."` and `fixup!`/`squash!` commits are exempt. The header
must be at most 100 characters.

### Enforcement

- `npm install` points git at `.githooks/`, whose `commit-msg` hook runs
  `scripts/commit-msg.mjs` and rejects a message that doesn't fit. Run
  `git config core.hooksPath .githooks` yourself if you skipped `npm install`.
- `npm run lint:commits` checks every commit on your branch that isn't on `origin/dev`.
- CI runs the same check on every pull request and every push to `dev` or `main`.

## Before you open a pull request

Run these, and fix anything they report:

```bash
npm run typecheck
npm run lint
npm test
npm run lint:commits
```

If your change touches behaviour an end-to-end spec covers, build and run that spec too
(see [End-to-end tests](README.md#end-to-end-tests)). New behaviour should come with tests:
unit tests next to the code, and e2e specs that find elements by ARIA role, label or
`data-testid`.

Code in `src/renderer` has a few extra rules, listed under
[Renderer code](README.md#renderer-code) in the README.

## Pull requests

- Target `dev`, and keep each pull request to one change.
- Fill in the template: what changed, why, and how you tested it. Screenshots help for
  anything visual.
- CI runs on a self-hosted machine, so it never runs on pull requests from forks. The
  maintainer reviews the code first and then runs the checks.
- Every pull request needs the maintainer's review before it's merged.

## Licence

By contributing, you agree that your contributions are licensed under the project's
[MIT License](LICENSE).
