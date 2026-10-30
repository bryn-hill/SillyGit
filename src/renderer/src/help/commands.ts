import type { Command } from '../components/CommandPalette'
import { startTour } from './tourBus'

/** The Help entries in the command palette: the walkthrough and the help centre's articles. */
export function helpCommands(): Command[] {
  return [{ id: 'help-start-walkthrough', group: 'Help', label: 'Start walkthrough', run: startTour }]
}
