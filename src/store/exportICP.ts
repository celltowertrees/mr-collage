import { CollageObject } from '../types';

export interface ICPViewport {
  stagePosition: { x: number; y: number };
  stageScale: number;
}

// Lossless: every CollageObject field is written somewhere, so a file can be
// rebuilt into an identical collage. `size` stays the displayed size for
// readers that only care what's on screen; `baseSize` and `scale` carry the
// two halves separately because dividing them back apart isn't exact in
// floating point. Shadow and vignette are kept even while switched off so
// their settings survive.
export function exportToICP(objects: CollageObject[], viewport?: ICPViewport): object {
  return {
    "infinite-canvas": {
      version: "0.2",
      ...(viewport
        ? { viewport: { position: viewport.stagePosition, scale: viewport.stageScale } }
        : {}),
      nodes: objects.map((obj) => {
        const base = {
          id: obj.id,
          position: { x: obj.x, y: obj.y },
          size: {
            width: obj.width * obj.scaleX,
            height: obj.height * obj.scaleY,
          },
          baseSize: { width: obj.width, height: obj.height },
          scale: { x: obj.scaleX, y: obj.scaleY },
          rotation: obj.rotation,
          opacity: obj.opacity,
          zIndex: obj.zIndex,
        };

        const effects = {
          ...(obj.gradientMask ? { gradientMask: obj.gradientMask } : {}),
          ...(obj.shadow ? { shadow: obj.shadow } : {}),
          ...(obj.blendMode ? { blendMode: obj.blendMode } : {}),
          ...(obj.flipX ? { flipX: obj.flipX } : {}),
          ...(obj.flipY ? { flipY: obj.flipY } : {}),
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
              ...effects,
            },
          };
        }

        if (obj.kind === 'model3d') {
          return {
            ...base,
            type: "model3d",
            data: {
              name: obj.name,
              shape: obj.shape,
              rotation3D: obj.rotation3D,
              light: obj.light,
              material: obj.material,
              ...effects,
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
            ...(obj.vignette ? { vignette: obj.vignette } : {}),
            ...(obj.crop ? { crop: obj.crop } : {}),
            ...effects,
          },
        };
      }),
    },
  };
}
