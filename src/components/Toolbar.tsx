import { useEffect, useRef, useState } from 'react';
import { BLEND_MODES, BlendMode, CollageImage, ShadowData, Tool } from '../types';

const DEFAULT_SHADOW: ShadowData = {
  enabled: true,
  color: '#000000',
  blur: 12,
  offsetX: 6,
  offsetY: 6,
  opacity: 0.5,
};

function formatBlendModeLabel(mode: BlendMode): string {
  return mode
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

interface ToolbarProps {
  tool: Tool;
  selectedImage: CollageImage | null;
  onToolChange: (tool: Tool) => void;
  onUpload: () => void;
  onUpdateImage: (
    id: string,
    changes: Partial<CollageImage>,
    options?: { coalesce?: boolean }
  ) => void;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClearMask: (id: string) => void;
  onExportJPEG: () => void;
  onExportJSON: () => void;
  hasPendingCrop: boolean;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
}

export function Toolbar({
  tool,
  selectedImage,
  onToolChange,
  onUpload,
  onUpdateImage,
  onDelete,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBringToFront,
  onSendToBack,
  onDuplicate,
  onClearMask,
  onExportJPEG,
  onExportJSON,
  hasPendingCrop,
  onApplyCrop,
  onCancelCrop,
}: ToolbarProps) {
  const isMaskTool = tool.startsWith('mask-');

  const [blendMenuPos, setBlendMenuPos] = useState<{ top: number; left: number } | null>(null);
  const blendMenuRef = useRef<HTMLDivElement>(null);
  const blendButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!blendMenuPos) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        blendMenuRef.current &&
        !blendMenuRef.current.contains(target) &&
        !blendButtonRef.current?.contains(target)
      ) {
        setBlendMenuPos(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [blendMenuPos]);

  const shadow = selectedImage?.shadow;

  const toggleShadow = () => {
    if (!selectedImage) return;
    const current = selectedImage.shadow;
    onUpdateImage(selectedImage.id, {
      shadow: { ...(current ?? DEFAULT_SHADOW), enabled: !current?.enabled },
    });
  };

  const updateShadow = (changes: Partial<ShadowData>) => {
    if (!selectedImage) return;
    const current = selectedImage.shadow ?? DEFAULT_SHADOW;
    onUpdateImage(
      selectedImage.id,
      { shadow: { ...current, ...changes } },
      { coalesce: true }
    );
  };

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
        <div className="toolbar-divider" />
        <button
          className="toolbar-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 3L1 6l3 3V7c3.3 0 6 1.8 6 5-1-2.5-3-3.5-6-3.5V10L1 6z" />
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12 3l3 3-3 3V7c-3.3 0-6 1.8-6 5 1-2.5 3-3.5 6-3.5V10l3-4z" />
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
                  onUpdateImage(
                    selectedImage.id,
                    { opacity: parseFloat(e.target.value) },
                    { coalesce: true }
                  )
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
                  onUpdateImage(
                    selectedImage.id,
                    { rotation: parseFloat(e.target.value) },
                    { coalesce: true }
                  )
                }
              />
              <span className="toolbar-value">{Math.round(selectedImage.rotation)}&deg;</span>
            </label>

            <div className="blend-mode-field">
              <button
                ref={blendButtonRef}
                className={`toolbar-btn export-btn ${blendMenuPos ? 'active' : ''}`}
                onClick={() => {
                  if (blendMenuPos) {
                    setBlendMenuPos(null);
                    return;
                  }
                  const rect = blendButtonRef.current?.getBoundingClientRect();
                  if (rect) setBlendMenuPos({ top: rect.bottom + 6, left: rect.left });
                }}
                title="Blend Mode"
              >
                {formatBlendModeLabel(selectedImage.blendMode ?? 'normal')}
              </button>
              {blendMenuPos && (
                <div
                  ref={blendMenuRef}
                  className="blend-mode-popup"
                  role="menu"
                  style={{ top: blendMenuPos.top, left: blendMenuPos.left }}
                >
                  {BLEND_MODES.map((mode) => (
                    <button
                      key={mode}
                      role="menuitem"
                      className={`blend-mode-option ${
                        (selectedImage.blendMode ?? 'normal') === mode ? 'active' : ''
                      }`}
                      onClick={() => {
                        onUpdateImage(selectedImage.id, {
                          blendMode: mode === 'normal' ? undefined : mode,
                        });
                        setBlendMenuPos(null);
                      }}
                    >
                      {formatBlendModeLabel(mode)}
                    </button>
                  ))}
                </div>
              )}
            </div>

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

          <div className="toolbar-section">
            <span className="toolbar-label">Crop</span>
            <button
              className={`toolbar-btn ${tool === 'crop' ? 'active' : ''}`}
              onClick={() => onToolChange(tool === 'crop' ? 'select' : 'crop')}
              title="Crop"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 1v10a1 1 0 0 0 1 1h10M1 4h10a1 1 0 0 1 1 1v10" />
              </svg>
            </button>
            {tool === 'crop' && (
              <>
                <button
                  className="toolbar-btn"
                  onClick={onApplyCrop}
                  disabled={!hasPendingCrop}
                  title="Apply Crop"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 8l4 4 8-8" />
                  </svg>
                </button>
                <button className="toolbar-btn danger" onClick={onCancelCrop} title="Cancel Crop">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                </button>
                <span className="mask-hint">Click and drag to draw the crop area</span>
              </>
            )}
          </div>

          <div className="toolbar-section">
            <span className="toolbar-label">Shadow</span>
            <button
              className={`toolbar-btn ${shadow?.enabled ? 'active' : ''}`}
              onClick={toggleShadow}
              title={shadow?.enabled ? 'Disable Drop Shadow' : 'Enable Drop Shadow'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="9" height="9" rx="1.5" fill="currentColor" />
                <rect x="5" y="5" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.35" />
              </svg>
            </button>
            {shadow?.enabled && (
              <>
                <label className="toolbar-field">
                  <span>Color</span>
                  <input
                    type="color"
                    value={shadow.color}
                    onChange={(e) => updateShadow({ color: e.target.value })}
                  />
                </label>
                <label className="toolbar-field">
                  <span>Blur</span>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    step="1"
                    value={shadow.blur}
                    onChange={(e) => updateShadow({ blur: parseFloat(e.target.value) })}
                  />
                  <span className="toolbar-value">{Math.round(shadow.blur)}</span>
                </label>
                <label className="toolbar-field">
                  <span>Offset X</span>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={shadow.offsetX}
                    onChange={(e) => updateShadow({ offsetX: parseFloat(e.target.value) })}
                  />
                  <span className="toolbar-value">{Math.round(shadow.offsetX)}</span>
                </label>
                <label className="toolbar-field">
                  <span>Offset Y</span>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={shadow.offsetY}
                    onChange={(e) => updateShadow({ offsetY: parseFloat(e.target.value) })}
                  />
                  <span className="toolbar-value">{Math.round(shadow.offsetY)}</span>
                </label>
                <label className="toolbar-field">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={shadow.opacity}
                    onChange={(e) => updateShadow({ opacity: parseFloat(e.target.value) })}
                  />
                  <span className="toolbar-value">{Math.round(shadow.opacity * 100)}%</span>
                </label>
              </>
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
