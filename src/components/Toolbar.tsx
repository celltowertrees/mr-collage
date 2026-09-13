import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BLEND_MODES,
  BlendMode,
  CollageObject,
  CollageText,
  DEFAULT_ROTATION_3D,
  DirectionalLightData,
  Model3DMaterial,
  ObjectChanges,
  PRIMITIVE_SHAPES,
  PrimitiveShape,
  SHAPE_LABELS,
  ShadowData,
  Tool,
  VignetteData,
} from '../types';
import type { VisionDetail } from '../utils/generateBackground';
import { GOOGLE_FONTS } from '../utils/googleFonts';
import { warmUpModelRenderer } from '../utils/model3dRenderer';
import {
  SelectIcon, PanIcon, TextToolIcon,
  BoldIcon, ItalicIcon, UnderlineIcon,
  UploadIcon, UndoIcon, RedoIcon,
  BringToFrontIcon, SendToBackIcon, DuplicateIcon, DeleteIcon,
  CircleMaskIcon, RectMaskIcon, PolygonMaskIcon, GradientMaskIcon,
  XIcon, CropIcon, CheckIcon,
  FlipHorizontalIcon, FlipVerticalIcon,
  ShadowIcon, VignetteIcon, SparkleIcon, BgGenIcon,
  CubeIcon, Rotate3DIcon, LightIcon,
} from './ToolbarIcons';

const DEFAULT_SHADOW: ShadowData = {
  enabled: true,
  color: '#000000',
  blur: 12,
  offsetX: 6,
  offsetY: 6,
  opacity: 0.5,
};

const DEFAULT_VIGNETTE: VignetteData = {
  enabled: true,
  innerRadius: 0.5,
  outerRadius: 1,
};

function formatBlendModeLabel(mode: BlendMode): string {
  return mode
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

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

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

// Exact numeric entry, for the 3D rotation angles where "45 degrees" is a
// thing you want to type rather than hunt for on a slider.
function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label className="toolbar-field">
      {/* The degree sign rides on the label rather than trailing the input:
          the toolbar's flex gap made a trailing unit sit closer to the NEXT
          field's label than to its own value. */}
      <span>{label}&deg;</span>
      <input
        type="number"
        className="toolbar-number"
        step={1}
        value={Math.round(value)}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}

