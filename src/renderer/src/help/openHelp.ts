// Placeholder until the help centre lands: it replaces this with a re-export
// of its own openHelp, so every importer picks it up.
/** Opens the help centre, at an article (`<category>/<slug>`) when one is given. */
export function openHelp(articleId?: string): void {
  console.info('Help centre not available yet', articleId ?? '')
}
