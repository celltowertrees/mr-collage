import { useRef, useEffect, useCallback, useReducer, useMemo, useState, useImperativeHandle } from 'react';
import { Stage, Layer, Circle, Rect, Line, Transformer } from 'react-konva';
import Konva from 'konva';
import { CollageObject, GradientMask, MaskData, ObjectChanges, Rotation3D, Tool } from '../types';
import { CollageImageNode } from './CollageImageNode';
import { CollageTextNode } from './CollageTextNode';
import { TextCaret } from './TextCaret';
import type { WordArtLayout } from '../utils/wordArt';
import { CollageModel3DNode } from './CollageModel3DNode';
import { CardFrame, CardPaper } from './CollageCardNode';
import { cardSide } from '../utils/cardPair';
import { Model3DRotationGizmo } from './Model3DRotationGizmo';
import { RegenerateButton } from './RegenerateButton';
import { useMaskDrawer } from '../hooks/useMaskDrawer';
import { useGradientMaskDrawer } from '../hooks/useGradientMaskDrawer';
import { useModel3DRotator } from '../hooks/useModel3DRotator';
import { useMarqueeSelect } from '../hooks/useMarqueeSelect';
import type { PointerToolHandlers } from '../hooks/pointerTool';
import { fitBounds, zoomAbout, type View } from '../utils/viewport';

export interface ViewportControls {
  zoomBy: (factor: number) => void;
  zoomTo: (scale: number) => void;
  zoomToFit: () => void;
}

interface CanvasProps {
  images: CollageObject[];
  selectedIds: string[];
  tool: Tool;
  stagePosition: { x: number; y: number };
  stageScale: number;
  onSelect: (ids: string[]) => void;
  onUpdateImage: (id: string, changes: ObjectChanges, options?: { coalesce?: boolean; amend?: boolean; group?: string }) => void;
  onMoveSelected: (draggedId: string, dx: number, dy: number) => void;
  onStagePositionChange: (pos: { x: number; y: number }) => void;
  onStageScaleChange: (scale: number) => void;
  onDrop: (files: FileList) => void;
  onPaste: (e: ClipboardEvent) => void;
  onAddText: (point: { x: number; y: number }) => void;
  onStartEditingText: (id: string, caretIndex?: number) => void;
  // The text being typed into, and its selection, for drawing the caret.
  textEditing: { id: string; start: number; end: number } | null;
  // A click or drag on the text being edited, as a caret index.
  onEditPointer: (index: number, extend: boolean) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  cropDrawer: PointerToolHandlers;
  cropPreviewRect: { x: number; y: number; width: number; height: number; rotation: number } | null;
  bgRectDrawer: PointerToolHandlers;
  bgRectPreview: { x: number; y: number; width: number; height: number } | null;
  // Region (content coords) a background is currently being generated for.
  bgLoadingRect: { x: number; y: number; width: number; height: number } | null;
  // Opens the regenerate dialog for a generated image.
  onRegenerate: (id: string) => void;
  // Space is held: pan from any tool, without changing the tool.
  spacePanning: boolean;
  // Filled in by Canvas so the keyboard shortcuts can drive the view.
  viewportRef: React.Ref<ViewportControls>;
}

const BG_RECT_PREVIEW_STYLE = {
  fill: 'rgba(255, 100, 20, 0.08)',
  stroke: 'rgba(255, 100, 20, 0.85)',
  strokeWidth: 2,
  dash: [6, 4],
  listening: false,
};

const CROP_PREVIEW_STYLE = {
  stroke: '#4CAF50',
  strokeWidth: 2,
  dash: [6, 4],
  listening: false,
};

const PREVIEW_STYLE = {
  stroke: '#2196F3',
  strokeWidth: 2,
  dash: [6, 4],
  listening: false,
};

const BG_LOADING_STYLE = {
  fill: 'rgba(255, 100, 20, 0.07)',
  stroke: 'rgba(255, 100, 20, 0.7)',
  strokeWidth: 2,
  dash: [6, 4],
  cornerRadius: 4,
  listening: false,
};

const MARQUEE_STYLE = {
  fill: 'rgba(33, 150, 243, 0.1)',
  stroke: '#2196F3',
  strokeWidth: 1,
  listening: false,
};

const GRADIENT_LINE_STYLE = {
  stroke: '#9C27B0',
  strokeWidth: 2,
  dash: [6, 4],
  listening: false,
};

