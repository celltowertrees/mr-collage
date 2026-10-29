import { useRef } from 'react';
import Konva from 'konva';
import { BaseObject, ObjectChanges, Tool } from '../types';

// The callbacks every object node is handed. They all take the object's id
// rather than being closed over it, so Canvas can create them ONCE and pass
// the same functions to every node — which is what lets React.memo skip the
// nodes whose own object didn't change. Building a fresh closure per node per
// render (as Canvas used to) re-rendered every object on every state change:
// one slider tick on one image re-reconciled the whole collage.
export interface ObjectNodeHandlers {
  onSelect: (id: string, addToSelection: boolean) => void;
  onChange: (id: string, changes: ObjectChanges, options?: { coalesce?: boolean; amend?: boolean }) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onDragStart: (id: string) => void;
}

export interface ObjectNodeProps extends ObjectNodeHandlers {
  tool: Tool;
}

// What the image, text and 3D nodes all do the same way: the flip-aware
// transform, click/drag selection, the group-drag delta, and committing a
// resize/rotate from the Transformer. Each node spreads `groupProps` onto its
// outer <Group> and keeps only its own content rendering.
export function useObjectNode(obj: BaseObject, { tool, onSelect, onChange, onMove, onDragStart }: ObjectNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const dragStartRef = useRef({ x: obj.x, y: obj.y });

  const flipX = obj.flipX ? -1 : 1;
  const flipY = obj.flipY ? -1 : 1;

  const transform = {
    x: obj.x,
    y: obj.y,
    offsetX: obj.width / 2,
    offsetY: obj.height / 2,
    scaleX: obj.scaleX * flipX,
    scaleY: obj.scaleY * flipY,
    rotation: obj.rotation,
  };

  const groupProps = {
    ref: groupRef,
    id: obj.id,
    ...transform,
    draggable: tool === 'select',
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => onSelect(obj.id, e.evt.shiftKey),
    onTap: () => onSelect(obj.id, false),
    onDragStart: () => {
      dragStartRef.current = { x: obj.x, y: obj.y };
      onDragStart(obj.id);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onMove(obj.id, e.target.x() - dragStartRef.current.x, e.target.y() - dragStartRef.current.y);
    },
    onTransformEnd: () => {
      const node = groupRef.current;
      if (!node) return;
      const newScaleX = node.scaleX() * flipX;
      const newScaleY = node.scaleY() * flipY;
      const newRotation = node.rotation();
      // Konva fires transformend on position changes too (drag), not only
      // resize/rotate. Skip it when only position changed — onDragEnd
      // already handles that via onMove.
      if (
        Math.abs(newScaleX - obj.scaleX) < 0.001 &&
        Math.abs(newScaleY - obj.scaleY) < 0.001 &&
        Math.abs(newRotation - obj.rotation) < 0.001
      ) return;
      onChange(obj.id, {
        x: node.x(),
        y: node.y(),
        rotation: newRotation,
        scaleX: newScaleX,
        scaleY: newScaleY,
      });
    },
  };

  const shadow = obj.shadow;
  const shadowActive = shadow?.enabled ?? false;
  // Spread onto whichever Konva shape casts the shadow; `shadowEnabled` is
  // left to the caller since each kind has its own rule for when it applies.
  const shadowProps = {
    shadowColor: shadow?.color,
    shadowBlur: shadow?.blur,
    shadowOffsetX: shadow?.offsetX,
    shadowOffsetY: shadow?.offsetY,
    shadowOpacity: shadow?.opacity,
  };

  return { groupRef, groupProps, transform, shadow, shadowActive, shadowProps };
}
