import { memo, useRef, useState, useLayoutEffect } from 'react';
import { Image as KonvaImage, Group, Rect } from 'react-konva';
import Konva from 'konva';
import { CollageModel3D } from '../types';
import { buildFadeMaskedCanvas } from '../utils/nodeEffects';
import { renderModelToCanvas } from '../utils/model3dRenderer';
import { useLoadedImage } from '../utils/imageCache';
import { useObjectNode, type ObjectNodeProps } from '../hooks/useObjectNode';

interface Props extends ObjectNodeProps {
  model: CollageModel3D;
}

export const CollageModel3DNode = memo(function CollageModel3DNode({ model, ...nodeProps }: Props) {
  const imageRef = useRef<Konva.Image>(null);
  const { groupProps, shadowActive, shadowProps } = useObjectNode(model, nodeProps);

  const { shape, rotation3D, light, material, width, height } = model;
  const gradientMask = model.gradientMask;

  // An uploaded texture has to be decoded before three can upload it, and that
  // is async — so it's loaded here, where a re-render can follow it, and the
  // renderer stays synchronous. A preset needs none of this.
  const textureSrc = material.texture?.source === 'image' ? material.texture.src : null;
  const textureImage = useLoadedImage(textureSrc);

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

  return (
    <Group {...groupProps}>
      {surface ? (
        <KonvaImage
          ref={imageRef}
          image={surface}
          width={model.width}
          height={model.height}
          opacity={model.opacity}
          globalCompositeOperation={model.blendMode ?? 'source-over'}
          shadowEnabled={shadowActive}
          {...shadowProps}
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
});
