# Security policy

## Supported versions

SillyGit has no versioned releases yet. Security fixes land on `dev` and reach `main`
with the next promotion, so only the latest `main` is supported.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem.

Report it privately through GitHub instead:
[Report a vulnerability](https://github.com/bryn-hill/SillyGit/security/advisories/new)
(the **Security** tab, then **Report a vulnerability**). Only the maintainer can see the
report.

Include what you can of:

- what the problem is and what an attacker could do with it,
- steps or a proof of concept to reproduce it,
- the SillyGit commit, your OS, and your Git version.

You should hear back within a week. Once a fix is ready we'll agree on a disclosure date
with you, and credit you in the advisory unless you'd rather not be named.

## Scope

SillyGit runs Git, the GitHub and Azure DevOps CLIs and APIs, a terminal and the Claude
Agent SDK on your machine, with your credentials. Of most interest:

- code execution or file access from content in a repository, diff, commit message,
  branch name or pull request,
- leaking stored access tokens or credentials,
- escaping the renderer sandbox into the main process.

Problems in Git, Electron or another dependency itself belong with that project, but
tell us if SillyGit uses it in a way that makes things worse.
