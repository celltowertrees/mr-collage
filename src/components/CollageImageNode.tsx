import { useRef, useEffect, useState, useMemo } from 'react';
import { Image as KonvaImage, Transformer, Group, Shape } from 'react-konva';
import Konva from 'konva';
import { CollageImage, Tool } from '../types';
import { buildClipFunc, buildFadeMaskedCanvas, buildMaskShadowSceneFunc } from '../utils/nodeEffects';

interface Props {
  image: CollageImage;
  isSelected: boolean;
  tool: Tool;
  onSelect: () => void;
  onChange: (changes: Partial<CollageImage>) => void;
  onMove: (dx: number, dy: number) => void;
}

export function CollageImageNode({ image, isSelected, tool, onSelect, onChange, onMove }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const imageRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const dragStartRef = useRef({ x: image.x, y: image.y });
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const element = new window.Image();
    element.src = image.src;
    element.onload = () => setImg(element);
  }, [image.src]);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const gradientMask = image.gradientMask;
  const vignette = image.vignette;
  const gradientSource = useMemo(() => {
    if (!img || (!gradientMask && !vignette?.enabled)) return null;
    return buildFadeMaskedCanvas(img, image.width, image.height, image.crop, gradientMask, vignette);
  }, [img, image.width, image.height, image.crop, gradientMask, vignette]);

  if (!img) return null;

  const isMaskTool = tool.startsWith('mask-');
  const isCropTool = tool === 'crop';
  const isSelectable = tool === 'select' || isMaskTool || isCropTool;

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
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={() => {
          dragStartRef.current = { x: image.x, y: image.y };
        }}
        onDragEnd={(e) => {
          onMove(e.target.x() - dragStartRef.current.x, e.target.y() - dragStartRef.current.y);
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            // The rendered scale carries the flip sign baked in (see `transform`
            // above) — divide it back out so the stored scale stays a plain
            // magnitude, decoupled from flip state.
            scaleX: node.scaleX() * flipX,
            scaleY: node.scaleY() * flipY,
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
      {isSelected && isSelectable && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          enabledAnchors={
            isMaskTool || isCropTool
              ? [] // disable resizing while in mask/crop drawing mode
              : [
                  'top-left',
                  'top-right',
                  'bottom-left',
                  'bottom-right',
                  'middle-left',
                  'middle-right',
                  'top-center',
                  'bottom-center',
                ]
          }
          boundBoxFunc={(oldBox, newBox) => {
            if (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}
