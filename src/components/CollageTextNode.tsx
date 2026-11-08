import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Image as KonvaImage, Shape, Group } from 'react-konva';
import Konva from 'konva';
import { CollageText } from '../types';
import { fontWeightFor, loadGoogleFontFace } from '../utils/googleFonts';
import { buildFadeMaskedCanvas } from '../utils/nodeEffects';
import { CARD_EXPORT_SCALE } from '../utils/card';
import {
  bakeTextResize,
  canvasMeasure,
  clearMeasureCache,
  drawWordArt,
  layoutWordArt,
  rasterizeWordArt,
  type WordArtLayout,
} from '../utils/wordArt';
import { useObjectNode, type ObjectNodeProps } from '../hooks/useObjectNode';

interface Props extends ObjectNodeProps {
  textObj: CollageText;
  onEditStart: (id: string, caretIndex?: number) => void;
  onLayout?: (id: string, layout: WordArtLayout) => void;
  // True while this text is being typed into: clicks place the caret and
  // drags select letters instead of moving the object.
  editing?: boolean;
  onEditPointer?: (index: number, extend: boolean) => void;
}

// The largest bitmap side a text is rasterized to, however far in the canvas
// is zoomed: past this the text is huge on screen anyway.
const MAX_RASTER_SIDE = 4096;

