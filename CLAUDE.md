# SillyGit

Branch new work from `dev` and merge it back into `dev`. `main` is the stable branch: it only
receives `dev` when the owner asks for a promotion. The in-app "Update SillyGit" button
deliberately pulls `main`.

Commit messages must follow Conventional Commits (`type(scope): subject`, lowercase
subject, no trailing period). See CONTRIBUTING.md for the types and scopes, and run
`npm run lint:commits` before pushing; CI rejects anything else.

React code in `src/renderer` must pass `npm run lint` (eslint-plugin-react-hooks with the React
Compiler rules; CI runs it). Follow https://react.dev/learn/you-might-not-need-an-effect: derive
values while rendering, reset state with a `key`, keep effects for syncing with outside systems, and
use `useEffectEvent` rather than assigning refs during render. Don't silence a rule without a comment
saying why it's a false positive.

Put renderer hooks in `.tsx` files, even without JSX. Vite only gives `.tsx` files Fast Refresh
signatures, so a hook in a `.ts` file that gains or loses a hook keeps the old state on a hot update
and crashes its component with "change in the order of Hooks". Keep exports of component files to
components (and constants), or Fast Refresh falls back to a full reload.
