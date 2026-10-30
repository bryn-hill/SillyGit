# Contributing

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
