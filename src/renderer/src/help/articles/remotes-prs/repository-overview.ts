import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'remotes-prs/repository-overview',
  title: 'See all your repositories at once',
  category: 'remotes-prs',
  summary: 'The Repositories tab lists every repository you work on, in your own groups, with its branch, commits to push or pull and uncommitted changes.',
  keywords: ['overview', 'repositories', 'repos', 'groups', 'fetch all', 'dashboard', 'workspace', 'ahead', 'behind', 'status'],
  related: ['remotes-prs/launchpad', 'remotes-prs/push-pull-fetch', 'getting-started/open-a-repository'],
  body: `Click the **Repositories** tab next to **Launchpad** in the tab bar, or pick **Open repository overview** in the command palette.

It lists every repository SillyGit knows about: the ones open in tabs, the ones you added to the Launchpad workspace, and the ones you've put in a group. Each row shows:

- the branch that's checked out (or the commit, when HEAD is detached);
- **↑** commits to push and **↓** commits to pull, compared with the branch's upstream, or *not published* when it has none;
- how many files have uncommitted changes, and any conflicts.

Click a repository's name to open it in a tab.

## Groups

Click **+ New group** and give it a name, such as *Work* or *Side projects*. Then use the group menu on each row to move a repository into a group. Groups can be renamed, moved up or down, and deleted; deleting a group keeps its repositories listed under **Not in a group**.

## Fetching

**Fetch all** fetches every repository in the list, a few at a time, then refreshes the counts. Each row and each group also has its own **Fetch** button. A fetch that fails says so on its row; hover over it for git's message.

**+ Add repo** lists a repository here (and in Launchpad) without opening a tab for it. The **×** on a row takes it out again; repositories open in tabs stay listed until you close the tab.

## Example

Before stand-up, open **Repositories** and click **Fetch all**. The *Work* group shows the API repo is **↓3** behind and the web app has 2 uncommitted changes, so you open the web app first to commit, then pull the API.`
}

export default article