const GRADIENT_HANDLE_RADIUS = 6;

// How long the wheel has to stay still before the pan/zoom it produced is
// handed to React (and so saved, and seen by the text-edit overlay).
const WHEEL_COMMIT_DELAY_MS = 150;

// Screen px left around everything after Shift+1 (zoom to fit).
const FIT_PADDING_PX = 64;

export function Canvas({
  images,
  selectedIds,
  tool: activeTool,
  stagePosition,
  stageScale,
  onSelect,
  onUpdateImage,
  onMoveSelected,
  onStagePositionChange,
  onStageScaleChange,
  onDrop,
  onPaste,
  onAddText,
  onStartEditingText,
  textEditing,
  onEditPointer,
  stageRef,
  cropDrawer,
  cropPreviewRect,
  bgRectDrawer,
  bgRectPreview,
  bgLoadingRect,
  onRegenerate,
  spacePanning,
  viewportRef,
}: CanvasProps) {
  // Holding Space borrows the Pan tool for as long as it's held; the toolbar
  // keeps showing (and returns to) the tool the user actually picked.
  const tool: Tool = spacePanning ? 'pan' : activeTool;
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImage = selectedIds.length === 1 ? images.find((img) => img.id === selectedIds[0]) ?? null : null;
  // Shape masks (unlike gradient fade) only ever apply to images — narrow
  // here once so useMaskDrawer (typed for CollageImage) never sees anything
  // else. Checked positively: `kind !== 'text'` would silently hand each new
  // object kind to the mask drawer as if it were an image.
  const selectedImageOnly = selectedImage?.kind === 'image' ? selectedImage : null;
  const isMaskTool = tool.startsWith('mask-');
  const isRotate3DTool = tool === 'rotate3d';
  const isGradientTool = tool === 'mask-gradient';
  const isCropTool = tool === 'crop';
  const isBgRectTool = tool === 'bg-rect';
  const isSelectTool = tool === 'select';
  const isTextTool = tool === 'text';

  // The rotation gizmo is drawn on a single selected 3D object, and only in
  // the modes where grabbing it makes sense — while panning, or mid mask or
  // gradient drag, it would just be three more things in the way.
  const selectedModel3D =
    selectedImage?.kind === 'model3d' && (isSelectTool || isRotate3DTool) ? selectedImage : null;
  // A text box hugs its glyphs, so handles drawn on its edge sit on top of the
  // first and last letters (a middle-right handle turns "hello" into "hellc").
  // Padding pushes them out past the letters; it has to exceed half Konva's
  // 10px anchor to clear them. Images keep their handles on the edge.
  const selectionHasText = images.some((obj) => obj.kind === 'text' && selectedIds.includes(obj.id));
  // Text resizes by its font size, which only a proportional corner drag maps
  // onto; side handles would squash the letters.
  const selectionAllText =
    selectedIds.length > 0 && images.every((obj) => !selectedIds.includes(obj.id) || obj.kind === 'text');

  // Each text node reports the layout it drew, so the caret can be placed
  // from the same glyph positions. Kept in state so a new layout redraws the
  // caret; only the edited text's layout is ever read.
  const [textLayouts, setTextLayouts] = useState<Record<string, WordArtLayout>>({});
  const handleTextLayout = useCallback((id: string, layout: WordArtLayout) => {
    setTextLayouts((prev) => (prev[id] === layout ? prev : { ...prev, [id]: layout }));
  }, []);
  const editingTextObj = textEditing
    ? images.find((obj): obj is Extract<CollageObject, { kind: 'text' }> => obj.kind === 'text' && obj.id === textEditing.id) ?? null
    : null;

  // Tracks start positions of follower nodes during a group drag so they can
  // be moved imperatively to keep up with the dragged node in real time.
  // Konva's Transformer._proxyDrag already moves all attached nodes together
  // when one is dragged and starts each follower's own drag via startDrag().
  // That means every selected node fires onDragEnd. We track the primary
  // (user-initiated) dragged node so only it commits the position delta to
  // state; follower nodes bail out of onMove to avoid double-applying.
  const primaryDragRef = useRef<string | null>(null);
  // Single shared Transformer that always holds all currently selected nodes.
  const trRef = useRef<Konva.Transformer>(null);
  // Re-render (and so re-run the Transformer effect below) when a selected
  // image's Konva group mounts after the selection was already made.
  const [, onNodeMount] = useReducer((n: number) => n + 1, 0);

  // The "generating background" indicator lives in the Konva layer (content
  // coords) rather than as a fixed HTML overlay so it pans and zooms with the
  // canvas mid-gesture, not just once React's stagePosition catches up on
  // drag end. Konva.Animation drives the pulse the old CSS keyframes did.
  const bgLoadingRef = useRef<Konva.Rect>(null);
  useEffect(() => {
    const node = bgLoadingRef.current;
    if (!bgLoadingRect || !node) return;
    const anim = new Konva.Animation((frame) => {
      const phase = ((frame?.time ?? 0) / 1400) * 2 * Math.PI;
      node.fill(`rgba(255, 100, 20, ${0.07 + 0.035 * (1 - Math.cos(phase))})`);
    }, node.getLayer());
    anim.start();
    return () => {
      anim.stop();
    };
  }, [bgLoadingRect]);

  // A single selected AI-generated image gets a Regenerate button.
  const regenTargetId =
    isSelectTool && selectedImage?.kind === 'image' && selectedImage.generation ? selectedImage.id : null;

  // Runs after every render (no deps) because the selected Konva nodes can
  // appear or be replaced without the selection changing — e.g. an uploaded
  // image is auto-selected before its <Group> mounts (it waits on image load),
  // and a Fast Refresh can remount the tree. Only re-attach when the resolved
  // node set actually differs: re-attaching between the two clicks of a
  // dblclick disrupts Konva's internal dblclick detection.
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    // Cards stay out: they have a fixed print size, so no handles, and the
    // Transformer makes its whole box grabbable — over a card that would turn
    // every marquee started on its paper into a drag of the frame. A selected
    // card highlights its own frame instead.
    const nodes = selectedIds
      .map((id) => stage.findOne<Konva.Node>(`#${id}`))
      .filter((n): n is Konva.Node => n != null && n.name() !== 'card-frame');
    const current = tr.nodes();
    if (current.length === nodes.length && current.every((n, i) => n === nodes[i])) return;
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  });
  // Suppresses the stage `click` that Konva fires right after a marquee's
  // mouseup — otherwise handleStageClick would immediately clear the
  // selection the marquee just made.
  const suppressNextClickRef = useRef(false);

  // Converts a pointer position (screen px, relative to the stage container)
  // into content coordinates — the same space image.x/image.y live in —
  // matching the manual conversion handleWheel already does for zooming.
  const toContentPoint = useCallback(
    (pointer: { x: number; y: number }) => {
      const stage = stageRef.current;
      if (!stage) return pointer;
      return {
        x: (pointer.x - stage.x()) / stage.scaleX(),
        y: (pointer.y - stage.y()) / stage.scaleY(),
      };
    },
    [stageRef]
  );

  const handleNodeDragStart = useCallback(
    (nodeId: string) => {
      // The Transformer's _proxyDrag will call startDrag() on follower nodes,
      // causing them to fire dragstart too. Only the FIRST dragstart (the
      // user-initiated one) should be treated as the primary.
      if (primaryDragRef.current === null) {
        primaryDragRef.current = nodeId;
      }
    },
    []
  );

  const handleMaskComplete = useCallback(
    (imageId: string, mask: MaskData) => {
      onUpdateImage(imageId, { mask });
    },
    [onUpdateImage]
  );

  const maskDrawer = useMaskDrawer({
    tool,
    targetImage: selectedImageOnly,
    stageRef,
    onMaskComplete: handleMaskComplete,
  });

  const handleGradientMaskChange = useCallback(
    (imageId: string, gradientMask: GradientMask) => {
      onUpdateImage(imageId, { gradientMask });
    },
    [onUpdateImage]
  );

  const gradientMaskDrawer = useGradientMaskDrawer({
    active: isGradientTool,
    targetImage: selectedImage,
    stageRef,
    onChange: handleGradientMaskChange,
  });

  // Coalesced so the whole orbit gesture collapses into one undo step, the
  // same way a slider drag does.
  const handleRotation3DChange = useCallback(
    (modelId: string, rotation3D: Rotation3D) => {
      onUpdateImage(modelId, { rotation3D }, { coalesce: true });
    },
    [onUpdateImage]
  );

  const model3DRotator = useModel3DRotator({
    active: isRotate3DTool,
    targetImage: selectedImage,
    onChange: handleRotation3DChange,
  });

  useEffect(() => {
    const handler = (e: ClipboardEvent) => onPaste(e);
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [onPaste]);

  // A wheel gesture fires dozens of events a second. Each used to push the
  // new pan/zoom into React state, re-rendering the app (toolbar included) and
  // booking a save on every tick. Instead the stage is moved directly, the
  // way Konva moves it during a pan-tool drag, and React hears about it once
  // the wheel goes quiet. react-konva only re-applies a prop when its value
  // changes, so a re-render in the meantime can't snap the stage back.
  //
  // Only one timer is ever pending. Each wheel event just stamps the time,
  // and the timer, when it fires, re-arms itself for whatever's left of the
  // quiet window — rather than every event clearing and re-creating a timer,
  // which showed up as measurable churn in a trace of a zoom burst.
  const wheelCommitTimer = useRef<number | null>(null);
  const lastWheelAt = useRef(0);
  const commitViewport = useCallback(function settle() {
    const remaining = WHEEL_COMMIT_DELAY_MS - (performance.now() - lastWheelAt.current);
    if (remaining > 0) {
      wheelCommitTimer.current = window.setTimeout(settle, remaining);
      return;
    }
    wheelCommitTimer.current = null;
    const stage = stageRef.current;
    if (!stage) return;
    onStageScaleChange(stage.scaleX());
    onStagePositionChange({ x: stage.x(), y: stage.y() });
  }, [onStageScaleChange, onStagePositionChange, stageRef]);
  useEffect(
    () => () => {
      if (wheelCommitTimer.current !== null) clearTimeout(wheelCommitTimer.current);
    },
    []
  );

  // Moves the stage directly, the way Konva does during a pan drag. React
  // only hears about it when `commit` is set (or when the wheel settles).
  const applyView = useCallback(
    (view: View, commit: boolean) => {
      const stage = stageRef.current;
      if (!stage) return;
      stage.scale({ x: view.scale, y: view.scale });
      stage.position({ x: view.x, y: view.y });
      // The Transformer caches its screen-space rect.
      trRef.current?.forceUpdate();
      stage.batchDraw();
      if (commit) {
        onStageScaleChange(view.scale);
        onStagePositionChange({ x: view.x, y: view.y });
      }
    },
    [stageRef, onStageScaleChange, onStagePositionChange]
  );

  const currentView = useCallback((): View | null => {
    const stage = stageRef.current;
    return stage ? { x: stage.x(), y: stage.y(), scale: stage.scaleX() } : null;
  }, [stageRef]);

  // Figma-style: a plain scroll (or two-finger trackpad swipe) pans, in
  // every tool. Ctrl/Cmd+scroll zooms — and a trackpad pinch arrives as a
  // ctrlKey wheel, so it zooms too.
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const view = currentView();
    if (!stage || !view) return;

    // Firefox can report line-based deltas; scale them to pixels.
    const unit = e.evt.deltaMode === 1 ? 16 : e.evt.deltaMode === 2 ? stage.height() : 1;
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      // Proportional, so a pinch's small deltas zoom smoothly; clamped, so a
      // mouse wheel's big notches don't leap.
      const dy = Math.max(-10, Math.min(10, e.evt.deltaY * unit));
      applyView(zoomAbout(view, pointer, Math.exp(-dy * 0.01)), false);
    } else {
      let dx = e.evt.deltaX * unit;
      let dy = e.evt.deltaY * unit;
      // Shift+wheel means sideways on mice that only have a vertical wheel.
      if (e.evt.shiftKey && dx === 0) [dx, dy] = [dy, 0];
      applyView({ ...view, x: view.x - dx, y: view.y - dy }, false);
    }

    lastWheelAt.current = performance.now();
    if (wheelCommitTimer.current === null) {
      wheelCommitTimer.current = window.setTimeout(commitViewport, WHEEL_COMMIT_DELAY_MS);
    }
  }, [stageRef, currentView, applyView, commitViewport]);

  useImperativeHandle(
    viewportRef,
    () => {
      const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      return {
        zoomBy: (factor) => {
          const view = currentView();
          if (view) applyView(zoomAbout(view, centre(), factor), true);
        },
        zoomTo: (scale) => {
          const view = currentView();
          if (view) applyView(zoomAbout(view, centre(), scale / view.scale), true);
        },
        zoomToFit: () => {
          const stage = stageRef.current;
          if (!stage) return;
          let bounds: { x: number; y: number; width: number; height: number } | null = null;
          for (const obj of images) {
            const box = stage.findOne(`#${obj.id}`)?.getClientRect({ relativeTo: stage });
            if (!box) continue;
            if (!bounds) {
              bounds = box;
            } else {
              const x = Math.min(bounds.x, box.x);
              const y = Math.min(bounds.y, box.y);
              bounds = {
                x,
                y,
                width: Math.max(bounds.x + bounds.width, box.x + box.width) - x,
                height: Math.max(bounds.y + bounds.height, box.y + box.height) - y,
              };
            }
          }
          if (!bounds) return;
          applyView(fitBounds(bounds, { width: stage.width(), height: stage.height() }, FIT_PADDING_PX), true);
        },
      };
    },
    [images, stageRef, currentView, applyView]
  );

  // A middle-button drag pans from any tool. Handled on the container with
  // native pointer events (Konva only drags with the primary button), and
  // committed to React once on release, like a pan drag.
  const [panDragging, setPanDragging] = useState(false);
  const middlePanRef = useRef<{ x: number; y: number } | null>(null);
  const handleContainerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 1) return;
    e.preventDefault(); // no autoscroll
    e.currentTarget.setPointerCapture(e.pointerId);
    middlePanRef.current = { x: e.clientX, y: e.clientY };
    setPanDragging(true);
  }, []);
  const handleContainerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const last = middlePanRef.current;
      const view = currentView();
      if (!last || !view) return;
      middlePanRef.current = { x: e.clientX, y: e.clientY };
      applyView({ ...view, x: view.x + e.clientX - last.x, y: view.y + e.clientY - last.y }, false);
    },
    [currentView, applyView]
  );
  const handleContainerPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!middlePanRef.current) return;
      middlePanRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      setPanDragging(false);
      const view = currentView();
      if (view) onStagePositionChange({ x: view.x, y: view.y });
    },
    [currentView, onStagePositionChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDropEvent = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      onDrop(e.dataTransfer.files);
    }
  }, [onDrop]);

  // Click handler — only used for selection, not mask drawing
  const handleStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return; // a middle-button pan isn't a click
    if (isMaskTool || isCropTool || isBgRectTool) return; // use mousedown/mouseup, ignore click
    // A marquee drag's mouseup is immediately followed by a Konva `click` on
    // the same target — swallow that one click so it doesn't clear the
    // selection the marquee just made.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (isTextTool) {
      const stage = e.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (pointer) onAddText(toContentPoint(pointer));
      return;
    }
    if (e.target === e.target.getStage() && !e.evt.shiftKey) {
      onSelect([]);
    }
  }, [onSelect, isMaskTool, isCropTool, isBgRectTool, isTextTool, onAddText, toContentPoint]);

  const marquee = useMarqueeSelect({
    active: isSelectTool,
    images,
    stageRef,
    toContentPoint,
    onSelect,
    suppressNextClickRef,
  });

  // Whichever tool is active owns the stage's mouse events. Anything not
  // listed (select, pan, text) falls through to marquee selection, which only
  // starts a box under the Select tool.
  const pointerTool: PointerToolHandlers = isRotate3DTool
    ? model3DRotator
    : isGradientTool
      ? gradientMaskDrawer
      : isMaskTool
        ? maskDrawer
        : isCropTool
          ? cropDrawer
          : isBgRectTool
            ? bgRectDrawer
            : marquee;

  // Read through refs so the per-node handlers below never change identity
  // when the selection does — they're shared by every node, and a new
  // function would defeat each node's React.memo.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  // Set when a press has just selected an object, so the click that follows
  // the same press doesn't act on it a second time (a Shift-press adding it
  // and then the Shift-click toggling it straight back out).
  const pressSelectedRef = useRef<string | null>(null);

  // Mousedown on an object that isn't selected yet selects it (Shift adds),
  // so pressing and dragging an object picks it up in one motion. Pressing
  // one that's already selected leaves the selection alone, so a group drag
  // still moves the whole group.
  const handleNodePress = useCallback(
    (id: string, addToSelection: boolean) => {
      const current = selectedIdsRef.current;
      if (current.includes(id)) {
        pressSelectedRef.current = null;
        return;
      }
      pressSelectedRef.current = id;
      onSelect(addToSelection ? [...current, id] : [id]);
    },
    [onSelect]
  );

  // Shared by every kind: shift-click toggles membership in the selection, a
  // plain click replaces it.
  const handleNodeSelect = useCallback(
    (id: string, addToSelection: boolean) => {
      if (pressSelectedRef.current === id) {
        pressSelectedRef.current = null;
        return;
      }
      const current = selectedIdsRef.current;
      if (addToSelection) {
        onSelect(current.includes(id) ? current.filter((sid) => sid !== id) : [...current, id]);
      } else {
        onSelect([id]);
      }
    },
    [onSelect]
  );

  // Only the node the user actually grabbed commits the group delta; the
  // Transformer drags the rest along and they bail out here.
  const handleNodeMove = useCallback(
    (id: string, dx: number, dy: number) => {
      if (id !== primaryDragRef.current) return;
      primaryDragRef.current = null;
      onMoveSelected(id, dx, dy);
    },
    [onMoveSelected]
  );

  const nodeHandlers = useMemo(
    () => ({
      tool,
      onSelect: handleNodeSelect,
      onPress: handleNodePress,
      onChange: onUpdateImage,
      onMove: handleNodeMove,
      onDragStart: handleNodeDragStart,
    }),
    [tool, handleNodeSelect, handleNodePress, onUpdateImage, handleNodeMove, handleNodeDragStart]
  );

  const getCursor = () => {
    if (panDragging) return 'grabbing';
    if (tool === 'pan') return 'grab';
    if (isRotate3DTool) return 'grab';
    if (isMaskTool || isCropTool || isTextTool || isBgRectTool) return 'crosshair';
    return 'default';
  };

  const sorted = useMemo(() => [...images].sort((a, b) => a.zIndex - b.zIndex), [images]);
  const cards = useMemo(() => images.filter((obj) => obj.kind === 'card'), [images]);

  // Render mask preview shape
  const preview = maskDrawer.getPreview();
  const renderPreview = () => {
    if (!preview) return null;
    switch (preview.type) {
      case 'circle':
        return <Circle name="mask-preview" {...preview.props} {...PREVIEW_STYLE} />;
      case 'rect':
        return <Rect name="mask-preview" {...preview.props} {...PREVIEW_STYLE} />;
      case 'polygon':
        return <Line name="mask-preview" {...preview.props} {...PREVIEW_STYLE} closed={false} />;
    }
  };

  // Preview of a gradient line still being dragged out, and the persistent
  // draggable endpoint handles once a gradient fade already exists.
  const gradientPreviewLine = gradientMaskDrawer.getPreviewLine();
  const gradientHandles = gradientMaskDrawer.getHandles();
  const renderGradientHandles = () => {
    if (!gradientHandles) return null;
    return (
      <>
        <Line
          name="gradient-handle-line"
          points={[gradientHandles.start.x, gradientHandles.start.y, gradientHandles.end.x, gradientHandles.end.y]}
          {...GRADIENT_LINE_STYLE}
        />
        <Circle
          name="gradient-handle-start"
          x={gradientHandles.start.x}
          y={gradientHandles.start.y}
          radius={GRADIENT_HANDLE_RADIUS}
          fill="#ffffff"
          stroke="#9C27B0"
          strokeWidth={2}
          draggable
          onDragEnd={(e) =>
            gradientMaskDrawer.handleHandleDrag('start', { x: e.target.x(), y: e.target.y() })
          }
        />
        <Circle
          name="gradient-handle-end"
          x={gradientHandles.end.x}
          y={gradientHandles.end.y}
          radius={GRADIENT_HANDLE_RADIUS}
          fill="#9C27B0"
          stroke="#ffffff"
          strokeWidth={2}
          draggable
          onDragEnd={(e) =>
            gradientMaskDrawer.handleHandleDrag('end', { x: e.target.x(), y: e.target.y() })
          }
        />
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onDragOver={handleDragOver}
      onDrop={handleDropEvent}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerCancel={handleContainerPointerUp}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault(); // no autoscroll
      }}
    >
      <Stage
        ref={stageRef as React.LegacyRef<Konva.Stage>}
        width={window.innerWidth}
        height={window.innerHeight}
        x={stagePosition.x}
        y={stagePosition.y}
        scaleX={stageScale}
        scaleY={stageScale}
        draggable={tool === 'pan'}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseDown={(e) => {
          // Only the primary button draws, marquees or orbits; the middle
          // button pans (see the container's pointer handlers).
          if (e.evt.button === 0) pointerTool.handleMouseDown(e);
        }}
        onMouseMove={pointerTool.handleMouseMove}
        onMouseUp={pointerTool.handleMouseUp}
        onDblClick={isMaskTool ? maskDrawer.handleDblClick : undefined}
        onWheel={handleWheel}
        onDragStart={(e) => {
          if (e.target === e.target.getStage()) setPanDragging(true);
        }}
        onDragMove={(e) => {
          // The Transformer caches the selection's screen-space rect; recompute
          // it every pan frame so the handles can't lag behind the content.
          if (e.target === e.target.getStage()) trRef.current?.forceUpdate();
        }}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setPanDragging(false);
            onStagePositionChange({ x: e.target.x(), y: e.target.y() });
          }
        }}
        style={{ cursor: getCursor() }}
      >
        <Layer name="content">
          {/* Card paper sits under every object, whatever its zIndex. */}
          {cards.map((card) => (
            <CardPaper key={card.id} card={card} />
          ))}
          {sorted.map((obj) => {
            if (obj.kind === 'card') return null;
            if (obj.kind === 'text') {
              return (
                <CollageTextNode
                  key={obj.id}
                  {...nodeHandlers}
                  textObj={obj}
                  onEditStart={onStartEditingText}
                  onLayout={handleTextLayout}
                  editing={textEditing?.id === obj.id}
                  onEditPointer={onEditPointer}
                />
              );
            }
            if (obj.kind === 'model3d') {
              return <CollageModel3DNode key={obj.id} {...nodeHandlers} model={obj} />;
            }
            return <CollageImageNode key={obj.id} {...nodeHandlers} image={obj} onNodeMount={onNodeMount} />;
          })}
        </Layer>
        {/* Selection chrome and in-progress previews live on their own layer,
            so drawing a marquee or mask outline frame by frame repaints only
            these few shapes instead of every object (and its shadow) below. */}
        <Layer name="overlay">
          {cards.map((card) => (
            <CardFrame
              key={card.id}
              {...nodeHandlers}
              card={card}
              side={cardSide(card, images)}
              selected={selectedIds.includes(card.id)}
              stageScale={stageScale}
            />
          ))}
          <Transformer
            ref={trRef}
            padding={selectionHasText ? 8 : 0}
            rotateEnabled={!isMaskTool && !isCropTool && !isRotate3DTool}
            enabledAnchors={
              isMaskTool || isCropTool || isRotate3DTool || tool === 'mask-gradient'
                ? []
                : selectionAllText
                ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                : [
                    'top-left',
                    'top-right',
                    'bottom-left',
                    'bottom-right',
                    'middle-left',
                    'middle-right',
                    'top-center',
                    'bottom-center',
                  ]
            }
            boundBoxFunc={(oldBox, newBox) => {
              if (Math.abs(newBox.width) < 10 || Math.abs(newBox.height) < 10) return oldBox;
              return newBox;
            }}
          />
          {editingTextObj && textLayouts[editingTextObj.id] && textEditing && (
            <TextCaret
              textObj={editingTextObj}
              layout={textLayouts[editingTextObj.id]}
              selectionStart={textEditing.start}
              selectionEnd={textEditing.end}
            />
          )}
          {selectedModel3D && (
            <Model3DRotationGizmo
              model={selectedModel3D}
              stageScale={stageScale}
              stageRef={stageRef}
              onChange={handleRotation3DChange}
              onGestureStart={() => {
                suppressNextClickRef.current = true;
              }}
            />
          )}
          {renderPreview()}
          {gradientPreviewLine && (
            <Line name="gradient-preview" points={gradientPreviewLine.points} {...GRADIENT_LINE_STYLE} />
          )}
          {renderGradientHandles()}
          {isCropTool && cropPreviewRect && (
            <Rect name="crop-preview" {...cropPreviewRect} {...CROP_PREVIEW_STYLE} />
          )}
          {marquee.marqueeRect && <Rect name="marquee" {...marquee.marqueeRect} {...MARQUEE_STYLE} />}
          {bgRectPreview && <Rect name="bg-rect-preview" {...bgRectPreview} {...BG_RECT_PREVIEW_STYLE} />}
          {bgLoadingRect && (
            <Rect ref={bgLoadingRef} name="bg-loading" {...bgLoadingRect} {...BG_LOADING_STYLE} />
          )}
        </Layer>
      </Stage>
      <RegenerateButton targetId={regenTargetId} stageRef={stageRef} onRegenerate={onRegenerate} />
    </div>
  );
}
