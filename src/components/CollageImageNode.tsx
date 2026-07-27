import { useRef, useEffect, useState, useMemo } from 'react';
import { Image as KonvaImage, Transformer, Group, Shape } from 'react-konva';
import Konva from 'konva';
import { CollageImage, CropRect, GradientMask, MaskData, Tool, VignetteData } from '../types';

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

// Bakes the gradient fade and/or vignette directly into a copy of the
// image's pixels (Canvas 2D has no notion of a live CSS-style mask-image),
// so it composites the same way regardless of what other clipping (shape
// mask) sits on top of it. Applying both as sequential destination-in
// passes multiplies their alphas together, so the two fades combine rather
// than one replacing the other. Built at the image's own logical
// width/height — the same crop-aware box its mask/crop coordinates already
// live in — so the result can stand in for the raw <img> (with `crop`
// baked in) everywhere Konva would otherwise use it.
function buildFadeMaskedCanvas(
  img: HTMLImageElement,
  width: number,
  height: number,
  crop: CropRect | undefined,
  gradientMask: GradientMask | undefined,
  vignette: VignetteData | undefined
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (crop) {
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  } else {
    ctx.drawImage(img, 0, 0, width, height);
  }
  ctx.globalCompositeOperation = 'destination-in';

  if (gradientMask) {
    const gradient = ctx.createLinearGradient(
      gradientMask.start.x,
      gradientMask.start.y,
      gradientMask.end.x,
      gradientMask.end.y
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  if (vignette?.enabled) {
    // Scaling the context by the image's own half-width/half-height turns a
    // plain circular radial gradient into an ellipse fit to the image's
    // aspect ratio — innerRadius/outerRadius (fractions where 1.0 reaches an
    // edge midpoint) can then be used directly as the gradient's radii.
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(width / 2, height / 2);
    const radial = ctx.createRadialGradient(0, 0, vignette.innerRadius, 0, 0, vignette.outerRadius);
    radial.addColorStop(0, 'rgba(0, 0, 0, 1)');
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }

  return canvas;
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
