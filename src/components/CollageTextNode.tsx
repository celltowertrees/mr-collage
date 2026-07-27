import { useEffect, useMemo, useRef, useState } from 'react';
import { Text as KonvaText, Image as KonvaImage, Transformer, Group, Shape } from 'react-konva';
import Konva from 'konva';
import { CollageText, Tool } from '../types';
import { fontWeightFor, loadGoogleFontFace } from '../utils/googleFonts';
import { buildClipFunc, buildFadeMaskedCanvas, buildMaskShadowSceneFunc } from '../utils/nodeEffects';

interface Props {
  textObj: CollageText;
  isSelected: boolean;
  tool: Tool;
  onSelect: () => void;
  onChange: (changes: Partial<CollageText>) => void;
  onMove: (dx: number, dy: number) => void;
  onEditStart: () => void;
}

function fontStyleFor(bold: boolean, italic: boolean): string {
  if (bold && italic) return 'italic bold';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'normal';
}

export function CollageTextNode({ textObj, isSelected, tool, onSelect, onChange, onMove, onEditStart }: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const textRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const dragStartRef = useRef({ x: textObj.x, y: textObj.y });
  // Canvas 2D silently falls back to a system font until a picked Google Font
  // finishes downloading, so this flips once it's actually usable, forcing a
  // re-render (and re-measure/re-rasterize, below) with the real font in place.
  const [fontReady, setFontReady] = useState(false);

  const weight = fontWeightFor(textObj.bold);
  useEffect(() => {
    setFontReady(false);
    let cancelled = false;
    loadGoogleFontFace(textObj.fontFamily, weight, textObj.italic).then(() => {
      if (cancelled) return;
      setFontReady(true);
      // Konva only recomputes cached text metrics and requests a redraw when
      // an attribute actually *changes* (see Node.js's `_setAttr`, which
      // no-ops when the new value === the old one) — but fontFamily was
      // already set to this value the moment it was picked, well before the
      // download finished, so nothing here would otherwise redraw the
      // fallback-rendered glyphs or resize the box now that the real font is
      // ready. `_setTextData` is Konva's own (underscore-prefixed but public)
      // recompute routine; calling it directly is the standard workaround
      // for this exact "font finished loading after the fact" gap.
      const node = textRef.current;
      if (node) {
        node._setTextData();
        node.getLayer()?.batchDraw();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [textObj.fontFamily, weight, textObj.italic]);

  useEffect(() => {
    if (isSelected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  // Konva auto-sizes an unconstrained Text shape to its rendered content —
  // syncing that measured box back into the stored width/height keeps the
  // Transformer's box (offsetX/Y below) and the export's bounding box in sync
  // with the actual text, the same way images key off their own natural size.
  useEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const measuredWidth = node.width();
    const measuredHeight = node.height();
    if (
      measuredWidth > 0 &&
      measuredHeight > 0 &&
      (measuredWidth !== textObj.width || measuredHeight !== textObj.height)
    ) {
      onChange({ width: measuredWidth, height: measuredHeight });
    }
    // fontReady is a signal to re-measure once the real font has loaded, not
    // a value read inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textObj.text, textObj.fontSize, textObj.fontFamily, textObj.bold, textObj.italic, fontReady]);

  const gradientMask = textObj.gradientMask;
  const vignette = textObj.vignette;

  // Text has no separate "source pixels" the way an <img> does, so the
  // gradient fade/vignette instead rasterizes a standalone (off-tree) copy of
  // the Text shape into an offscreen canvas via Konva's own toCanvas() — using
  // a detached node rather than the live `textRef` one avoids any dependency
  // on this render's visible/hidden state, so it can't race the real node's
  // own prop updates. That raster is then faded exactly like an image's
  // pixels are (see buildFadeMaskedCanvas).
  const gradientSource = useMemo(() => {
    if (!gradientMask && !vignette?.enabled) return null;
    const temp = new Konva.Text({
      text: textObj.text || ' ',
      fontSize: textObj.fontSize,
      fontFamily: textObj.fontFamily,
      fontStyle: fontStyleFor(textObj.bold, textObj.italic),
      textDecoration: textObj.underline ? 'underline' : '',
      fill: textObj.color,
    });
    const rasterized = temp.toCanvas({ width: textObj.width, height: textObj.height, pixelRatio: 1 });
    temp.destroy();
    return buildFadeMaskedCanvas(rasterized, textObj.width, textObj.height, undefined, gradientMask, vignette);
    // fontReady triggers a re-rasterize once the real font (not a fallback)
    // is what actually gets drawn into the offscreen canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    textObj.text,
    textObj.fontSize,
    textObj.fontFamily,
    textObj.bold,
    textObj.italic,
    textObj.underline,
    textObj.color,
    textObj.width,
    textObj.height,
    gradientMask,
    vignette,
    fontReady,
  ]);

  const isMaskTool = tool.startsWith('mask-');
  const isSelectable = tool === 'select' || isMaskTool;

  const shadow = textObj.shadow;
  const shadowActive = shadow?.enabled ?? false;

  const flipX = textObj.flipX ? -1 : 1;
  const flipY = textObj.flipY ? -1 : 1;

  const transform = {
    x: textObj.x,
    y: textObj.y,
    offsetX: textObj.width / 2,
    offsetY: textObj.height / 2,
    scaleX: textObj.scaleX * flipX,
    scaleY: textObj.scaleY * flipY,
    rotation: textObj.rotation,
  };

  return (
    <>
      {shadowActive && textObj.mask && shadow && (
        <Group {...transform} listening={false}>
          <Shape
            width={textObj.width}
            height={textObj.height}
            fill="black"
            sceneFunc={buildMaskShadowSceneFunc(textObj.mask)}
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
        id={textObj.id}
        {...transform}
        draggable={tool === 'select'}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onEditStart}
        onDblTap={onEditStart}
        onDragStart={() => {
          dragStartRef.current = { x: textObj.x, y: textObj.y };
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
            // The rendered scale carries the flip sign baked in (see
            // `transform` above) — divide it back out so the stored scale
            // stays a plain magnitude, decoupled from flip state.
            scaleX: node.scaleX() * flipX,
            scaleY: node.scaleY() * flipY,
          });
        }}
        clipFunc={textObj.mask ? buildClipFunc(textObj.mask) : undefined}
      >
        <KonvaText
          ref={textRef}
          text={textObj.text || ' '}
          fontSize={textObj.fontSize}
          fontFamily={textObj.fontFamily}
          fontStyle={fontStyleFor(textObj.bold, textObj.italic)}
          textDecoration={textObj.underline ? 'underline' : ''}
          fill={textObj.color}
          visible={!gradientSource}
          opacity={textObj.opacity}
          globalCompositeOperation={textObj.blendMode ?? 'source-over'}
          shadowEnabled={!gradientSource && shadowActive && !textObj.mask}
          shadowColor={shadow?.color}
          shadowBlur={shadow?.blur}
          shadowOffsetX={shadow?.offsetX}
          shadowOffsetY={shadow?.offsetY}
          shadowOpacity={shadow?.opacity}
        />
        {gradientSource && (
          <KonvaImage
            image={gradientSource}
            width={textObj.width}
            height={textObj.height}
            opacity={textObj.opacity}
            globalCompositeOperation={textObj.blendMode ?? 'source-over'}
            shadowEnabled={shadowActive && !textObj.mask}
            shadowColor={shadow?.color}
            shadowBlur={shadow?.blur}
            shadowOffsetX={shadow?.offsetX}
            shadowOffsetY={shadow?.offsetY}
            shadowOpacity={shadow?.opacity}
          />
        )}
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
            // Unlike images, dragging a handle past the opposite edge here
            // just clamps rather than flipping — mirrored text reads as
            // garbage, so flipping text is only ever done deliberately via
            // the toolbar's explicit Flip buttons, never by accident via drag.
            if (newBox.width < 10 || newBox.height < 10) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
