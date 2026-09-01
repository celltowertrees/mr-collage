import { CollageObject } from '../types';

export function exportToICP(objects: CollageObject[]): object {
  return {
    "infinite-canvas": {
      version: "0.1",
      nodes: objects.map((obj) => {
        const base = {
          id: obj.id,
          position: { x: obj.x, y: obj.y },
          size: {
            width: obj.width * obj.scaleX,
            height: obj.height * obj.scaleY,
          },
          rotation: obj.rotation,
          opacity: obj.opacity,
          zIndex: obj.zIndex,
        };

        if (obj.kind === 'text') {
          return {
            ...base,
            type: "text",
            data: {
              text: obj.text,
              name: obj.name,
              fontFamily: obj.fontFamily,
              fontSize: obj.fontSize,
              bold: obj.bold,
              italic: obj.italic,
              underline: obj.underline,
              color: obj.color,
              ...(obj.gradientMask ? { gradientMask: obj.gradientMask } : {}),
              ...(obj.shadow?.enabled ? { shadow: obj.shadow } : {}),
              ...(obj.blendMode ? { blendMode: obj.blendMode } : {}),
              ...(obj.flipX ? { flipX: obj.flipX } : {}),
              ...(obj.flipY ? { flipY: obj.flipY } : {}),
            },
          };
        }

        return {
          ...base,
          type: "image",
          data: {
            src: obj.src,
            name: obj.name,
            ...(obj.mask ? { mask: obj.mask } : {}),
            ...(obj.gradientMask ? { gradientMask: obj.gradientMask } : {}),
            ...(obj.vignette?.enabled ? { vignette: obj.vignette } : {}),
            ...(obj.shadow?.enabled ? { shadow: obj.shadow } : {}),
            ...(obj.blendMode ? { blendMode: obj.blendMode } : {}),
            ...(obj.crop ? { crop: obj.crop } : {}),
            ...(obj.flipX ? { flipX: obj.flipX } : {}),
            ...(obj.flipY ? { flipY: obj.flipY } : {}),
          },
        };
      }),
    },
  };
}
