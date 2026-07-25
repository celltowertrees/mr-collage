import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CollageImage, CanvasState, Tool } from '../types';
import { saveState, loadState } from '../store';
import { useHistory } from './useHistory';

export function useCollage() {
  const {
    present: images,
    set: setImages,
    undo,
    redo,
    reset: resetImages,
    canUndo,
    canRedo,
  } = useHistory<CollageImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const nextZIndex = useRef(1);
  const initialized = useRef(false);
  // Each save chains onto the last so overlapping saveState() calls (fired in
  // quick succession, e.g. by coalesced slider updates) resolve in the order
  // they were scheduled — otherwise an earlier call's IndexedDB round-trip
  // could finish after a later one's and overwrite localStorage with stale data.
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    loadState().then((saved) => {
      if (saved) {
        resetImages(saved.images);
        setStagePosition(saved.stagePosition);
        setStageScale(saved.stageScale);
        const maxZ = saved.images.reduce((max, img) => Math.max(max, img.zIndex), 0);
        nextZIndex.current = maxZ + 1;
      }
      // Only allow saving after load completes
      initialized.current = true;
    });
  }, [resetImages]);

  useEffect(() => {
    if (!initialized.current) return;
    const state: CanvasState = { images, stagePosition, stageScale };
    saveQueue.current = saveQueue.current.then(() =>
      saveState(state).catch((err) => console.warn('Save failed:', err))
    );
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
    setSelectedIds([id]);
  }, [stagePosition, stageScale, setImages]);

  const updateImage = useCallback(
    (id: string, changes: Partial<CollageImage>, options?: { coalesce?: boolean }) => {
      setImages(
        (prev) => prev.map((img) => (img.id === id ? { ...img, ...changes } : img)),
        options
      );
    },
    [setImages]
  );

  const deleteImage = useCallback((id: string | string[]) => {
    const ids = Array.isArray(id) ? id : [id];
    setImages((prev) => prev.filter((img) => !ids.includes(img.id)));
    setSelectedIds((prev) => prev.filter((sid) => !ids.includes(sid)));
  }, [setImages]);

  const bringToFront = useCallback((id: string) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, zIndex: nextZIndex.current++ } : img))
    );
  }, [setImages]);

  const sendToBack = useCallback((id: string) => {
    setImages((prev) => {
      const minZ = prev.reduce((min, img) => Math.min(min, img.zIndex), Infinity);
      return prev.map((img) => (img.id === id ? { ...img, zIndex: minZ - 1 } : img));
    });
  }, [setImages]);

  const moveImages = useCallback(
    (ids: string[], dx: number, dy: number, options?: { coalesce?: boolean }) => {
      // Applies the delta via the functional updater (not updateImage's
      // stale-closure `image.x`) so back-to-back moves fired before a
      // re-render — e.g. holding an arrow key down — each build on the other
      // instead of collapsing into a single step.
      setImages(
        (prev) => prev.map((img) => (ids.includes(img.id) ? { ...img, x: img.x + dx, y: img.y + dy } : img)),
        options
      );
    },
    [setImages]
  );

  const nudgeImages = useCallback(
    (ids: string[], dx: number, dy: number) => moveImages(ids, dx, dy, { coalesce: true }),
    [moveImages]
  );

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
      setSelectedIds([newImg.id]);
      return [...prev, newImg];
    });
  }, [setImages]);

  return {
    images,
    setImages,
    selectedIds,
    setSelectedIds,
    tool,
    setTool,
    stagePosition,
    setStagePosition,
    stageScale,
    setStageScale,
    addImage,
    updateImage,
    moveImages,
    nudgeImages,
    deleteImage,
    bringToFront,
    sendToBack,
    duplicateImage,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
