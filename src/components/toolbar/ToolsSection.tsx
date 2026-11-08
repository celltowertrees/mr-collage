import { CARD_SIZES, CardSizeId, PRIMITIVE_SHAPES, PrimitiveShape, SHAPE_LABELS, Tool } from '../../types';
import type { VisionDetail } from '../../utils/generateBackground';
import { loadModelRenderer } from '../../utils/loadModelRenderer';
import { features } from '../../featureFlags';
import {
  SelectIcon, PanIcon, TextToolIcon, UploadIcon, UndoIcon, RedoIcon, SparkleIcon, BgGenIcon, CubeIcon, CardIcon,
} from '../ToolbarIcons';
import { ToolButton } from './primitives';
import { usePopupMenu } from './usePopupMenu';

interface Props {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  visionDetail: VisionDetail;
  onVisionDetailChange: (detail: VisionDetail) => void;
  onUpload: () => void;
  onOpenStickerGenerator: () => void;
  onAddModel3D: (shape: PrimitiveShape) => void;
  onAddCard: (sizeId: CardSizeId) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// Always on screen: the tools, ways to add something, and undo/redo.
export function ToolsSection({
  tool,
  onToolChange,
  visionDetail,
  onVisionDetailChange,
  onUpload,
  onOpenStickerGenerator,
  onAddModel3D,
  onAddCard,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const shapeMenu = usePopupMenu();
  const cardMenu = usePopupMenu();

  return (
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
      {features.backgroundGeneration && (
        <ToolButton
          active={tool === 'bg-rect'}
          onClick={() => onToolChange(tool === 'bg-rect' ? 'select' : 'bg-rect')}
          title="Generate Background — draw a rectangle over the images to use as context"
        >
          <BgGenIcon />
        </ToolButton>
      )}
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
      {features.model3d && (
        <div className="blend-mode-field">
          <ToolButton
            ref={shapeMenu.buttonRef}
            onClick={() => {
              if (!shapeMenu.toggle()) return;
              // Fetch the renderer (three.js is lazy-loaded) and pay the WebGL
              // context + shader compile now, while the menu is open, instead
              // of inside the click that places the object.
              loadModelRenderer().then((renderer) => renderer.warmUpModelRenderer(), () => {});
            }}
            title="Add 3D Object"
            active={!!shapeMenu.pos}
          >
            <CubeIcon />
          </ToolButton>
          {shapeMenu.pos && (
            <div
              ref={shapeMenu.menuRef}
              className="blend-mode-popup shape-picker-popup"
              role="menu"
              style={{ top: shapeMenu.pos.top, left: shapeMenu.pos.left }}
            >
              {PRIMITIVE_SHAPES.map((shape) => (
                <button
                  key={shape}
                  role="menuitem"
                  className="blend-mode-option"
                  onClick={() => {
                    onAddModel3D(shape);
                    shapeMenu.close();
                  }}
                >
                  {SHAPE_LABELS[shape]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="blend-mode-field">
        <ToolButton
          ref={cardMenu.buttonRef}
          onClick={() => cardMenu.toggle()}
          title="Add Card"
          active={!!cardMenu.pos}
        >
          <CardIcon />
        </ToolButton>
        {cardMenu.pos && (
          <div
            ref={cardMenu.menuRef}
            className="blend-mode-popup"
            role="menu"
            style={{ top: cardMenu.pos.top, left: cardMenu.pos.left }}
          >
            {(Object.keys(CARD_SIZES) as CardSizeId[]).map((sizeId) => {
              const size = CARD_SIZES[sizeId];
              return (
                <button
                  key={sizeId}
                  role="menuitem"
                  className="blend-mode-option"
                  onClick={() => {
                    onAddCard(sizeId);
                    cardMenu.close();
                  }}
                >
                  {size.label} ({size.heightIn}×{size.widthIn} in)
                </button>
              );
            })}
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
  );
}
