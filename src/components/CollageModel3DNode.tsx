import { useRef, useMemo } from 'react';
import { Image as KonvaImage, Group, Rect } from 'react-konva';
import Konva from 'konva';
import { CollageModel3D, Tool } from '../types';
import { buildFadeMaskedCanvas } from '../utils/nodeEffects';
import { renderModelToCanvas } from '../utils/model3dRenderer';

interface Props {
  model: CollageModel3D;
  isSelected: boolean;
  tool: Tool;
  onSelect: (addToSelection: boolean) => void;
  onChange: (changes: Partial<CollageModel3D>) => void;
  onMove: (dx: number, dy: number) => void;
  onGroupDragStart?: () => void;
}

export function CollageModel3DNode({ model, tool, onSelect, onChange, onMove, onGroupDragStart }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const dragStartRef = useRef({ x: model.x, y: model.y });

  const { shape, rotation3D, light, material, width, height } = model;

  // Re-rendering produces a *new* canvas element every time, which is what
  // tells React (and through it Konva) that the KonvaImage's bitmap changed.
  // Unlike an image node there's nothing async here, so no onNodeMount signal
  // is needed — the group is on the stage from the first render.
  const rendered = useMemo(
    () => renderModelToCanvas({ shape, rotation3D, light, material }, width, height),
    [shape, rotation3D, light, material, width, height]
  );

  // Gradient fade rides on exactly the same helper images and text use — the
  // rendered 3D frame is just another CanvasImageSource to fade.
  const gradientMask = model.gradientMask;
  const source = useMemo(() => {
    if (!rendered || !gradientMask) return rendered;
    return buildFadeMaskedCanvas(rendered, width, height, undefined, gradientMask, undefined);
  }, [rendered, gradientMask, width, height]);

  const shadow = model.shadow;
  const shadowActive = shadow?.enabled ?? false;

  const flipX = model.flipX ? -1 : 1;
  const flipY = model.flipY ? -1 : 1;

  const transform = {
    x: model.x,
    y: model.y,
    offsetX: model.width / 2,
    offsetY: model.height / 2,
    scaleX: model.scaleX * flipX,
    scaleY: model.scaleY * flipY,
    rotation: model.rotation,
  };

  return (
    <Group
      ref={groupRef}
      id={model.id}
      {...transform}
      draggable={tool === 'select'}
      onClick={(e) => onSelect(e.evt.shiftKey)}
      onTap={() => onSelect(false)}
      onDragStart={() => {
        dragStartRef.current = { x: model.x, y: model.y };
        onGroupDragStart?.();
      }}
      onDragEnd={(e) => {
        onMove(e.target.x() - dragStartRef.current.x, e.target.y() - dragStartRef.current.y);
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const newScaleX = node.scaleX() * flipX;
        const newScaleY = node.scaleY() * flipY;
        const newRotation = node.rotation();
        // Konva fires transformend on position changes too (drag), not only
        // resize/rotate. Skip it when only position changed — onDragEnd
        // already handles that via onMove.
        if (
          Math.abs(newScaleX - model.scaleX) < 0.001 &&
          Math.abs(newScaleY - model.scaleY) < 0.001 &&
          Math.abs(newRotation - model.rotation) < 0.001
        ) return;
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: newRotation,
          scaleX: newScaleX,
          scaleY: newScaleY,
        });
      }}
    >
      {source ? (
        <KonvaImage
          image={source}
          width={model.width}
          height={model.height}
          opacity={model.opacity}
          globalCompositeOperation={model.blendMode ?? 'source-over'}
          shadowEnabled={shadowActive}
          shadowColor={shadow?.color}
          shadowBlur={shadow?.blur}
          shadowOffsetX={shadow?.offsetX}
          shadowOffsetY={shadow?.offsetY}
          shadowOpacity={shadow?.opacity}
        />
      ) : (
        // WebGL isn't available (disabled, or the context was lost). Draw an
        // outline so the object stays visible, selectable, movable and
        // deletable rather than silently vanishing from the canvas.
        <Rect
          width={model.width}
          height={model.height}
          fill="rgba(0, 0, 0, 0.04)"
          stroke="#888888"
          strokeWidth={2}
          dash={[8, 6]}
          opacity={model.opacity}
        />
      )}
    </Group>
  );
}
