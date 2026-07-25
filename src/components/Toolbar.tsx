import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
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

// ---- Icons ----

const SelectIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 1l5.5 14 2.2-5.8L14.5 7z" />
  </svg>
);

const PanIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1l-3 3h2v3H4V5L1 8l3 3v-2h3v3H5l3 3 3-3h-2V9h3v2l3-3-3-3v2H9V4h2z" />
  </svg>
);

const UploadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1L4 5h3v5h2V5h3L8 1zM2 12v2h12v-2H2z" />
  </svg>
);

const UndoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 3L1 6l3 3V7c3.3 0 6 1.8 6 5-1-2.5-3-3.5-6-3.5V10L1 6z" />
  </svg>
);

const RedoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M12 3l3 3-3 3V7c-3.3 0-6 1.8-6 5 1-2.5 3-3.5 6-3.5V10l3-4z" />
  </svg>
);

const BringToFrontIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="6" width="8" height="8" rx="1" opacity="0.3" />
    <rect x="5" y="2" width="8" height="8" rx="1" />
  </svg>
);

const SendToBackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="5" y="2" width="8" height="8" rx="1" opacity="0.3" />
    <rect x="1" y="6" width="8" height="8" rx="1" />
  </svg>
);

const DuplicateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="4" width="9" height="9" rx="1" />
    <rect x="5" y="1" width="9" height="9" rx="1" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5 2V1h6v1h4v2H1V2h4zm1 4v7h1V6H6zm3 0v7h1V6H9zM2 5l1 10h10l1-10H2z" />
  </svg>
);

const CircleMaskIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" />
  </svg>
);

const RectMaskIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="10" rx="1" />
  </svg>
);

const PolygonMaskIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polygon points="8,1 14,6 12,14 4,14 2,6" />
  </svg>
);

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3.5 3.5l9 9m0-9l-9 9" />
  </svg>
);

const CropIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 1v10a1 1 0 0 0 1 1h10M1 4h10a1 1 0 0 1 1 1v10" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 8l4 4 8-8" />
  </svg>
);

const ShadowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="2" width="9" height="9" rx="1.5" fill="currentColor" />
    <rect x="5" y="5" width="9" height="9" rx="1.5" fill="currentColor" opacity="0.35" />
  </svg>
);

// ---- Shared toolbar primitives ----

