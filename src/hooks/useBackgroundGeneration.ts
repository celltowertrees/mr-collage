import { useCallback, useRef, useState } from 'react';
import Konva from 'konva';
import {
  AI_BACKGROUND_NAME,
  analyzeImages,
  paintBackgroundAround,
  type VisionDetail,
  type BgProgressEvent,
} from '../utils/generateBackground';
import { fitBackgroundFrame, subjectMask, type BackgroundFrame } from '../utils/backgroundFrame';
import { useBgRectDrawer, type BgRect } from './useBgRectDrawer';
import { CollageImage, CollageObject, Tool } from '../types';

const API_KEY_STORAGE_KEY = 'mr-collage-openai-key';
const VISION_DETAIL_STORAGE_KEY = 'mr-collage-vision-detail';

interface Options {
  images: CollageObject[];
  tool: Tool;
  setTool: (tool: Tool) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  addBackground: (
    src: string,
    name: string,
    naturalWidth: number,
    naturalHeight: number,
    rect: BgRect,
    belowZIndex: number
  ) => void;
}

// Objects filling more of the frame than this leave no canvas worth painting.
const MAX_COVERED = 0.97;

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the canvas capture.'))), type)
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Background image was generated but could not be decoded.'));
    img.src = src;
  });
}

// Renders the objects inside `frame.capture` at exactly the size the image
// model will answer in, on a transparent canvas. Guides, card paper and any
// earlier generated background are hidden for the capture: they aren't
// objects to build a scene around, and each would otherwise read as one
// solid subject covering the whole frame.
function captureObjects(stage: Konva.Stage, frame: BackgroundFrame, earlierBackgroundIds: string[]): HTMLCanvasElement {
  const hidden: Konva.Node[] = [
    ...stage.getLayers().filter((layer) => layer.name() !== 'content'),
    ...stage.find('.card-paper'),
    ...earlierBackgroundIds.flatMap((id) => stage.findOne(`#${id}`) ?? []),
  ].filter((node) => node.visible());

  const scale = stage.scaleX();
  let raw: HTMLCanvasElement;
  hidden.forEach((node) => node.visible(false));
  try {
    raw = stage.toCanvas({
      x: frame.capture.x * scale + stage.x(),
      y: frame.capture.y * scale + stage.y(),
      width: frame.capture.width * scale,
      height: frame.capture.height * scale,
      pixelRatio: frame.outWidth / (frame.capture.width * scale),
    });
  } finally {
    hidden.forEach((node) => node.visible(true));
  }

  // toCanvas rounds its own dimensions; the API wants them exact.
  const exact = document.createElement('canvas');
  exact.width = frame.outWidth;
  exact.height = frame.outHeight;
  exact.getContext('2d')!.drawImage(raw, 0, 0, exact.width, exact.height);
  return exact;
}

// Trims the model's picture down to the part that lies over the drawn
// rectangle. JPEG, since a background is opaque and is stored whole.
function cropToRect(img: HTMLImageElement, frame: BackgroundFrame) {
  // The model is asked for outWidth x outHeight, but go by what it sent.
  const kx = img.naturalWidth / frame.outWidth;
  const ky = img.naturalHeight / frame.outHeight;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(frame.crop.width * kx));
  canvas.height = Math.max(1, Math.round(frame.crop.height * ky));
  canvas
    .getContext('2d')!
    .drawImage(img, frame.crop.x * kx, frame.crop.y * ky, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height };
}

