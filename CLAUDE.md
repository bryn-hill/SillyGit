# SillyGit

Commit messages must follow Conventional Commits (`type(scope): subject`, lowercase
subject, no trailing period). See CONTRIBUTING.md for the types and scopes, and run
`npm run lint:commits` before pushing; CI rejects anything else.

React code in `src/renderer` must pass `npm run lint` (eslint-plugin-react-hooks with the React
Compiler rules; CI runs it). Follow https://react.dev/learn/you-might-not-need-an-effect: derive
values while rendering, reset state with a `key`, keep effects for syncing with outside systems, and
use `useEffectEvent` rather than assigning refs during render. Don't silence a rule without a comment
saying why it's a false positive.
