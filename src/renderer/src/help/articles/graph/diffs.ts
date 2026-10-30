import type { HelpArticle } from '../../../../../shared/help/types'

const article: HelpArticle = {
  id: 'graph/diffs',
  title: 'Read diffs',
  category: 'graph',
  summary: 'Unified and split diffs, ignoring whitespace, image diffs and the full-window file view.',
  keywords: ['diff', 'unified', 'split', 'side by side', 'whitespace', 'image', 'swipe', 'onion skin', 'syntax', 'file view'],
  related: ['commits/line-staging', 'graph/blame-and-file-history', 'commits/edit-files'],
  body: `Click a file in the detail panel to open its diff in the middle of the window. The file list stays beside it, so you can click another file or use **Up** and **Down** to step through them.

The diff toolbar lets you:

- switch between **unified** and **split** (side by side) views;
- **ignore whitespace** changes, handy after a reformat (staging single lines is turned off while it's on);
- open **Blame** or **History** for the file;
- **Edit file** in the built-in editor, or open it in your own editor.

Long lines scroll sideways rather than wrapping, and code is syntax highlighted.

## Image diffs

Changed images are shown as pictures, not bytes. Choose **side by side**, **swipe** (drag a divider across the old and new versions) or **onion skin** (fade between them). SVGs can also be shown as a text diff.

## Example

A designer updated the app icon. Click \`icon.png\` in the commit's file list, choose **Swipe**, and drag the handle across to compare the old and new icon pixel for pixel.`
}

export default article
