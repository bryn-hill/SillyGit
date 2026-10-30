import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'lanes/manage-lanes',
  title: 'Manage lanes',
  category: 'lanes',
  summary: 'Create, apply, unapply, push and remove lanes, undo lane changes and turn lanes off.',
  keywords: ['lanes', 'apply', 'unapply', 'default lane', 'push lane', 'turn off lanes', 'undo lane'],
  related: ['lanes/lanes-overview', 'remotes-prs/create-pull-request'],
  body: `With lanes on, each lane's **Lane actions** menu has:

- **Make default lane:** new changes go here.
- **Rename…** and **Push** (pushes that lane's branch; the button on the lane does the same).
- **Unapply:** takes the lane out of your working copy, setting its uncommitted changes aside. Apply it again later and they come back.
- **Remove from lanes:** unapply it and stop listing it. The branch itself stays.

At the top of the panel, **+ Lane** makes a new lane. The **⋯** menu next to it has **Apply a branch as a lane…** (bring an existing branch in), **Undo lane change** and **Turn off lanes…**. Unapplied lanes are listed at the bottom under **Unapplied** so you can apply them again; the palette has **New lane…** and **Apply lane** too.

If a lane's branch moves outside SillyGit (a pull or reset in a terminal, say), the panel says so; click **Update workspace** to catch up.

**Undo lane change** reverses the last lane action, such as a commit, move or unapply. The toolbar's Undo doesn't touch lane changes.

## Turning lanes off

**Turn off lanes…** checks out one branch again. Any lanes with uncommitted changes are listed first so nothing is lost.

## Example

A colleague asks you to look at their branch while you have two lanes going. Choose **Apply a branch as a lane…** and pick their branch: their code now runs alongside yours. When you're done, **Unapply** it to take it back out.`
}

export default article
