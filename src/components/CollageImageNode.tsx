import { useEffect, useMemo, memo } from 'react';
import { Image as KonvaImage, Group, Shape } from 'react-konva';
import { CollageImage } from '../types';
import { buildClipFunc, buildFadeMaskedCanvas, buildMaskShadowSceneFunc } from '../utils/nodeEffects';
import { useLoadedImage } from '../utils/imageCache';
import { useObjectNode, type ObjectNodeProps } from '../hooks/useObjectNode';

interface Props extends ObjectNodeProps {
  image: CollageImage;
  onNodeMount?: () => void;
}

export const CollageImageNode = memo(function CollageImageNode({ image, onNodeMount, ...nodeProps }: Props) {
  const img = useLoadedImage(image.src);
  const { groupProps, transform, shadow, shadowActive, shadowProps } = useObjectNode(image, nodeProps);

  // The Konva group only exists once the image has loaded (see the early
  // return below), so tell the parent when it's actually on the stage.
  const mounted = img !== null;
  useEffect(() => {
    if (mounted) onNodeMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const gradientMask = image.gradientMask;
  const vignette = image.vignette;
  const gradientSource = useMemo(() => {
    if (!img || (!gradientMask && !vignette?.enabled)) return null;
    return buildFadeMaskedCanvas(img, image.width, image.height, image.crop, gradientMask, vignette);
  }, [img, image.width, image.height, image.crop, gradientMask, vignette]);

  // Rebuilt only when the mask changes, rather than handing Konva a new
  // function (and so a changed attr and a redraw) on every render.
  const clipFunc = useMemo(() => (image.mask ? buildClipFunc(image.mask) : undefined), [image.mask]);
  const maskShadowSceneFunc = useMemo(
    () => (image.mask ? buildMaskShadowSceneFunc(image.mask) : undefined),
    [image.mask]
  );

  if (!img) return null;

  return (
    <>
      {shadowActive && image.mask && shadow && (
        // The id lets a per-object PNG export capture this sibling along with the image.
        <Group id={`${image.id}-mask-shadow`} {...transform} listening={false}>
          <Shape
            width={image.width}
            height={image.height}
            fill="black"
            sceneFunc={maskShadowSceneFunc}
            shadowEnabled
            {...shadowProps}
            perfectDrawEnabled={false}
          />
        </Group>
      )}
      <Group {...groupProps} clipFunc={clipFunc}>
        <KonvaImage
          image={gradientSource ?? img}
          width={image.width}
          height={image.height}
          crop={gradientSource ? undefined : image.crop}
          opacity={image.opacity}
          globalCompositeOperation={image.blendMode ?? 'source-over'}
          shadowEnabled={shadowActive && !image.mask}
          {...shadowProps}
        />
      </Group>
    </>
  );
});
