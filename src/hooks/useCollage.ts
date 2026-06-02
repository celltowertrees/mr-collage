import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CollageImage, CanvasState, Tool } from '../types';
import { saveState, loadState } from '../store';

export function useCollage() {
  const [images, setImages] = useState<CollageImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const nextZIndex = useRef(1);
  const initialized = useRef(false);

  useEffect(() => {
    loadState().then((saved) => {
      if (saved) {
        setImages(saved.images);
        setStagePosition(saved.stagePosition);
        setStageScale(saved.stageScale);
        const maxZ = saved.images.reduce((max, img) => Math.max(max, img.zIndex), 0);
        nextZIndex.current = maxZ + 1;
      }
      // Only allow saving after load completes
      initialized.current = true;
    });
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    const state: CanvasState = { images, stagePosition, stageScale };
    saveState(state).catch((err) => console.warn('Save failed:', err));
  }, [images, stagePosition, stageScale]);

  const addImage = useCallback((src: string, name: string, naturalWidth: number, naturalHeight: number) => {
    const id = uuidv4();
    const maxDim = 400;
    const ratio = Math.min(maxDim / naturalWidth, maxDim / naturalHeight, 1);
    const img: CollageImage = {
      id,
      src,
      x: (-stagePosition.x + window.innerWidth / 2) / stageScale,
      y: (-stagePosition.y + window.innerHeight / 2) / stageScale,
      width: naturalWidth,
      height: naturalHeight,
      rotation: 0,
      scaleX: ratio,
      scaleY: ratio,
      opacity: 1,
      zIndex: nextZIndex.current++,
      name,
    };
    setImages((prev) => [...prev, img]);
    setSelectedId(id);
  }, [stagePosition, stageScale]);

  const updateImage = useCallback((id: string, changes: Partial<CollageImage>) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, ...changes } : img)));
  }, []);

  const deleteImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, zIndex: nextZIndex.current++ } : img))
    );
  }, []);

  const sendToBack = useCallback((id: string) => {
    setImages((prev) => {
      const minZ = prev.reduce((min, img) => Math.min(min, img.zIndex), Infinity);
      return prev.map((img) => (img.id === id ? { ...img, zIndex: minZ - 1 } : img));
    });
  }, []);

  const duplicateImage = useCallback((id: string) => {
    setImages((prev) => {
      const source = prev.find((img) => img.id === id);
      if (!source) return prev;
      const newImg: CollageImage = {
        ...source,
        id: uuidv4(),
        x: source.x + 20,
        y: source.y + 20,
        zIndex: nextZIndex.current++,
      };
      setSelectedId(newImg.id);
      return [...prev, newImg];
    });
  }, []);

  return {
    images,
    setImages,
    selectedId,
    setSelectedId,
    tool,
    setTool,
    stagePosition,
    setStagePosition,
    stageScale,
    setStageScale,
    addImage,
    updateImage,
    deleteImage,
    bringToFront,
    sendToBack,
    duplicateImage,
  };
}
