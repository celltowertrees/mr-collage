import { useRef, useState, useEffect, useLayoutEffect } from 'react';
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
  const imageRef = useRef<Konva.Image>(null);
  const dragStartRef = useRef({ x: model.x, y: model.y });

  const { shape, rotation3D, light, material, width, height } = model;
  const gradientMask = model.gradientMask;

  // An uploaded texture has to be decoded before three can upload it, and that
  // is async — so it's loaded here, where a re-render can follow it, and the
  // renderer stays synchronous. A preset needs none of this.
  const textureSrc = material.texture?.source === 'image' ? material.texture.src : null;
  const [textureImage, setTextureImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!textureSrc) {
      setTextureImage(null);
      return;
    }
    let cancelled = false;
    const element = new window.Image();
    element.onload = () => { if (!cancelled) setTextureImage(element); };
    element.src = textureSrc;
    return () => { cancelled = true; };
  }, [textureSrc]);

  // Both canvases are owned by this node and redrawn in place. Allocating
  // fresh ones per frame is what made orbiting expensive — see the note in
  // renderModelToCanvas. The trade-off is that React can no longer notice the
  // bitmap changed by identity, so the repaint is driven by hand below.
  const renderRef = useRef<HTMLCanvasElement | null>(null);
  const fadeRef = useRef<HTMLCanvasElement | null>(null);
  const [surface, setSurface] = useState<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const rendered = renderModelToCanvas(
      { shape, rotation3D, light, material, textureImage },
      width,
      height,
      renderRef.current
    );
    renderRef.current = rendered;

    let next = rendered;
    if (rendered && gradientMask) {
      next = buildFadeMaskedCanvas(
        rendered,
        width,
        height,
        undefined,
        gradientMask,
        undefined,
        fadeRef.current
      );
      fadeRef.current = next;
    }

    if (next !== surface) {
      // First render, or the node switched between the plain and faded canvas
      // — a new element on the prop is enough for Konva to pick it up.
      setSurface(next);
    } else {
      // Same element, new pixels. Konva has no way to know, so say so.
      imageRef.current?.getLayer()?.batchDraw();
    }
    // `surface` is deliberately not a dependency: it's an output of this
    // effect, and including it would run the whole render a second time
    // for every change just to compare the result against itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, rotation3D, light, material, textureImage, width, height, gradientMask]);

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
      {surface ? (
        <KonvaImage
          ref={imageRef}
          image={surface}
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
