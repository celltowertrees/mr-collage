import { useEffect } from 'react';

// Asks how an imported collage should meet the one already on the canvas.
// Only shown when there's something to keep — importing onto an empty canvas
// has nothing to choose between.
export function ImportChoiceDialog({
  fileName,
  objectCount,
  onAdd,
  onReplace,
  onCancel,
}: {
  fileName: string;
  objectCount: number;
  onAdd: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  useEscape(onCancel);
  return (
    <div className="import-dialog-backdrop" onClick={onCancel}>
      <div
        className="import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="import-dialog-title" className="import-dialog-title">Import Collage</h2>
        <p className="import-dialog-body">
          <strong>{fileName}</strong> has {objectCount} {objectCount === 1 ? 'object' : 'objects'}.
          Add {objectCount === 1 ? 'it' : 'them'} to the current canvas, or replace what's there?
        </p>
        <div className="import-dialog-actions">
          <button className="import-dialog-secondary" onClick={onCancel}>Cancel</button>
          <button className="import-dialog-secondary" onClick={onReplace}>Replace Canvas</button>
          <button className="import-dialog-primary" onClick={onAdd} autoFocus>Add to Canvas</button>
        </div>
      </div>
    </div>
  );
}

export function ImportErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="import-dialog-backdrop" onClick={onClose}>
      <div
        className="import-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-error-title"
        aria-describedby="import-error-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="import-error-title" className="import-dialog-title">Couldn't Import</h2>
        <p id="import-error-body" className="import-dialog-body">{message}</p>
        <div className="import-dialog-actions">
          <button className="import-dialog-primary" onClick={onClose} autoFocus>OK</button>
        </div>
      </div>
    </div>
  );
}

function useEscape(handler: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}
