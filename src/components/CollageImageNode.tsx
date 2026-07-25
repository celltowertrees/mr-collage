import { useRef, useEffect, useState } from 'react';
import { Image as KonvaImage, Transformer, Group, Shape } from 'react-konva';
import Konva from 'konva';
import { CollageImage, MaskData, Tool } from '../types';

interface Props {
  image: CollageImage;
  isSelected: boolean;
  tool: Tool;
  onSelect: () => void;
  onChange: (changes: Partial<CollageImage>) => void;
  onMove: (dx: number, dy: number) => void;
}

function tracePath(ctx: Konva.Context, mask: MaskData) {
  ctx.beginPath();
  switch (mask.type) {
    case 'circle':
      ctx.arc(mask.cx, mask.cy, mask.radius, 0, Math.PI * 2);
      break;
    case 'rect':
      ctx.rect(mask.x, mask.y, mask.width, mask.height);
      break;
    case 'polygon':
      if (mask.points.length < 3) return false;
      ctx.moveTo(mask.points[0].x, mask.points[0].y);
      for (let i = 1; i < mask.points.length; i++) {
        ctx.lineTo(mask.points[i].x, mask.points[i].y);
      }
      ctx.closePath();
      break;
  }
  return true;
}

function buildClipFunc(mask: MaskData) {
  return (ctx: Konva.Context) => {
    tracePath(ctx, mask);
  };
}

// Draws a solid, unclipped fill of the mask shape so its native canvas shadow
// (which must extend past the mask outline) isn't cut off by the image's own
// clip region. The masked image is drawn on top and exactly covers the fill,
// leaving only the shadow visible around the masked silhouette.
function buildMaskShadowSceneFunc(mask: MaskData) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    if (tracePath(ctx, mask) === false) return;
    ctx.fillStrokeShape(shape);
  };
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

  if (!img) return null;

  const isMaskTool = tool.startsWith('mask-');
  const isSelectable = tool === 'select' || isMaskTool;

  const shadow = image.shadow;
  const shadowActive = shadow?.enabled ?? false;

  const transform = {
    x: image.x,
    y: image.y,
    offsetX: image.width / 2,
    offsetY: image.height / 2,
    scaleX: image.scaleX,
    scaleY: image.scaleY,
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
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
          });
        }}
        clipFunc={image.mask ? buildClipFunc(image.mask) : undefined}
      >
        <KonvaImage
          ref={imageRef}
          image={img}
          width={image.width}
          height={image.height}
          opacity={image.opacity}
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
            isMaskTool
              ? [] // disable resizing while in mask drawing mode
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
