import { expect, test } from '../fixtures'
import { chooseOption } from '../pages/Select'

// Dated in 2030 so they sort above the fixture's own commits whenever the suite runs.
const commits = [
  { subject: 'Sprint one work', date: '2030-01-08T12:00:00' },
  { subject: 'More sprint one', date: '2030-01-15T12:00:00' },
  { subject: 'Sprint two work', date: '2030-01-22T12:00:00' },
  { subject: 'Sprint three work', date: '2030-02-05T12:00:00' }
]

test('sprint markers are off by default and divide the graph by sprint once turned on', async ({ sillygit, repo }) => {
  commits.forEach((c, i) => repo.commitFileAt(`sprint-${i}.txt`, `${i}\n`, c.subject, c.date))
  await sillygit.openRepository(repo.path)
  const { graph, settings } = sillygit

  await expect(graph.row('Sprint three work')).toBeVisible()
  await expect(graph.sprintMarkers).toHaveCount(0)

  await settings.open()
  await expect(settings.sprintsEnabled).not.toBeChecked()
  await settings.sprintsEnabled.check()
  await chooseOption(settings.sprintLength, '2 weeks')
  await settings.sprintStart.fill('2030-01-07')
  await settings.sprintNumber.fill('1')
  await settings.close()

  await expect(graph.sprintMarker('Sprint three work')).toHaveText(/^Sprint 3 · 4 Feb – 17 Feb/)
  await expect(graph.sprintMarker('Sprint two work')).toHaveText(/^Sprint 2 · 21 Jan – 3 Feb/)
  await expect(graph.sprintMarker('More sprint one')).toHaveText(/^Sprint 1 · 7 Jan – 20 Jan/)
  await expect(graph.sprintMarker('Sprint one work')).toHaveCount(0)
  // The fixture's own commits, made today, sit below sprint 1 in an uncounted sprint.
  await expect(graph.sprintMarkers).toHaveCount(4)

  // One-week sprints split the old sprint 1 in two.
  await settings.open()
  await chooseOption(settings.sprintLength, '1 week')
  await settings.close()
  await expect(graph.sprintMarker('Sprint one work')).toHaveText(/^Sprint 1 · 7 Jan – 13 Jan/)
  await expect(graph.sprintMarker('More sprint one')).toHaveText(/^Sprint 2 · 14 Jan – 20 Jan/)

  // Saved: the choices come back, and turning it off removes the markers.
  await settings.open()
  await expect(settings.sprintsEnabled).toBeChecked()
  await expect(settings.sprintStart).toHaveValue('2030-01-07')
  await expect(settings.sprintNumber).toHaveValue('1')
  await settings.sprintsEnabled.uncheck()
  await settings.close()
  await expect(graph.sprintMarkers).toHaveCount(0)
})
