import type { JSX } from 'react'
import HelpCentre from './HelpCentre'
import { useHelpCentre } from './useHelpCentre'

/** Shows the help centre while it's open, starting afresh on every `openHelp()`. */
export default function HelpCentreHost(): JSX.Element | null {
  const help = useHelpCentre()
  if (!help.open) return null
  return <HelpCentre key={help.opened} initialArticle={help.articleId} />
}