interface ToolbarProps {
  tool: Tool;
  selectedImage: CollageObject | null;
  onToolChange: (tool: Tool) => void;
  onUpload: () => void;
  onAddModel3D: (shape: PrimitiveShape) => void;
  onOpenStickerGenerator: () => void;
  visionDetail: VisionDetail;
  onVisionDetailChange: (detail: VisionDetail) => void;
  onUpdateImage: (
    id: string,
    changes: ObjectChanges,
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
  onClearGradient: (id: string) => void;
  onExportJPEG: () => void;
  onExportJSON: () => void;
  onExportHTML: () => void;
  hasPendingCrop: boolean;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
}

export function Toolbar({
  tool,
  selectedImage,
  onToolChange,
  onUpload,
  onAddModel3D,
  onOpenStickerGenerator,
  visionDetail,
  onVisionDetailChange,
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
  onClearGradient,
  onExportJPEG,
  onExportJSON,
  onExportHTML,
  hasPendingCrop,
  onApplyCrop,
  onCancelCrop,
}: ToolbarProps) {
  const isMaskTool = tool.startsWith('mask-');
  // Shape mask/crop/vignette only ever apply to images (there's no real case
  // for clipping or vignetting a text object, or a 3D object, the way there is
  // for a photo); shadow/blend mode/flip/gradient fade apply to every kind;
  // text formatting and the 3D controls only ever apply to their own kind —
  // narrow once here rather than re-checking `.kind` at every field access
  // below. Each check is positive, so a future kind has to opt in to a control
  // rather than inheriting it by accident.
  const image = selectedImage?.kind === 'image' ? selectedImage : null;
  const text = selectedImage?.kind === 'text' ? selectedImage : null;
  const model = selectedImage?.kind === 'model3d' ? selectedImage : null;

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

  const [shapeMenuPos, setShapeMenuPos] = useState<{ top: number; left: number } | null>(null);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const shapeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!shapeMenuPos) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        shapeMenuRef.current &&
        !shapeMenuRef.current.contains(target) &&
        !shapeButtonRef.current?.contains(target)
      ) {
        setShapeMenuPos(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [shapeMenuPos]);

  // Orientation, lighting and material are all continuous adjustments, so they
  // coalesce into a single undo step the same way the opacity and shadow
  // sliders do.
  const updateRotation3D = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!model) return;
    onUpdateImage(model.id, { rotation3D: { ...model.rotation3D, [axis]: value } }, { coalesce: true });
  };

  const updateLight = (changes: Partial<DirectionalLightData>) => {
    if (!model) return;
    onUpdateImage(model.id, { light: { ...model.light, ...changes } }, { coalesce: true });
  };

  const updateMaterial = (changes: Partial<Model3DMaterial>) => {
    if (!model) return;
    onUpdateImage(model.id, { material: { ...model.material, ...changes } }, { coalesce: true });
  };

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

  const vignette = image?.vignette;

  const toggleVignette = () => {
    if (!image) return;
    const current = image.vignette;
    onUpdateImage(image.id, {
      vignette: { ...(current ?? DEFAULT_VIGNETTE), enabled: !current?.enabled },
    });
  };

  const updateVignette = (changes: Partial<VignetteData>) => {
    if (!image) return;
    const current = image.vignette ?? DEFAULT_VIGNETTE;
    onUpdateImage(
      image.id,
      { vignette: { ...current, ...changes } },
      { coalesce: true }
    );
  };

  const updateText = (changes: Partial<CollageText>, options?: { coalesce?: boolean }) => {
    if (!text) return;
    onUpdateImage(text.id, changes, options);
  };

  return (
    <div className="toolbar">
      <div className="toolbar-title">Mr. Collage</div>
      <div className="toolbar-section">
        <ToolButton active={tool === 'select'} onClick={() => onToolChange('select')} title="Select (V)">
          <SelectIcon />
        </ToolButton>
        <ToolButton active={tool === 'pan'} onClick={() => onToolChange('pan')} title="Pan (H)">
          <PanIcon />
        </ToolButton>
        <ToolButton active={tool === 'text'} onClick={() => onToolChange('text')} title="Text (T)">
          <TextToolIcon />
        </ToolButton>
        <ToolButton
          active={tool === 'bg-rect'}
          onClick={() => onToolChange(tool === 'bg-rect' ? 'select' : 'bg-rect')}
          title="Generate Background — draw a rectangle over the images to use as context"
        >
          <BgGenIcon />
        </ToolButton>
        {tool === 'bg-rect' && (
          <>
            <span className="toolbar-field"><span>Detail</span></span>
            {(['low', 'auto', 'high'] as VisionDetail[]).map((d) => (
              <ToolButton
                key={d}
                active={visionDetail === d}
                onClick={() => onVisionDetailChange(d)}
                title={
                  d === 'low'  ? 'Low — fast, cheap, good for mood & color' :
                  d === 'auto' ? 'Auto — OpenAI decides based on image size' :
                                 'High — detailed, slower, more accurate'
                }
                className="export-btn"
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </ToolButton>
            ))}
            <span className="mask-hint">Draw a rectangle over your images</span>
          </>
        )}
        <div className="toolbar-divider" />
        <ToolButton onClick={onUpload} title="Upload Image">
          <UploadIcon />
        </ToolButton>
        <ToolButton onClick={onOpenStickerGenerator} title="Generate Sticker (AI)">
          <SparkleIcon />
        </ToolButton>
        <div className="blend-mode-field">
          <ToolButton
            ref={shapeButtonRef}
            onClick={() => {
              if (shapeMenuPos) {
                setShapeMenuPos(null);
                return;
              }
              // Pay the WebGL context + shader compile now, while the menu is
              // open, instead of inside the click that places the object.
              warmUpModelRenderer();
              const rect = shapeButtonRef.current?.getBoundingClientRect();
              if (rect) setShapeMenuPos({ top: rect.bottom + 6, left: rect.left });
            }}
            title="Add 3D Object"
            active={!!shapeMenuPos}
          >
            <CubeIcon />
          </ToolButton>
          {shapeMenuPos && (
            <div
              ref={shapeMenuRef}
              className="blend-mode-popup shape-picker-popup"
              role="menu"
              style={{ top: shapeMenuPos.top, left: shapeMenuPos.left }}
            >
              {PRIMITIVE_SHAPES.map((shape) => (
                <button
                  key={shape}
                  role="menuitem"
                  className="blend-mode-option"
                  onClick={() => {
                    onAddModel3D(shape);
                    setShapeMenuPos(null);
                  }}
                >
                  {SHAPE_LABELS[shape]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="toolbar-divider" />
        <ToolButton onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <UndoIcon />
        </ToolButton>
        <ToolButton onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <RedoIcon />
        </ToolButton>
      </div>

      {selectedImage && tool !== 'pan' && (
        <>
          <div className="toolbar-section">
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
            <div className="toolbar-divider" />
            <ToolButton
              active={selectedImage.flipX}
              onClick={() => onUpdateImage(selectedImage.id, { flipX: !selectedImage.flipX })}
              title="Flip Horizontal"
            >
              <FlipHorizontalIcon />
            </ToolButton>
            <ToolButton
              active={selectedImage.flipY}
              onClick={() => onUpdateImage(selectedImage.id, { flipY: !selectedImage.flipY })}
              title="Flip Vertical"
            >
              <FlipVerticalIcon />
            </ToolButton>
          </div>

          {text && (
            <div className="toolbar-section">
              <ToolButton active={text.bold} onClick={() => updateText({ bold: !text.bold })} title="Bold">
                <BoldIcon />
              </ToolButton>
              <ToolButton active={text.italic} onClick={() => updateText({ italic: !text.italic })} title="Italic">
                <ItalicIcon />
              </ToolButton>
              <ToolButton
                active={text.underline}
                onClick={() => updateText({ underline: !text.underline })}
                title="Underline"
              >
                <UnderlineIcon />
              </ToolButton>
              <label className="toolbar-field">
                <span>Color</span>
                <input
                  type="color"
                  value={text.color}
                  onChange={(e) => updateText({ color: e.target.value })}
                />
              </label>
              <SliderField
                label="Size"
                min={8}
                max={200}
                step={1}
                value={text.fontSize}
                display={`${Math.round(text.fontSize)}`}
                onChange={(value) => updateText({ fontSize: value }, { coalesce: true })}
              />
              <label className="toolbar-field">
                <span>Font</span>
                <select
                  value={text.fontFamily}
                  onChange={(e) => updateText({ fontFamily: e.target.value })}
                >
                  {GOOGLE_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {model && (
            <>
              <div className="toolbar-section">
                <ToolButton
                  active={tool === 'rotate3d'}
                  onClick={() => onToolChange(tool === 'rotate3d' ? 'select' : 'rotate3d')}
                  title="3D Rotate (R)"
                >
                  <Rotate3DIcon />
                </ToolButton>
                <NumberField label="Rot X" value={model.rotation3D.x} onChange={(v) => updateRotation3D('x', v)} />
                <NumberField label="Rot Y" value={model.rotation3D.y} onChange={(v) => updateRotation3D('y', v)} />
                <NumberField label="Rot Z" value={model.rotation3D.z} onChange={(v) => updateRotation3D('z', v)} />
                <ToolButton
                  onClick={() => onUpdateImage(model.id, { rotation3D: { ...DEFAULT_ROTATION_3D } })}
                  title="Reset 3D Rotation"
                  className="export-btn"
                >
                  Reset
                </ToolButton>
                {tool === 'rotate3d' && (
                  <span className="mask-hint">Drag to turn it; hold Shift to roll</span>
                )}
              </div>

              <div className="toolbar-section">
                <span className="toolbar-field"><LightIcon /></span>
                <SliderField
                  label="Azimuth"
                  min={0}
                  max={360}
                  step={1}
                  value={model.light.azimuth}
                  display={`${Math.round(model.light.azimuth)}\u00b0`}
                  onChange={(value) => updateLight({ azimuth: value })}
                />
                <SliderField
                  label="Elevation"
                  min={-90}
                  max={90}
                  step={1}
                  value={model.light.elevation}
                  display={`${Math.round(model.light.elevation)}\u00b0`}
                  onChange={(value) => updateLight({ elevation: value })}
                />
                <SliderField
                  label="Intensity"
                  min={0}
                  max={5}
                  step={0.1}
                  value={model.light.intensity}
                  display={model.light.intensity.toFixed(1)}
                  onChange={(value) => updateLight({ intensity: value })}
                />
                <SliderField
                  label="Ambient"
                  min={0}
                  max={2}
                  step={0.1}
                  value={model.light.ambient}
                  display={model.light.ambient.toFixed(1)}
                  onChange={(value) => updateLight({ ambient: value })}
                />
                <label className="toolbar-field">
                  <span>Light</span>
                  <input
                    type="color"
                    value={model.light.color}
                    onChange={(e) => updateLight({ color: e.target.value })}
                  />
                </label>
              </div>

              <div className="toolbar-section">
                <label className="toolbar-field">
                  <span>Surface</span>
                  <input
                    type="color"
                    value={model.material.color}
                    onChange={(e) => updateMaterial({ color: e.target.value })}
                  />
                </label>
                <SliderField
                  label="Metalness"
                  min={0}
                  max={1}
                  step={0.05}
                  value={model.material.metalness}
                  display={`${Math.round(model.material.metalness * 100)}%`}
                  onChange={(value) => updateMaterial({ metalness: value })}
                />
                <SliderField
                  label="Roughness"
                  min={0}
                  max={1}
                  step={0.05}
                  value={model.material.roughness}
                  display={`${Math.round(model.material.roughness * 100)}%`}
                  onChange={(value) => updateMaterial({ roughness: value })}
                />
              </div>
            </>
          )}

          <div className="toolbar-section">
            <div className="toolbar-divider" />
            {image && (
              <>
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
                {image.mask && (
                  <ToolButton danger onClick={() => onClearMask(image.id)} title="Clear Mask">
                    <XIcon />
                  </ToolButton>
                )}
                <div className="toolbar-divider" />
              </>
            )}
            <ToolButton
              active={tool === 'mask-gradient'}
              onClick={() => onToolChange(tool === 'mask-gradient' ? 'select' : 'mask-gradient')}
              title="Gradient Fade"
            >
              <GradientMaskIcon />
            </ToolButton>
            {selectedImage.gradientMask && (
              <ToolButton danger onClick={() => onClearGradient(selectedImage.id)} title="Clear Gradient">
                <XIcon />
              </ToolButton>
            )}
            {isMaskTool && (
              <span className="mask-hint">
                {tool === 'mask-polygon'
                  ? 'Click to add points, double-click to finish'
                  : tool === 'mask-gradient'
                    ? 'Drag a line to fade from opaque to transparent'
                    : 'Click and drag to draw mask'}
              </span>
            )}
            <div className="toolbar-divider" />
          </div>

          {image && (
            <div className="toolbar-section">
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
          )}

          <div className="toolbar-section">
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

          {image && (
            <div className="toolbar-section">
              <ToolButton
                active={vignette?.enabled}
                onClick={toggleVignette}
                title={vignette?.enabled ? 'Disable Vignette' : 'Enable Vignette'}
              >
                <VignetteIcon />
              </ToolButton>
              {vignette?.enabled && (
                <>
                  <SliderField
                    label="Inner Radius"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={vignette.innerRadius}
                    display={`${Math.round(vignette.innerRadius * 100)}%`}
                    onChange={(value) => updateVignette({ innerRadius: value })}
                  />
                  <SliderField
                    label="Outer Radius"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={vignette.outerRadius}
                    display={`${Math.round(vignette.outerRadius * 100)}%`}
                    onChange={(value) => updateVignette({ outerRadius: value })}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className="toolbar-section toolbar-right">
        <ToolButton onClick={onExportJPEG} title="Export JPEG" className="export-btn">
          JPEG
        </ToolButton>
        <ToolButton onClick={onExportJSON} title="Export ICP JSON" className="export-btn">
          JSON
        </ToolButton>
        <ToolButton onClick={onExportHTML} title="Export HTML" className="export-btn">
          HTML
        </ToolButton>
      </div>
    </div>
  );
}
