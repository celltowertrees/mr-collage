import Konva from 'konva';

// The shape every pointer-driven canvas tool exposes — mask, gradient, crop,
// background rectangle, 3D orbit, and plain marquee selection. Canvas picks
// the active tool's handlers once and wires them straight to the stage,
// rather than re-asking "which tool is this?" in every mouse handler.
export interface PointerToolHandlers {
  handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  handleMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  handleMouseUp: () => void;
}
