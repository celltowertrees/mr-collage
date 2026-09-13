import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  CanvasState,
  CollageImage,
  CollageModel3D,
  CollageObject,
  CollageText,
  DEFAULT_LIGHT_3D,
  DEFAULT_MATERIAL_3D,
  DEFAULT_ROTATION_3D,
  ObjectChanges,
  PrimitiveShape,
  SHAPE_LABELS,
  Tool,
} from '../types';
import type { BgRect } from './useBgRectDrawer';
import { saveState, loadState } from '../store';
import { useHistory } from './useHistory';
import { DEFAULT_FONT_FAMILY } from '../utils/googleFonts';

// Quiet window for collapsing a burst of edits into a single save. Long
// enough to swallow most of a gesture, short enough that a tab killed
// mid-gesture loses at most this much of it.
const SAVE_DEBOUNCE_MS = 400;

export function useCollage() {
  const {
    present: images,
    set: setImages,
    undo,
    redo,
    reset: resetImages,
    canUndo,
    canRedo,
  } = useHistory<CollageObject[]>([]);
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
  // A continuous gesture (dragging a slider, orbiting a 3D object, holding an
  // arrow key) pushes a new `images` array on every frame. Persisting each one
  // is pure waste — only the state the gesture settles on matters. A leading
  // timer collapses the whole burst into one save; `pendingSave` always holds
  // the newest state, so nothing that lands mid-window is lost, just deferred.
  const saveTimer = useRef<number | null>(null);
  const pendingSave = useRef<CanvasState | null>(null);
  const lastSaveAt = useRef(0);
  const lastSavedIds = useRef('');

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

  // Writes whatever's pending right now, and restarts the quiet window.
  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const state = pendingSave.current;
    if (!state) return;
    pendingSave.current = null;
    lastSaveAt.current = Date.now();
    saveQueue.current = saveQueue.current.then(() =>
      saveState(state).catch((err) => console.warn('Save failed:', err))
    );
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    pendingSave.current = { images, stagePosition, stageScale };

    // Which objects exist is a structural change — adding, deleting,
    // duplicating, or an undo that does any of those. Those are discrete and
    // infrequent, and something the user would be alarmed to lose, so they
    // never wait behind the window. Everything else is a mutation of objects
    // that already exist, which is where continuous gestures live.
    const ids = images.map((obj) => obj.id).join(',');
    const structural = ids !== lastSavedIds.current;
    lastSavedIds.current = ids;
    if (structural) {
      flushSave();
      return;
    }

    // A trailing save is already booked — this change will ride along with it.
    if (saveTimer.current !== null) return;
    const sinceLast = Date.now() - lastSaveAt.current;
    // Leading edge: the first mutation after a quiet spell persists straight
    // away, so the stored state is never stale while the user sits idle. Only
    // a change arriving during an already-active window gets deferred, which
    // is exactly the continuous-gesture case worth collapsing.
    if (sinceLast >= SAVE_DEBOUNCE_MS) {
      flushSave();
      return;
    }
    saveTimer.current = window.setTimeout(flushSave, SAVE_DEBOUNCE_MS - sinceLast);
  }, [images, stagePosition, stageScale, flushSave]);

  // Don't strand the tail of a gesture behind an unfired timer.
  useEffect(() => {
    window.addEventListener('pagehide', flushSave);
    return () => {
      window.removeEventListener('pagehide', flushSave);
      flushSave();
    };
  }, [flushSave]);

  const addImage = useCallback((src: string, name: string, naturalWidth: number, naturalHeight: number) => {
    const id = uuidv4();
    const maxDim = 400;
    const ratio = Math.min(maxDim / naturalWidth, maxDim / naturalHeight, 1);
    const img: CollageImage = {
      kind: 'image',
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

  // 3D objects are procedural, so unlike addImage there's no natural pixel
  // size to fit — the box is fixed and scale starts at 1.
  const addModel3D = useCallback((shape: PrimitiveShape) => {
    const id = uuidv4();
    const model: CollageModel3D = {
      kind: 'model3d',
      id,
      shape,
      x: (-stagePosition.x + window.innerWidth / 2) / stageScale,
      y: (-stagePosition.y + window.innerHeight / 2) / stageScale,
      width: 360,
      height: 360,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      zIndex: nextZIndex.current++,
      name: SHAPE_LABELS[shape],
      rotation3D: { ...DEFAULT_ROTATION_3D },
      light: { ...DEFAULT_LIGHT_3D },
      material: { ...DEFAULT_MATERIAL_3D },
    };
    setImages((prev) => [...prev, model]);
    setSelectedIds([id]);
  }, [stagePosition, stageScale, setImages]);

  // Returns the new object's id so callers (e.g. the Text tool's
  // click-to-place handler) can immediately open it for editing.
  const addText = useCallback((point: { x: number; y: number }): string => {
    const id = uuidv4();
    const textObj: CollageText = {
      kind: 'text',
      id,
      text: '',
      x: point.x,
      y: point.y,
      width: 200,
      height: 40,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      zIndex: nextZIndex.current++,
      name: 'Text',
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 32,
      bold: false,
      italic: false,
      underline: false,
      color: '#000000',
    };
    setImages((prev) => [...prev, textObj]);
    setSelectedIds([id]);
    return id;
  }, [setImages]);

  const updateImage = useCallback(
    (id: string, changes: ObjectChanges, options?: { coalesce?: boolean }) => {
      setImages(
        (prev) => prev.map((obj) => (obj.id === id ? ({ ...obj, ...changes } as CollageObject) : obj)),
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

  const addBackground = useCallback(
    (
      src: string,
      name: string,
      naturalWidth: number,
      naturalHeight: number,
      rect: BgRect,
      belowZIndex: number
    ) => {
      const id = uuidv4();
      const bg: CollageImage = {
        kind: 'image',
        id,
        src,
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        width: naturalWidth,
        height: naturalHeight,
        rotation: 0,
        scaleX: rect.width / naturalWidth,
        scaleY: rect.height / naturalHeight,
        opacity: 1,
        zIndex: belowZIndex - 1,
        name,
      };
      setImages((prev) => [...prev, bg]);
      setSelectedIds([id]);
    },
    [setImages]
  );

  const duplicateImage = useCallback((id: string) => {
    setImages((prev) => {
      const source = prev.find((img) => img.id === id);
      if (!source) return prev;
      const newImg: CollageObject = {
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
    addBackground,
    addText,
    addModel3D,
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
