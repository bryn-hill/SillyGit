import type { HelpArticle } from "../../../../../shared/help/types";

const article: HelpArticle = {
  id: "commits/ignore-files",
  title: "Ignore files",
  category: "commits",
  summary:
    "Add an untracked file, file type or folder to .gitignore so Git stops listing it.",
  keywords: [
    "ignore",
    "gitignore",
    ".gitignore",
    "untracked",
    "exclude",
    "hide",
    "build",
    "logs",
  ],
  related: ["commits/stage-and-commit", "commits/git-lfs"],
  body: `Files you never want to commit, like build output, logs or local settings, belong in \`.gitignore\`. SillyGit adds them for you.

## Ignoring a file

1. Select **Uncommitted changes** and find the file in **Unstaged**.
2. Right-click it and point to **Ignore**.
3. Pick what to ignore:
   - **This file**: just this one, e.g. \`/config/local.json\`.
   - **All *.log files**: every file with that extension, anywhere in the repo.
   - **Folder logs/**: the whole folder the file is in.

SillyGit adds the pattern to the \`.gitignore\` at the root of the repo, creating it if there isn't one, and the matching files drop out of the list. Commit \`.gitignore\` so everyone on the team ignores them too; the commit box suggests \`chore: update .gitignore\` for it.

## Things to know

- **Ignore** only appears for untracked files. Git keeps tracking a file it already has, even once it matches \`.gitignore\`. To stop tracking one, delete it from the repo in a commit (\`git rm --cached <file>\`) and then ignore it.
- If the pattern is already in \`.gitignore\`, nothing changes and SillyGit says so.
- To undo, edit \`.gitignore\` and remove the line.

## Example

Your test runner writes \`coverage/lcov.info\` and it keeps showing up in **Unstaged**. Right-click it, point to **Ignore** and pick **Folder coverage/**. The folder disappears from the list and \`.gitignore\` appears in its place. Stage \`.gitignore\` and commit it with \`chore: update .gitignore\`.`,
};

export default article;
