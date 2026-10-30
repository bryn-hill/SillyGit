import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/sprint-markers',
  title: 'Show sprints on the graph',
  category: 'graph',
  summary: 'Optional dividers that mark each sprint on the commit graph.',
  keywords: ['sprint', 'agile', 'iteration', 'markers', 'weeks', 'scrum'],
  related: ['graph/commit-graph', 'settings/settings-overview'],
  body: `If your team works in sprints, SillyGit can mark them on the graph: a dashed divider and a **Sprint N · dates** label above each sprint's newest commit, with alternate sprints lightly shaded. The current sprint is highlighted.

## Turning it on

Open **Settings > Sprints**, tick the box and set:

- **Length:** one to four weeks;
- **Start date:** the first day of any sprint;
- **Number:** that sprint's number, so the rest are counted from it.

Commits are placed by their committer date in your local time zone. The setting applies to every repository.

## Example

Your sprints are two weeks long and Sprint 40 started on 6 October. Set length 2, start 6 October, number 40. The graph now shows where Sprint 41 began, which makes it easy to see what landed in each sprint for the retro.`
}

export default article
