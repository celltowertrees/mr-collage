import { CollageImage, Tool } from '../types';

interface ToolbarProps {
  tool: Tool;
  selectedImage: CollageImage | null;
  onToolChange: (tool: Tool) => void;
  onUpload: () => void;
  onUpdateImage: (id: string, changes: Partial<CollageImage>) => void;
  onDelete: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClearMask: (id: string) => void;
  onExportJPEG: () => void;
  onExportJSON: () => void;
}

export function Toolbar({
  tool,
  selectedImage,
  onToolChange,
  onUpload,
  onUpdateImage,
  onDelete,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onClearMask,
  onExportJPEG,
  onExportJSON,
}: ToolbarProps) {
  const isMaskTool = tool.startsWith('mask-');

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <span className="toolbar-label">Tools</span>
        <button
          className={`toolbar-btn ${tool === 'select' ? 'active' : ''}`}
          onClick={() => onToolChange('select')}
          title="Select (V)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1l5.5 14 2.2-5.8L14.5 7z" />
          </svg>
        </button>
        <button
          className={`toolbar-btn ${tool === 'pan' ? 'active' : ''}`}
          onClick={() => onToolChange('pan')}
          title="Pan (H)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1l-3 3h2v3H4V5L1 8l3 3v-2h3v3H5l3 3 3-3h-2V9h3v2l3-3-3-3v2H9V4h2z" />
          </svg>
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onClick={onUpload} title="Upload Image">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1L4 5h3v5h2V5h3L8 1zM2 12v2h12v-2H2z" />
          </svg>
        </button>
      </div>

      {selectedImage && (
        <>
          <div className="toolbar-section">
            <span className="toolbar-label">Image</span>

            <label className="toolbar-field">
              <span>Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={selectedImage.opacity}
                onChange={(e) =>
                  onUpdateImage(selectedImage.id, { opacity: parseFloat(e.target.value) })
                }
              />
              <span className="toolbar-value">{Math.round(selectedImage.opacity * 100)}%</span>
            </label>

            <label className="toolbar-field">
              <span>Rotation</span>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={selectedImage.rotation}
                onChange={(e) =>
                  onUpdateImage(selectedImage.id, { rotation: parseFloat(e.target.value) })
                }
              />
              <span className="toolbar-value">{Math.round(selectedImage.rotation)}&deg;</span>
            </label>

            <div className="toolbar-divider" />

            <button
              className="toolbar-btn"
              onClick={() => onBringToFront(selectedImage.id)}
              title="Bring to Front"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="6" width="8" height="8" rx="1" opacity="0.3" />
                <rect x="5" y="2" width="8" height="8" rx="1" />
              </svg>
            </button>
            <button
              className="toolbar-btn"
              onClick={() => onSendToBack(selectedImage.id)}
              title="Send to Back"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="5" y="2" width="8" height="8" rx="1" opacity="0.3" />
                <rect x="1" y="6" width="8" height="8" rx="1" />
              </svg>
            </button>
            <button
              className="toolbar-btn"
              onClick={() => onDuplicate(selectedImage.id)}
              title="Duplicate"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="4" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <rect x="5" y="1" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              className="toolbar-btn danger"
              onClick={() => onDelete(selectedImage.id)}
              title="Delete"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 2V1h6v1h4v2H1V2h4zm1 4v7h1V6H6zm3 0v7h1V6H9zM2 5l1 10h10l1-10H2z" />
              </svg>
            </button>
          </div>

          <div className="toolbar-section">
            <span className="toolbar-label">Mask</span>
            <button
              className={`toolbar-btn ${tool === 'mask-circle' ? 'active' : ''}`}
              onClick={() => onToolChange(tool === 'mask-circle' ? 'select' : 'mask-circle')}
              title="Circle Mask"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6" />
              </svg>
            </button>
            <button
              className={`toolbar-btn ${tool === 'mask-rect' ? 'active' : ''}`}
              onClick={() => onToolChange(tool === 'mask-rect' ? 'select' : 'mask-rect')}
              title="Rectangle Mask"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="12" height="10" rx="1" />
              </svg>
            </button>
            <button
              className={`toolbar-btn ${tool === 'mask-polygon' ? 'active' : ''}`}
              onClick={() => onToolChange(tool === 'mask-polygon' ? 'select' : 'mask-polygon')}
              title="Freeform Mask (click points, double-click to finish)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="8,1 14,6 12,14 4,14 2,6" />
              </svg>
            </button>
            {selectedImage.mask && (
              <button
                className="toolbar-btn danger"
                onClick={() => onClearMask(selectedImage.id)}
                title="Clear Mask"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
              </button>
            )}
            {isMaskTool && (
              <span className="mask-hint">
                {tool === 'mask-polygon'
                  ? 'Click to add points, double-click to finish'
                  : 'Click and drag to draw mask'}
              </span>
            )}
          </div>
        </>
      )}

      <div className="toolbar-section toolbar-right">
        <span className="toolbar-label">Export</span>
        <button className="toolbar-btn export-btn" onClick={onExportJPEG} title="Export JPEG">
          JPEG
        </button>
        <button className="toolbar-btn export-btn" onClick={onExportJSON} title="Export ICP JSON">
          JSON
        </button>
      </div>
    </div>
  );
}
