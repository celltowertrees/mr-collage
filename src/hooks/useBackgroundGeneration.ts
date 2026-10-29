import { useCallback, useRef, useState } from 'react';
import Konva from 'konva';
import { analyzeImages, generateBackgroundFromPrompt, type VisionDetail, type BgProgressEvent } from '../utils/generateBackground';
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

// The whole Generate Background flow: draw a rectangle over some images, have
// the vision model describe them, let the user edit that prompt, then
// generate a background and slot it in beneath them.
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
    aspectRatio: number;
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
      const containedImages = images.filter((obj): obj is CollageImage => {
        if (obj.kind !== 'image') return false;
        const node = stage?.findOne(`#${obj.id}`);
        const box = node?.getClientRect({ relativeTo: stage ?? undefined });
        return box ? Konva.Util.haveIntersection(rect, box) : false;
      });

      if (containedImages.length === 0) {
        setBgError('No images found within the drawn area. Draw the rectangle over the images you want to use as context.');
        setTool('select');
        return;
      }

      const minZIndex = Math.min(...containedImages.map((img) => img.zIndex));
      const aspectRatio = rect.width / rect.height;

      // Render the drawn region to a JPEG so the vision model sees how everything
      // is laid out together rather than each image in isolation.
      const scale = stage!.scaleX();
      const compositeJpeg = stage!.toDataURL({
        x: rect.x * scale + stage!.x(),
        y: rect.y * scale + stage!.y(),
        width: rect.width * scale,
        height: rect.height * scale,
        pixelRatio: 2,
        mimeType: 'image/jpeg',
        quality: 0.85,
      });

      setTool('select');
      bgStartedAtRef.current = Date.now();
      setBgLoading(rect);

      const controller = new AbortController();
      bgAbortRef.current = controller;

      analyzeImages([compositeJpeg], apiKey, visionDetail, controller.signal, (event) => setBgProgress(event))
        .then((visionPrompt) => {
          setBgAwaiting({ prompt: visionPrompt, rect, minZIndex, aspectRatio });
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
      const { rect, minZIndex, aspectRatio } = bgAwaiting;
      const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';

      setBgAwaiting(null);

      const controller = new AbortController();
      bgAbortRef.current = controller;

      generateBackgroundFromPrompt(editedPrompt, apiKey, aspectRatio, controller.signal, (event) => setBgProgress(event))
        .then(({ dataUrl, naturalWidth, naturalHeight }) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                reject(new Error('API returned a blank image. Try editing the prompt and generating again.'));
                return;
              }
              try {
                addBackground(dataUrl, 'AI Background', naturalWidth, naturalHeight, rect, minZIndex);
                setBgError(null);
                resolve();
              } catch (e) {
                reject(e);
              }
            };
            img.onerror = () => reject(new Error('Background image was generated but could not be decoded.'));
            img.src = dataUrl;
          })
        )
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