// The whole Generate Background flow: draw a rectangle over some objects,
// have the vision model propose a scene for them, let the user edit that
// prompt, then have the image model paint the scene into the empty canvas
// around the objects — seeing where each one sits and how big it is — and
// slot the result in beneath them.
export function useBackgroundGeneration({ images, tool, setTool, stageRef, addBackground }: Options) {
  const [bgLoading, setBgLoading] = useState<BgRect | null>(null);
  const [bgProgress, setBgProgress] = useState<BgProgressEvent | null>(null);
  const bgStartedAtRef = useRef<number>(0);
  const [bgError, setBgError] = useState<string | null>(null);
  const [visionDetail, setVisionDetailState] = useState<VisionDetail>(
    () => (localStorage.getItem(VISION_DETAIL_STORAGE_KEY) as VisionDetail | null) ?? 'low'
  );
  const setVisionDetail = useCallback((detail: VisionDetail) => {
    setVisionDetailState(detail);
    localStorage.setItem(VISION_DETAIL_STORAGE_KEY, detail);
  }, []);
  const bgAbortRef = useRef<AbortController | null>(null);
  const [bgAwaiting, setBgAwaiting] = useState<{
    prompt: string;
    rect: BgRect;
    minZIndex: number;
    frame: BackgroundFrame;
    picture: Blob;
    mask: Blob;
  } | null>(null);

  const handleBgRectComplete = useCallback(
    (rect: BgRect) => {
      const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';
      if (!apiKey) {
        setBgError('No OpenAI API key found. Generate a sticker first to save your key, or open the sticker generator to add one.');
        setTool('select');
        return;
      }

      const stage = stageRef.current;
      const earlierBackgroundIds = images
        .filter((obj) => obj.kind === 'image' && obj.name === AI_BACKGROUND_NAME)
        .map((obj) => obj.id);
      const containedImages = images.filter((obj): obj is CollageImage => {
        if (obj.kind !== 'image' || obj.name === AI_BACKGROUND_NAME) return false;
        const node = stage?.findOne(`#${obj.id}`);
        const box = node?.getClientRect({ relativeTo: stage ?? undefined });
        return box ? Konva.Util.haveIntersection(rect, box) : false;
      });

      if (!stage || containedImages.length === 0) {
        setBgError('No images found within the drawn area. Draw the rectangle over the images you want to use as context.');
        setTool('select');
        return;
      }

      const minZIndex = Math.min(...containedImages.map((img) => img.zIndex));

      // The model sees the objects exactly as they are laid out — so it can
      // fit a scene to their positions and sizes — in a frame grown from the
      // drawn rectangle to a shape it can answer in.
      const frame = fitBackgroundFrame(rect);
      const objects = captureObjects(stage, frame, earlierBackgroundIds);
      const objectsCtx = objects.getContext('2d')!;
      const { data: maskData, covered } = subjectMask(
        objectsCtx.getImageData(0, 0, objects.width, objects.height).data
      );

      if (covered > MAX_COVERED) {
        setBgError('The objects fill the whole drawn area, so there is no empty canvas to paint a background into. Draw a larger rectangle around them.');
        setTool('select');
        return;
      }

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = objects.width;
      maskCanvas.height = objects.height;
      maskCanvas.getContext('2d')!.putImageData(new ImageData(maskData, objects.width, objects.height), 0, 0);

      // Flattened onto white for the models: transparency would come out
      // black in a JPEG, and "white is empty canvas" is what both are told.
      const flat = document.createElement('canvas');
      flat.width = objects.width;
      flat.height = objects.height;
      const flatCtx = flat.getContext('2d')!;
      flatCtx.fillStyle = '#ffffff';
      flatCtx.fillRect(0, 0, flat.width, flat.height);
      flatCtx.drawImage(objects, 0, 0);
      const compositeJpeg = flat.toDataURL('image/jpeg', 0.85);

      setTool('select');
      bgStartedAtRef.current = Date.now();
      setBgLoading(rect);

      const controller = new AbortController();
      bgAbortRef.current = controller;

      Promise.all([
        analyzeImages([compositeJpeg], apiKey, visionDetail, controller.signal, (event) => setBgProgress(event)),
        toBlob(flat, 'image/png'),
        toBlob(maskCanvas, 'image/png'),
      ])
        .then(([visionPrompt, picture, mask]) => {
          setBgAwaiting({ prompt: visionPrompt, rect, minZIndex, frame, picture, mask });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setBgLoading(null);
            return;
          }
          setBgError(err instanceof Error ? err.message : 'Vision analysis failed.');
          setBgLoading(null);
        })
        .finally(() => {
          setBgProgress(null);
        });
    },
    [images, stageRef, setTool, visionDetail]
  );

  const handleBgGenerate = useCallback(
    (editedPrompt: string) => {
      if (!bgAwaiting) return;
      const { rect, minZIndex, frame, picture, mask } = bgAwaiting;
      const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';

      setBgAwaiting(null);

      const controller = new AbortController();
      bgAbortRef.current = controller;

      paintBackgroundAround({
        prompt: editedPrompt,
        apiKey,
        picture,
        mask,
        size: frame.size,
        signal: controller.signal,
        onProgress: (event) => setBgProgress(event),
      })
        .then(loadImage)
        .then((img) => {
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            throw new Error('API returned a blank image. Try editing the prompt and generating again.');
          }
          // The picture covers the grown frame and has the objects painted
          // into it; the part over the drawn rectangle goes beneath the real
          // objects, which sit exactly on top of their painted selves.
          const cropped = cropToRect(img, frame);
          addBackground(cropped.dataUrl, AI_BACKGROUND_NAME, cropped.width, cropped.height, rect, minZIndex);
          setBgError(null);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setBgError(err instanceof Error ? err.message : 'Background generation failed.');
        })
        .finally(() => {
          setBgLoading(null);
          setBgProgress(null);
        });
    },
    [bgAwaiting, addBackground]
  );

  const handleBgCancel = useCallback(() => {
    bgAbortRef.current?.abort();
    setBgAwaiting(null);
    setBgLoading(null);
    setBgProgress(null);
  }, []);

  const bgRectDrawer = useBgRectDrawer({
    active: tool === 'bg-rect',
    stageRef,
    onComplete: handleBgRectComplete,
  });

  const dismissError = useCallback(() => setBgError(null), []);

  return {
    bgRectDrawer,
    bgLoading,
    bgProgress,
    bgAwaiting,
    bgError,
    startedAt: bgStartedAtRef.current,
    visionDetail,
    setVisionDetail,
    handleBgGenerate,
    handleBgCancel,
    dismissError,
  };
}