// Every text object is drawn by the WordArt renderer. The letters, extrusion
// and outline are painted into a private bitmap at the pixel density the
// canvas is currently drawn at, then placed with a single drawImage — so
// Konva's shadow, opacity and blend mode apply once to the finished text
// rather than to each overlapping layer, and it stays crisp at any zoom or
// export scale.
export const CollageTextNode = memo(function CollageTextNode({
  textObj,
  onEditStart,
  onLayout,
  editing = false,
  onEditPointer,
  ...nodeProps
}: Props) {
  const { onChange } = nodeProps;
  const { groupRef, groupProps, shadowActive, shadowProps } = useObjectNode(textObj, nodeProps);
  // A picked Google Font draws in a fallback until it has downloaded; this
  // flips once it's usable so the layout is measured again with real widths.
  const [fontReady, setFontReady] = useState(0);
  const weight = fontWeightFor(textObj.bold);
  useEffect(() => {
    let cancelled = false;
    loadGoogleFontFace(textObj.fontFamily, weight, textObj.italic).then(() => {
      if (cancelled) return;
      clearMeasureCache(textObj.fontFamily);
      setFontReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [textObj.fontFamily, weight, textObj.italic]);

  const layout = useMemo(
    () => layoutWordArt(textObj, canvasMeasure),
    // fontReady is a signal to re-measure, not a value read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      textObj.text,
      textObj.fontFamily,
      textObj.fontSize,
      textObj.bold,
      textObj.italic,
      textObj.underline,
      textObj.color,
      textObj.align,
      textObj.letterSpacing,
      textObj.lineHeight,
      textObj.gradient,
      textObj.outline,
      textObj.extrusion,
      textObj.warp,
      fontReady,
    ]
  );

  useEffect(() => {
    onLayout?.(textObj.id, layout);
  }, [onLayout, textObj.id, layout]);

  // The box hugs whatever the renderer drew. When it grows or shrinks (as
  // you type, or restyle) its top-left stays put — or its top-right for
  // right-aligned text, top-centre for centred — so letters already typed
  // don't slide about. A derived sync, so it amends the current undo step.
  useEffect(() => {
    const { width, height } = layout.bounds;
    const dw = width - textObj.width;
    const dh = height - textObj.height;
    if (Math.abs(dw) < 0.01 && Math.abs(dh) < 0.01) return;
    let x = textObj.x;
    let y = textObj.y;
    const anchor = textObj.align === 'center' ? 0 : textObj.align === 'right' ? -1 : 1;
    if (textObj.width === 0 && textObj.height === 0) {
      // A brand-new object: the click that placed it marks where the text
      // starts (its left edge, for left-aligned text), centred vertically.
      x += (width / 2) * anchor;
    } else {
      const lx = (dw / 2) * anchor * textObj.scaleX * (textObj.flipX ? -1 : 1);
      const ly = (dh / 2) * textObj.scaleY * (textObj.flipY ? -1 : 1);
      const rad = (textObj.rotation * Math.PI) / 180;
      x += lx * Math.cos(rad) - ly * Math.sin(rad);
      y += lx * Math.sin(rad) + ly * Math.cos(rad);
    }
    onChange(textObj.id, { width, height, x, y }, { amend: true });
    // Only a new layout should trigger a re-sync, not the move it causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const raster = useRef<{ layout: WordArtLayout; scale: number; canvas: HTMLCanvasElement } | null>(null);
  const sceneFunc = (context: Konva.Context, shape: Konva.Shape) => {
    const native = (context as unknown as { _context: CanvasRenderingContext2D })._context;
    const m = native.getTransform();
    const { width, height } = layout.bounds;
    let scale = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d), 0.01);
    scale = Math.min(scale, MAX_RASTER_SIDE / Math.max(width, height, 1));
    // Snap so a smooth zoom doesn't re-rasterize on every frame.
    scale = Math.ceil(scale * 4) / 4;
    let cached = raster.current;
    if (!cached || cached.layout !== layout || cached.scale !== scale) {
      const canvas = cached?.canvas ?? document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(width * scale));
      canvas.height = Math.max(1, Math.ceil(height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        drawWordArt(ctx, textObj, layout);
      }
      cached = { layout, scale, canvas };
      raster.current = cached;
    }
    context.drawImage(cached.canvas, 0, 0, width, height);
    void shape;
  };
  const hitFunc = (context: Konva.Context, shape: Konva.Shape) => {
    context.beginPath();
    context.rect(0, 0, layout.bounds.width, layout.bounds.height);
    context.closePath();
    context.fillStrokeShape(shape);
  };

  const gradientMask = textObj.gradientMask;
  // The gradient fade works on pixels, so the text is rasterized at print
  // resolution and faded like an image (see buildFadeMaskedCanvas).
  const gradientSource = useMemo(() => {
    if (!gradientMask) return null;
    const ratio = CARD_EXPORT_SCALE;
    const rasterized = rasterizeWordArt(textObj, ratio);
    if (!rasterized) return null;
    return buildFadeMaskedCanvas(
      rasterized,
      rasterized.width,
      rasterized.height,
      undefined,
      {
        start: { x: gradientMask.start.x * ratio, y: gradientMask.start.y * ratio },
        end: { x: gradientMask.end.x * ratio, y: gradientMask.end.y * ratio },
      },
      undefined
    );
    // The layout captures every style field the raster depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, gradientMask]);

  // A corner drag scales the node; on release the scale is folded into the
  // font size, so the text re-renders crisp at its new size and the Size
  // control matches what's on screen.
  const onTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;
    const flipX = textObj.flipX ? -1 : 1;
    const flipY = textObj.flipY ? -1 : 1;
    const newScaleX = node.scaleX() * flipX;
    const newScaleY = node.scaleY() * flipY;
    if (Math.abs(newScaleX - textObj.scaleX) < 0.001 && Math.abs(newScaleY - textObj.scaleY) < 0.001) {
      groupProps.onTransformEnd();
      return;
    }
    const changes = bakeTextResize(textObj, newScaleX, newScaleY);
    // react-konva only pushes props that changed since the last render; the
    // scale prop was already 1, so it has to be put back by hand.
    node.scaleX((changes.scaleX ?? 1) * flipX);
    node.scaleY((changes.scaleY ?? 1) * flipY);
    onChange(textObj.id, { ...changes, x: node.x(), y: node.y(), rotation: node.rotation() });
  };

  // The caret index under the pointer, from the same layout the letters use.
  const indexUnderPointer = (): number | null => {
    const group = groupRef.current;
    const pointer = group?.getStage()?.getPointerPosition();
    if (!group || !pointer) return null;
    return layout.indexAt(group.getAbsoluteTransform().copy().invert().point(pointer));
  };

  const startEditingAt = () => {
    if (editing) return;
    onEditStart(textObj.id, indexUnderPointer() ?? undefined);
  };

  const selecting = useRef(false);
  useEffect(() => {
    if (!editing) return;
    const stop = () => {
      selecting.current = false;
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, [editing]);

  const editPointerProps = editing
    ? {
        draggable: false,
        onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
          // Keeps focus in the editor (no blur, so editing carries on) and
          // keeps the stage from starting a marquee.
          e.evt.preventDefault();
          e.cancelBubble = true;
          const index = indexUnderPointer();
          if (index === null) return;
          selecting.current = true;
          onEditPointer?.(index, e.evt.shiftKey);
        },
        onMouseMove: () => {
          if (!selecting.current) return;
          const index = indexUnderPointer();
          if (index !== null) onEditPointer?.(index, true);
        },
      }
    : {};

  const { width, height } = layout.bounds;
  return (
    <Group
      {...groupProps}
      {...editPointerProps}
      onTransformEnd={onTransformEnd}
      onDblClick={startEditingAt}
      onDblTap={startEditingAt}
    >
      <Shape
        name="wordart"
        // Never painted (sceneFunc draws the text itself); it only marks the
        // shape as filled so its hit region registers.
        fill="black"
        width={width}
        height={height}
        sceneFunc={sceneFunc}
        hitFunc={hitFunc}
        visible={!gradientSource}
        opacity={textObj.opacity}
        globalCompositeOperation={textObj.blendMode ?? 'source-over'}
        shadowEnabled={!gradientSource && shadowActive}
        {...shadowProps}
      />
      {gradientSource && (
        <KonvaImage
          name="wordart-faded"
          image={gradientSource}
          width={width}
          height={height}
          opacity={textObj.opacity}
          globalCompositeOperation={textObj.blendMode ?? 'source-over'}
          shadowEnabled={shadowActive}
          {...shadowProps}
        />
      )}
    </Group>
  );
});
