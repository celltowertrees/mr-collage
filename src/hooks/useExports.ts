import { useCallback } from 'react';
import Konva from 'konva';
import { exportToICP, exportToStaticHTML } from '../store';
import { loadModelRenderer } from '../utils/loadModelRenderer';
import { downloadBlob, downloadURL } from '../utils/download';
import { CARD_EXPORT_SCALE, cardExportSize, cardPaperId, cardRect, cardSizeSlug } from '../utils/card';
import { setPngDpi } from '../utils/pngDpi';
import { CARD_EXPORT_DPI, CollageCard, CollageImage, CollageModel3D, CollageObject } from '../types';

interface Options {
  stageRef: React.RefObject<Konva.Stage | null>;
  images: CollageObject[];
  selectedIds: string[];
  stagePosition: { x: number; y: number };
  stageScale: number;
}

// Every way the collage leaves the app: a JPEG of the whole thing, a PNG per
// selected object, a print-ready PNG per card, ICP JSON, and a self-contained
// static HTML page.
export function useExports({ stageRef, images, selectedIds, stagePosition, stageScale }: Options) {
  const handleExportJPEG = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || images.length === 0) return;

    const layer = stage.findOne<Konva.Layer>('.content')!;
    // No `relativeTo`: getClientRect() defaults to absolute/screen coordinates,
    // which is the same space stage.toDataURL()'s x/y/width/height expect
    // (they include the stage's current pan and zoom). Passing `relativeTo: stage`
    // stripped that transform out, so the crop region didn't match the content.
    const rect = layer.getClientRect();

    const padding = 40;
    const pixelRatio = 2;
    // Selection handles and card guides live on the other layers.
    const otherLayers = stage.getLayers().filter((l) => l !== layer);
    const layersWereVisible = otherLayers.map((l) => l.visible());
    otherLayers.forEach((l) => l.visible(false));
    let dataUrl: string;
    try {
      dataUrl = stage.toDataURL({
        x: rect.x - padding,
        y: rect.y - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        pixelRatio,
        mimeType: 'image/png',
      });
    } finally {
      otherLayers.forEach((l, i) => l.visible(layersWereVisible[i]));
    }

    // JPEG has no alpha channel, so transparent canvas pixels would otherwise
    // composite to black. Draw the PNG capture over a white background first.
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      downloadURL(canvas.toDataURL('image/jpeg', 0.95), 'collage.jpg');
    };
    img.src = dataUrl;
  }, [images, stageRef]);

  // One PNG per selected object, each holding just that object (with its
  // effects) on a transparent background. Every other layer child — other
  // objects, the Transformer, previews — is hidden for the capture and put
  // back before the next frame draws, so the canvas never flickers.
  const handleExportPNGs = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || selectedIds.length === 0) return;

    const layer = stage.findOne<Konva.Layer>('.content')!;
    const children = layer.getChildren();
    const wasVisible = children.map((child) => child.visible());
    // The Transformer and previews sit on their own layers; none belong in an
    // object's PNG.
    const otherLayers = stage.getLayers().filter((l) => l !== layer);
    const layersWereVisible = otherLayers.map((l) => l.visible());
    // 2x the object's own canvas size, whatever the current zoom.
    const pixelRatio = 2 / stage.scaleX();
    // Stacking order, so the numbering matches what's on screen bottom-up.
    // A card isn't an object to cut out; it has its own export.
    const targets = images.filter((obj) => obj.kind !== 'card' && selectedIds.includes(obj.id));

    const captures: { name: string; canvas: HTMLCanvasElement }[] = [];
    try {
      targets.forEach((obj, i) => {
        // A masked image's shadow is drawn by a sibling node; take it along.
        const parts = [stage.findOne(`#${obj.id}`), stage.findOne(`#${obj.id}-mask-shadow`)].filter(
          (node): node is Konva.Node => !!node
        );
        if (parts.length === 0) return;
        children.forEach((child) => child.visible(parts.includes(child)));
        otherLayers.forEach((l) => l.visible(false));

        const rects = parts.map((node) => node.getClientRect());
        const x = Math.min(...rects.map((r) => r.x));
        const y = Math.min(...rects.map((r) => r.y));
        const width = Math.max(...rects.map((r) => r.x + r.width)) - x;
        const height = Math.max(...rects.map((r) => r.y + r.height)) - y;
        captures.push({
          name: `collage-${i + 1}-${obj.kind}.png`,
          canvas: stage.toCanvas({ x, y, width, height, pixelRatio }),
        });
      });
    } finally {
      children.forEach((child, i) => child.visible(wasVisible[i]));
      otherLayers.forEach((l, i) => l.visible(layersWereVisible[i]));
    }

    for (const { name, canvas } of captures) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) continue;
      downloadBlob(blob, name);
      // Browsers can drop downloads fired in the same tick as each other.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, [images, selectedIds, stageRef]);

  // A print-ready PNG per card (all of them, or just `ids`): whatever falls
  // inside the frame, at 300dpi and the card's exact physical size, tagged so
  // print software reads it that way. Captured the same way as the PNG export
  // — guides, handles and every other card's paper hidden for the moment of
  // the capture — but at a pixel ratio that undoes the current zoom.
  const handleExportCards = useCallback(async (ids?: string[]) => {
    const stage = stageRef.current;
    if (!stage) return;
    const allCards = images.filter((obj): obj is CollageCard => obj.kind === 'card');
    const targets = ids ? allCards.filter((card) => ids.includes(card.id)) : allCards;
    if (targets.length === 0) return;

    const layer = stage.findOne<Konva.Layer>('.content')!;
    const papers = layer.find('.card-paper');
    const otherLayers = stage.getLayers().filter((l) => l !== layer);
    const layersWereVisible = otherLayers.map((l) => l.visible());
    const scale = stage.scaleX();

    const captures: { name: string; canvas: HTMLCanvasElement }[] = [];
    try {
      otherLayers.forEach((l) => l.visible(false));
      for (const card of targets) {
        papers.forEach((paper) => paper.visible(paper.id() === cardPaperId(card.id)));
        const rect = cardRect(card);
        // Card-local → content → screen, the space toCanvas' region is in.
        const topLeft = stage.getAbsoluteTransform().point({
          x: card.x - card.width / 2 + rect.x,
          y: card.y - card.height / 2 + rect.y,
        });
        const raw = stage.toCanvas({
          x: topLeft.x,
          y: topLeft.y,
          width: rect.width * scale,
          height: rect.height * scale,
          pixelRatio: CARD_EXPORT_SCALE / scale,
        });
        // toCanvas can land a pixel off the exact size after rounding; a print
        // file needs the exact size, on white rather than transparent.
        const size = cardExportSize(card);
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.drawImage(raw, 0, 0, size.width, size.height);
        captures.push({ name: `card-${allCards.indexOf(card) + 1}-${cardSizeSlug(card)}.png`, canvas });
      }
    } finally {
      papers.forEach((paper) => paper.visible(true));
      otherLayers.forEach((l, i) => l.visible(layersWereVisible[i]));
    }

    for (const { name, canvas } of captures) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) continue;
      const tagged = setPngDpi(new Uint8Array(await blob.arrayBuffer()), CARD_EXPORT_DPI);
      downloadBlob(new Blob([tagged], { type: 'image/png' }), name);
      // Browsers can drop downloads fired in the same tick as each other.
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, [images, stageRef]);

  const handleExportJSON = useCallback(() => {
    const data = exportToICP(images, { stagePosition, stageScale });
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'collage-icp.json');
  }, [images, stagePosition, stageScale]);

  const handleExportHTML = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || images.length === 0) return;

    // Only cropped images need their natural (pre-crop) pixel size to scale
    // the <img> element up so the cropped region fills its display box.
    const naturalSizes: Record<string, { width: number; height: number }> = {};
    const croppedImages = images.filter((obj): obj is CollageImage => obj.kind === 'image' && !!obj.crop);
    await Promise.all(
      croppedImages.map(
        (img) =>
          new Promise<void>((resolve) => {
            const el = new window.Image();
            el.onload = () => {
              naturalSizes[img.id] = { width: el.naturalWidth, height: el.naturalHeight };
              resolve();
            };
            el.src = img.src;
          })
      )
    );

    // A static file can't carry the live WebGL renderer, so each 3D object is
    // rendered once here and embedded as a PNG — the same pre-pass shape as
    // naturalSizes above.
    const models = images.filter((obj): obj is CollageModel3D => obj.kind === 'model3d');

    // An uploaded texture has to be decoded before it can be baked in, and the
    // live node's copy isn't reachable from here — so load them up front, the
    // same pre-pass shape as naturalSizes above. A texture that won't decode
    // just bakes the object untextured rather than failing the export.
    const textureImages = new Map<string, HTMLImageElement>();
    await Promise.all(
      models
        .filter((model) => model.material.texture?.source === 'image')
        .map(
          (model) =>
            new Promise<void>((resolve) => {
              const el = new window.Image();
              el.onload = () => {
                textureImages.set(model.id, el);
                resolve();
              };
              el.onerror = () => resolve();
              el.src = (model.material.texture as { src: string }).src;
            })
        )
    );

    const modelSnapshots: Record<string, string> = {};
    const renderModelToDataURL = models.length > 0 ? (await loadModelRenderer()).renderModelToDataURL : null;
    for (const model of models) {
      if (!renderModelToDataURL) break;
      const snapshot = renderModelToDataURL(
        {
          shape: model.shape,
          rotation3D: model.rotation3D,
          light: model.light,
          material: model.material,
          textureImage: textureImages.get(model.id) ?? null,
        },
        model.width,
        model.height
      );
      if (snapshot) modelSnapshots[model.id] = snapshot;
    }

    const html = await exportToStaticHTML(
      images,
      { x: stagePosition.x, y: stagePosition.y, scale: stageScale, width: stage.width(), height: stage.height() },
      naturalSizes,
      modelSnapshots
    );

    downloadBlob(new Blob([html], { type: 'text/html' }), 'collage.html');
  }, [images, stagePosition, stageScale, stageRef]);

  return { handleExportJPEG, handleExportPNGs, handleExportCards, handleExportJSON, handleExportHTML };
}
