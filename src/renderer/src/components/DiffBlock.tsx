import { useEffect, useRef, type JSX } from 'react'
import { changedWordsForHunk, splitByRanges, type WordDiffLine, type WordRange } from '../../../shared/wordDiff'

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-file-header'
  if (line.startsWith('@@')) return 'diff-hunk-header'
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-remove'
  return 'diff-context'
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** A diff line with its changed words (offsets past the +/- marker) wrapped in `diff-word` marks. */
function LineText({ line, words }: { line: string; words: WordRange[] | null }): JSX.Element {
  if (!words || words.length === 0) return <>{line}</>
  return (
    <>
      {line[0]}
      {splitByRanges(line.slice(1), words).map((piece, i) =>
        piece.changed ? (
          <mark key={i} className="diff-word">
            {piece.text}
          </mark>
        ) : (
          piece.text
        )
      )}
    </>
  )
}

interface Props {
  diffText: string
  highlightLine?: number
}

export default function DiffBlock({ diffText, highlightLine }: Props): JSX.Element {
  const containerRef = useRef<HTMLPreElement>(null)
  const lines = diffText.split('\n')

  // Number the new-file side of each hunk as we go.
  const rendered: Array<{ line: string; cls: string; lineNum: number | undefined; key: number }> = []
  const wordLines: WordDiffLine[] = []
  let newLineNum = 0
  let inHunk = false
  lines.forEach((line, i) => {
    const cls = lineClass(line)
    let lineNum: number | undefined
    const hunkMatch = cls === 'diff-hunk-header' && line.match(HUNK_HEADER_RE)
    if (line.startsWith('diff --git ')) {
      inHunk = false
    } else if (hunkMatch) {
      inHunk = true
      newLineNum = Number(hunkMatch[1])
    } else if (inHunk && (cls === 'diff-add' || cls === 'diff-context')) {
      lineNum = newLineNum
      newLineNum += 1
    }
    rendered.push({ line, cls, lineNum, key: i })
    const type = !inHunk || cls === 'diff-hunk-header' ? 'context' : cls === 'diff-add' ? 'add' : cls === 'diff-remove' ? 'remove' : 'context'
    wordLines.push({ type, text: line.slice(1) })
  })
  const words = changedWordsForHunk(wordLines)

  useEffect(() => {
    if (highlightLine == null) return
    containerRef.current
      ?.querySelector('.diff-highlight')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [diffText, highlightLine])

  return (
    <pre className="diff-content" ref={containerRef}>
      {rendered.map(({ line, cls, lineNum, key }) => (
        <div
          key={key}
          className={lineNum != null && lineNum === highlightLine ? `${cls} diff-highlight` : cls}
        >
          {line.length === 0 ? ' ' : <LineText line={line} words={words[key]} />}
        </div>
      ))}
    </pre>
  )
}
