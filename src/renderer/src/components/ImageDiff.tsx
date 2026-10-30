import { useEffect, useState, type JSX } from 'react'
import { formatBytes, type ImagePair, type ImageSide } from '../../../shared/imageDiff'

type Mode = 'side' | 'swipe' | 'onion'

const MODES: { id: Mode; label: string; title: string }[] = [
  { id: 'side', label: 'Side by side', title: 'Before and after next to each other' },
  { id: 'swipe', label: 'Swipe', title: 'Drag the slider to wipe from before to after' },
  { id: 'onion', label: 'Onion skin', title: 'Fade from before to after' }
]

interface Props {
  repoPath: string
  hash: string | null
  staged: boolean
  untracked: boolean
  path: string
  oldPath?: string
  /** Changes when the file does, so the images reload. */
  diffText: string
  /** For an SVG, which also has a text diff: switches to it. */
  onShowText?: () => void
}

type Size = { width: number; height: number }

function Caption({ label, side, size }: { label: string; side: ImageSide | null; size: Size | undefined }): JSX.Element {
  return (
    <div className="image-diff-caption">
      <span className="image-diff-caption-label">{label}</span>
      {side ? (
        <span>
          {size ? `${size.width} × ${size.height} · ` : ''}
          {formatBytes(side.bytes)}
        </span>
      ) : (
        <span>{label === 'Before' ? 'Added' : 'Deleted'}</span>
      )}
    </div>
  )
}

/** Before and after of a changed image: side by side, a swipe between them, or one faded over the other. */
export default function ImageDiff({ repoPath, hash, staged, untracked, path, oldPath, diffText, onShowText }: Props): JSX.Element {
  const request = `${repoPath}\0${hash}\0${staged}\0${untracked}\0${path}\0${oldPath}\0${diffText}`
  const [loaded, setLoaded] = useState<{ request: string; pair: ImagePair } | { request: string; error: string } | null>(null)
  const [mode, setMode] = useState<Mode>('side')
  const [position, setPosition] = useState(50)
  const [sizes, setSizes] = useState<Record<string, Size>>({})

  useEffect(() => {
    let cancelled = false
    window.api.imagePair(repoPath, { hash, staged, untracked, path, oldPath }).then((res) => {
      if (cancelled) return
      setLoaded(res.ok ? { request, pair: res.data } : { request, error: res.error })
    })
    return () => {
      cancelled = true
    }
  }, [request, repoPath, hash, staged, untracked, path, oldPath])

  const current = loaded?.request === request ? loaded : null
  if (!current) return <div className="diff-empty">Loading image…</div>
  if ('error' in current) return <div className="diff-empty">{current.error}</div>
  const { before, after } = current.pair
  if (!before && !after) return <div className="diff-empty">No image to show.</div>
  const both = !!before && !!after

  const measure = (side: ImageSide) => (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget
    setSizes((s) => (s[side.dataUrl]?.width === width ? s : { ...s, [side.dataUrl]: { width, height } }))
  }
  const img = (side: ImageSide, alt: string, className = ''): JSX.Element => (
    <img className={`image-diff-img ${className}`} src={side.dataUrl} alt={alt} onLoad={measure(side)} draggable={false} />
  )
  const shownMode = both ? mode : 'side'

  return (
    <div className="image-diff" aria-label="Image diff" role="figure">
      <div className="image-diff-toolbar">
        {both && (
          <div className="toggle-group" role="group" aria-label="Image comparison">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={shownMode === m.id ? 'active' : ''}
                aria-pressed={shownMode === m.id}
                title={m.title}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        {(shownMode === 'swipe' || shownMode === 'onion') && (
          <input
            type="range"
            className="image-diff-slider"
            min={0}
            max={100}
            value={position}
            aria-label={shownMode === 'swipe' ? 'Swipe position' : 'After opacity'}
            onChange={(e) => setPosition(Number(e.target.value))}
          />
        )}
        {onShowText && (
          <button className="text-toggle" onClick={onShowText} title="Show the SVG's source changes">
            Text diff
          </button>
        )}
      </div>

      {shownMode === 'side' ? (
        <div className="image-diff-side">
          {[
            { label: 'Before', side: before },
            { label: 'After', side: after }
          ].map(({ label, side }) => (
            <div key={label} className={`image-diff-pane ${label === 'Before' ? 'before' : 'after'}`}>
              <Caption label={label} side={side} size={side ? sizes[side.dataUrl] : undefined} />
              <div className="image-diff-canvas">
                {side ? img(side, `${path} ${label.toLowerCase()}`) : <div className="image-diff-missing">None</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="image-diff-overlay-wrap">
          <div className="image-diff-captions">
            <Caption label="Before" side={before} size={sizes[before!.dataUrl]} />
            <Caption label="After" side={after} size={sizes[after!.dataUrl]} />
          </div>
          <div className="image-diff-canvas image-diff-stack">
            {img(before!, `${path} before`)}
            <div
              className="image-diff-top"
              style={shownMode === 'swipe' ? { clipPath: `inset(0 0 0 ${position}%)` } : { opacity: position / 100 }}
            >
              {img(after!, `${path} after`)}
            </div>
            {shownMode === 'swipe' && <div className="image-diff-handle" style={{ left: `${position}%` }} aria-hidden="true" />}
          </div>
        </div>
      )}
    </div>
  )
}
