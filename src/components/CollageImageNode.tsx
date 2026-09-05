import { useRef, useEffect, useState, useMemo } from 'react';
import { Image as KonvaImage, Group, Shape } from 'react-konva';
import Konva from 'konva';
import { CollageImage, Tool } from '../types';
import { buildClipFunc, buildFadeMaskedCanvas, buildMaskShadowSceneFunc } from '../utils/nodeEffects';

interface Props {
  image: CollageImage;
  isSelected: boolean;
  tool: Tool;
  onSelect: (addToSelection: boolean) => void;
  onChange: (changes: Partial<CollageImage>) => void;
  onMove: (dx: number, dy: number) => void;
  onGroupDragStart?: () => void;
}

export function CollageImageNode({ image, tool, onSelect, onChange, onMove, onGroupDragStart }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const dragStartRef = useRef({ x: image.x, y: image.y });
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const element = new window.Image();
    element.onload = () => { if (!cancelled) setImg(element); };
    element.src = image.src;
    return () => { cancelled = true; };
  }, [image.src]);

  const gradientMask = image.gradientMask;
  const vignette = image.vignette;
  const gradientSource = useMemo(() => {
    if (!img || (!gradientMask && !vignette?.enabled)) return null;
    return buildFadeMaskedCanvas(img, image.width, image.height, image.crop, gradientMask, vignette);
  }, [img, image.width, image.height, image.crop, gradientMask, vignette]);

  if (!img) return null;

  const shadow = image.shadow;
  const shadowActive = shadow?.enabled ?? false;

  const flipX = image.flipX ? -1 : 1;
  const flipY = image.flipY ? -1 : 1;

  const transform = {
    x: image.x,
    y: image.y,
    offsetX: image.width / 2,
    offsetY: image.height / 2,
    scaleX: image.scaleX * flipX,
    scaleY: image.scaleY * flipY,
    rotation: image.rotation,
  };

  return (
    <>
      {shadowActive && image.mask && shadow && (
        <Group {...transform} listening={false}>
          <Shape
            width={image.width}
            height={image.height}
            fill="black"
            sceneFunc={buildMaskShadowSceneFunc(image.mask)}
            shadowEnabled
            shadowColor={shadow.color}
            shadowBlur={shadow.blur}
            shadowOffsetX={shadow.offsetX}
            shadowOffsetY={shadow.offsetY}
            shadowOpacity={shadow.opacity}
            perfectDrawEnabled={false}
          />
        </Group>
      )}
      <Group
        ref={groupRef}
        id={image.id}
        {...transform}
        draggable={tool === 'select'}
        onClick={(e) => onSelect(e.evt.shiftKey)}
        onTap={() => onSelect(false)}
        onDragStart={() => {
          dragStartRef.current = { x: image.x, y: image.y };
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
            Math.abs(newScaleX - image.scaleX) < 0.001 &&
            Math.abs(newScaleY - image.scaleY) < 0.001 &&
            Math.abs(newRotation - image.rotation) < 0.001
          ) return;
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: newRotation,
            scaleX: newScaleX,
            scaleY: newScaleY,
          });
        }}
        clipFunc={image.mask ? buildClipFunc(image.mask) : undefined}
      >
        <KonvaImage
          ref={imageRef}
          image={gradientSource ?? img}
          width={image.width}
          height={image.height}
          crop={gradientSource ? undefined : image.crop}
          opacity={image.opacity}
          globalCompositeOperation={image.blendMode ?? 'source-over'}
          shadowEnabled={shadowActive && !image.mask}
          shadowColor={shadow?.color}
          shadowBlur={shadow?.blur}
          shadowOffsetX={shadow?.offsetX}
          shadowOffsetY={shadow?.offsetY}
          shadowOpacity={shadow?.opacity}
        />
      </Group>
    </>
  );
}
