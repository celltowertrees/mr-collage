import { CollageObject, Tool } from '../../types';
import { CircleMaskIcon, RectMaskIcon, PolygonMaskIcon, GradientMaskIcon, XIcon, CropIcon, CheckIcon } from '../ToolbarIcons';
import { ToolButton } from './primitives';

interface MaskProps {
  obj: CollageObject;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onClearMask: (id: string) => void;
  onClearGradient: (id: string) => void;
}

// Shape masks (images only) and the gradient fade (every kind).
export function MaskSection({ obj, tool, onToolChange, onClearMask, onClearGradient }: MaskProps) {
  const image = obj.kind === 'image' ? obj : null;
  const isMaskTool = tool.startsWith('mask-');
  const toggleTool = (t: Tool) => onToolChange(tool === t ? 'select' : t);

  return (
    <div className="toolbar-section">
      <div className="toolbar-divider" />
      {image && (
        <>
          <ToolButton active={tool === 'mask-circle'} onClick={() => toggleTool('mask-circle')} title="Circle Mask">
            <CircleMaskIcon />
          </ToolButton>
          <ToolButton active={tool === 'mask-rect'} onClick={() => toggleTool('mask-rect')} title="Rectangle Mask">
            <RectMaskIcon />
          </ToolButton>
          <ToolButton
            active={tool === 'mask-polygon'}
            onClick={() => toggleTool('mask-polygon')}
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
      <ToolButton active={tool === 'mask-gradient'} onClick={() => toggleTool('mask-gradient')} title="Gradient Fade">
        <GradientMaskIcon />
      </ToolButton>
      {obj.gradientMask && (
        <ToolButton danger onClick={() => onClearGradient(obj.id)} title="Clear Gradient">
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
  );
}

interface CropProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  hasPendingCrop: boolean;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
}

export function CropSection({ tool, onToolChange, hasPendingCrop, onApplyCrop, onCancelCrop }: CropProps) {
  return (
    <div className="toolbar-section">
      <ToolButton active={tool === 'crop'} onClick={() => onToolChange(tool === 'crop' ? 'select' : 'crop')} title="Crop">
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
  );
}