interface ToolButtonProps {
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { onClick, title, active, danger, disabled, className, children },
  ref
) {
  const classes = ['toolbar-btn', active && 'active', danger && 'danger', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} className={classes} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
});

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function SliderField({ label, value, min, max, step, display, onChange }: SliderFieldProps) {
  return (
    <label className="toolbar-field">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="toolbar-value">{display}</span>
    </label>
  );
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
        <ToolButton active={tool === 'select'} onClick={() => onToolChange('select')} title="Select (V)">
          <SelectIcon />
        </ToolButton>
        <ToolButton active={tool === 'pan'} onClick={() => onToolChange('pan')} title="Pan (H)">
          <PanIcon />
        </ToolButton>
        <div className="toolbar-divider" />
        <ToolButton onClick={onUpload} title="Upload Image">
          <UploadIcon />
        </ToolButton>
        <div className="toolbar-divider" />
        <ToolButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <UndoIcon />
        </ToolButton>
        <ToolButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <RedoIcon />
        </ToolButton>
      </div>

      {selectedImage && (
        <>
          <div className="toolbar-section">
            <span className="toolbar-label">Image</span>

            <SliderField
              label="Opacity"
              min={0}
              max={1}
              step={0.05}
              value={selectedImage.opacity}
              display={`${Math.round(selectedImage.opacity * 100)}%`}
              onChange={(value) =>
                onUpdateImage(selectedImage.id, { opacity: value }, { coalesce: true })
              }
            />

            <SliderField
              label="Rotation"
              min={0}
              max={360}
              step={1}
              value={selectedImage.rotation}
              display={`${Math.round(selectedImage.rotation)}°`}
              onChange={(value) =>
                onUpdateImage(selectedImage.id, { rotation: value }, { coalesce: true })
              }
            />

            <div className="blend-mode-field">
              <ToolButton
                ref={blendButtonRef}
                onClick={() => {
                  if (blendMenuPos) {
                    setBlendMenuPos(null);
                    return;
                  }
                  const rect = blendButtonRef.current?.getBoundingClientRect();
                  if (rect) setBlendMenuPos({ top: rect.bottom + 6, left: rect.left });
                }}
                title="Blend Mode"
                active={!!blendMenuPos}
                className="export-btn"
              >
                {formatBlendModeLabel(selectedImage.blendMode ?? 'normal')}
              </ToolButton>
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

            <ToolButton onClick={() => onBringToFront(selectedImage.id)} title="Bring to Front">
              <BringToFrontIcon />
            </ToolButton>
            <ToolButton onClick={() => onSendToBack(selectedImage.id)} title="Send to Back">
              <SendToBackIcon />
            </ToolButton>
            <ToolButton onClick={() => onDuplicate(selectedImage.id)} title="Duplicate">
              <DuplicateIcon />
            </ToolButton>
            <ToolButton danger onClick={() => onDelete(selectedImage.id)} title="Delete">
              <DeleteIcon />
            </ToolButton>
          </div>

          <div className="toolbar-section">
            <span className="toolbar-label">Mask</span>
            <ToolButton
              active={tool === 'mask-circle'}
              onClick={() => onToolChange(tool === 'mask-circle' ? 'select' : 'mask-circle')}
              title="Circle Mask"
            >
              <CircleMaskIcon />
            </ToolButton>
            <ToolButton
              active={tool === 'mask-rect'}
              onClick={() => onToolChange(tool === 'mask-rect' ? 'select' : 'mask-rect')}
              title="Rectangle Mask"
            >
              <RectMaskIcon />
            </ToolButton>
            <ToolButton
              active={tool === 'mask-polygon'}
              onClick={() => onToolChange(tool === 'mask-polygon' ? 'select' : 'mask-polygon')}
              title="Freeform Mask (click points, double-click to finish)"
            >
              <PolygonMaskIcon />
            </ToolButton>
            {selectedImage.mask && (
              <ToolButton danger onClick={() => onClearMask(selectedImage.id)} title="Clear Mask">
                <XIcon />
              </ToolButton>
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
            <ToolButton
              active={tool === 'crop'}
              onClick={() => onToolChange(tool === 'crop' ? 'select' : 'crop')}
              title="Crop"
            >
              <CropIcon />
            </ToolButton>
            {tool === 'crop' && (
              <>
                <ToolButton onClick={onApplyCrop} disabled={!hasPendingCrop} title="Apply Crop">
                  <CheckIcon />
                </ToolButton>
                <ToolButton danger onClick={onCancelCrop} title="Cancel Crop">
                  <XIcon />
                </ToolButton>
                <span className="mask-hint">Click and drag to draw the crop area</span>
              </>
            )}
          </div>

          <div className="toolbar-section">
            <span className="toolbar-label">Shadow</span>
            <ToolButton
              active={shadow?.enabled}
              onClick={toggleShadow}
              title={shadow?.enabled ? 'Disable Drop Shadow' : 'Enable Drop Shadow'}
            >
              <ShadowIcon />
            </ToolButton>
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
                <SliderField
                  label="Blur"
                  min={0}
                  max={60}
                  step={1}
                  value={shadow.blur}
                  display={`${Math.round(shadow.blur)}`}
                  onChange={(value) => updateShadow({ blur: value })}
                />
                <SliderField
                  label="Offset X"
                  min={-50}
                  max={50}
                  step={1}
                  value={shadow.offsetX}
                  display={`${Math.round(shadow.offsetX)}`}
                  onChange={(value) => updateShadow({ offsetX: value })}
                />
                <SliderField
                  label="Offset Y"
                  min={-50}
                  max={50}
                  step={1}
                  value={shadow.offsetY}
                  display={`${Math.round(shadow.offsetY)}`}
                  onChange={(value) => updateShadow({ offsetY: value })}
                />
                <SliderField
                  label="Opacity"
                  min={0}
                  max={1}
                  step={0.05}
                  value={shadow.opacity}
                  display={`${Math.round(shadow.opacity * 100)}%`}
                  onChange={(value) => updateShadow({ opacity: value })}
                />
              </>
            )}
          </div>
        </>
      )}

      <div className="toolbar-section toolbar-right">
        <span className="toolbar-label">Export</span>
        <ToolButton onClick={onExportJPEG} title="Export JPEG" className="export-btn">
          JPEG
        </ToolButton>
        <ToolButton onClick={onExportJSON} title="Export ICP JSON" className="export-btn">
          JSON
        </ToolButton>
      </div>
    </div>
  );
}
