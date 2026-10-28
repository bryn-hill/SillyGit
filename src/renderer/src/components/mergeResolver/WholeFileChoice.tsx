import type { JSX } from 'react'
import type { ConflictFileContent, RenameKeep } from '../../../../shared/types'

/** Choices for a file deleted on one side, renamed, moved aside, or binary: no line picking possible. */
export default function WholeFileChoice({
  file,
  onTake,
  onDelete,
  onResolveRename,
  onKeepAsIs,
  onClose
}: {
  file: ConflictFileContent
  onTake: (side: 'current' | 'incoming' | 'base') => void
  onDelete: () => void
  onResolveRename: (keep: RenameKeep) => void
  onKeepAsIs: () => void
  onClose: () => void
}): JSX.Element {
  if (file.kind === 'binary') {
    return (
      <div className="merge-choice" role="alertdialog" aria-label="Binary file conflict">
        <p>
          <strong>{file.path}</strong> is a binary file, so it can't be merged line by line. Pick the version to keep.
        </p>
        <div className="merge-choice-buttons">
          <button onClick={() => onTake('current')}>Take current ({file.currentLabel})</button>
          <button onClick={() => onTake('incoming')}>Take incoming ({file.incomingLabel})</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    )
  }
  if (file.folderInTheWay) {
    const { folder, fileSide } = file.folderInTheWay
    const [fileOn, folderOn] =
      fileSide === 'current' ? [file.currentLabel, file.incomingLabel] : [file.incomingLabel, file.currentLabel]
    return (
      <div className="merge-choice" role="alertdialog" aria-label="File and folder conflict">
        <p>
          {fileOn} added a file <strong>{folder}</strong>, but {folderOn} added a folder with the same name. Git kept
          the folder and saved the file as <strong>{file.path}</strong>.
        </p>
        <div className="merge-choice-buttons">
          <button onClick={onKeepAsIs}>Keep As {file.path}</button>
          <button className="danger-button" onClick={onDelete}>
            Delete The File
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    )
  }
  if (file.rename) {
    const { from, current, incoming } = file.rename
    const renamedBoth = current !== null && incoming !== null
    return (
      <div className="merge-choice" role="alertdialog" aria-label="Rename conflict">
        <p>
          {renamedBoth ? (
            <>
              Both sides renamed <strong>{from}</strong>: {file.currentLabel} to <strong>{current}</strong>,{' '}
              {file.incomingLabel} to <strong>{incoming}</strong>.
            </>
          ) : (
            <>
              {current !== null ? file.currentLabel : file.incomingLabel} renamed <strong>{from}</strong> to{' '}
              <strong>{current ?? incoming}</strong>, but {current !== null ? file.incomingLabel : file.currentLabel}{' '}
              deleted it.
            </>
          )}
        </p>
        <div className="merge-choice-buttons">
          {current !== null && <button onClick={() => onResolveRename('current')}>Keep As {current}</button>}
          {incoming !== null && <button onClick={() => onResolveRename('incoming')}>Keep As {incoming}</button>}
          {renamedBoth && <button onClick={() => onResolveRename('both')}>Keep Both</button>}
          <button className="danger-button" onClick={() => onResolveRename('none')}>
            Delete The File
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    )
  }
  const [modifiedOn, deletedOn, keep] =
    file.kind === 'deleted-current'
      ? [file.incomingLabel, file.currentLabel, 'incoming' as const]
      : [file.currentLabel, file.incomingLabel, 'current' as const]
  return (
    <div className="merge-choice" role="alertdialog" aria-label="Modify/delete conflict">
      <p>
        <strong>{file.path}</strong> has been modified on {modifiedOn}, but deleted on {deletedOn}.
      </p>
      <div className="merge-choice-buttons">
        <button onClick={() => onTake('base')}>Keep Base Version</button>
        <button onClick={() => onTake(keep)}>Keep Modified Version</button>
        <button className="danger-button" onClick={onDelete}>
          Delete The File
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
