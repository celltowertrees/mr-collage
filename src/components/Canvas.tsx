import { useRef, useState, useEffect, useCallback, useReducer } from 'react';
import { Stage, Layer, Circle, Rect, Line, Transformer } from 'react-konva';
import Konva from 'konva';
import { CollageObject, GradientMask, MaskData, ObjectChanges, Rotation3D, Tool } from '../types';
import { CollageImageNode } from './CollageImageNode';
import { CollageTextNode } from './CollageTextNode';
import { CollageModel3DNode } from './CollageModel3DNode';
import { useMaskDrawer } from '../hooks/useMaskDrawer';
import { useGradientMaskDrawer } from '../hooks/useGradientMaskDrawer';
import { useModel3DRotator } from '../hooks/useModel3DRotator';

interface CanvasProps {
  images: CollageObject[];
  selectedIds: string[];
  tool: Tool;
  stagePosition: { x: number; y: number };
  stageScale: number;
  onSelect: (ids: string[]) => void;
  onUpdateImage: (id: string, changes: ObjectChanges, options?: { coalesce?: boolean }) => void;
  onMoveSelected: (draggedId: string, dx: number, dy: number) => void;
  onStagePositionChange: (pos: { x: number; y: number }) => void;
  onStageScaleChange: (scale: number) => void;
  onDrop: (files: FileList) => void;
  onPaste: (e: ClipboardEvent) => void;
  onAddText: (point: { x: number; y: number }) => void;
  onStartEditingText: (id: string) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  onCropMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onCropMouseMove: () => void;
  onCropMouseUp: () => void;
  cropPreviewRect: { x: number; y: number; width: number; height: number; rotation: number } | null;
  onBgRectMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onBgRectMouseMove: () => void;
  onBgRectMouseUp: () => void;
  bgRectPreview: { x: number; y: number; width: number; height: number } | null;
  // Region (content coords) a background is currently being generated for.
  bgLoadingRect: { x: number; y: number; width: number; height: number } | null;
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

type MarqueeRect = { x: number; y: number; width: number; height: number };

// Minimum drag distance (in screen px) before a mousedown-drag-mouseup on
// empty canvas counts as a marquee rather than a plain click-to-deselect.
const MARQUEE_DRAG_THRESHOLD = 3;

export function Canvas({
  images,
  selectedIds,
  tool,
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
  stageRef,
  onCropMouseDown,
  onCropMouseMove,
  onCropMouseUp,
  cropPreviewRect,
  onBgRectMouseDown,
  onBgRectMouseMove,
  onBgRectMouseUp,
  bgRectPreview,
  bgLoadingRect,
}: CanvasProps) {
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

  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
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
    const nodes = selectedIds
      .map((id) => stage.findOne<Konva.Node>(`#${id}`))
      .filter((n): n is Konva.Node => n != null);
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

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.05, Math.min(10, newScale));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newPos = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    onStageScaleChange(clampedScale);
    onStagePositionChange(newPos);
  }, [onStageScaleChange, onStagePositionChange, stageRef]);

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

  // MouseDown — mask/crop drawing and marquee selection all start here
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isRotate3DTool) {
      model3DRotator.handleMouseDown(e);
      return;
    }
    if (isGradientTool) {
      gradientMaskDrawer.handleMouseDown(e);
      return;
    }
    if (isMaskTool) {
      maskDrawer.handleMouseDown(e);
      return;
    }
    if (isCropTool) {
      onCropMouseDown(e);
      return;
    }
    if (isBgRectTool) {
      onBgRectMouseDown(e);
      return;
    }
    const stage = stageRef.current;
    if (isSelectTool && stage && e.target === stage) {
      const pointer = stage.getPointerPosition();
      if (pointer) marqueeStartRef.current = pointer;
    }
  }, [isRotate3DTool, isGradientTool, isMaskTool, isCropTool, isBgRectTool, isSelectTool, model3DRotator, gradientMaskDrawer, maskDrawer, onCropMouseDown, onBgRectMouseDown, stageRef]);

  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isRotate3DTool) {
      model3DRotator.handleMouseMove(e);
      return;
    }
    if (isGradientTool) {
      gradientMaskDrawer.handleMouseMove();
      return;
    }
    if (isMaskTool) {
      maskDrawer.handleMouseMove();
      return;
    }
    if (isCropTool) {
      onCropMouseMove();
      return;
    }
    if (isBgRectTool) {
      onBgRectMouseMove();
      return;
    }
    const stage = stageRef.current;
    if (!marqueeStartRef.current || !stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const start = toContentPoint(marqueeStartRef.current);
    const current = toContentPoint(pointer);
    setMarqueeRect({
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    });
  }, [isRotate3DTool, isGradientTool, isMaskTool, isCropTool, isBgRectTool, model3DRotator, gradientMaskDrawer, maskDrawer, onCropMouseMove, onBgRectMouseMove, stageRef, toContentPoint]);

  const handleStageMouseUp = useCallback(() => {
    if (isRotate3DTool) {
      model3DRotator.handleMouseUp();
      return;
    }
    if (isGradientTool) {
      gradientMaskDrawer.handleMouseUp();
      return;
    }
    if (isMaskTool) {
      maskDrawer.handleMouseUp();
      return;
    }
    if (isCropTool) {
      onCropMouseUp();
      return;
    }
    if (isBgRectTool) {
      onBgRectMouseUp();
      return;
    }
    const start = marqueeStartRef.current;
    marqueeStartRef.current = null;
    setMarqueeRect(null);
    if (!start) return;

    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    const dragDistance = Math.hypot(pointer.x - start.x, pointer.y - start.y);
    if (dragDistance < MARQUEE_DRAG_THRESHOLD) return; // a plain click; handleStageClick deselects

    const startContent = toContentPoint(start);
    const currentContent = toContentPoint(pointer);
    const rect = {
      x: Math.min(startContent.x, currentContent.x),
      y: Math.min(startContent.y, currentContent.y),
      width: Math.abs(currentContent.x - startContent.x),
      height: Math.abs(currentContent.y - startContent.y),
    };

    const overlapped = images
      .filter((img) => {
        const node = stage.findOne(`#${img.id}`);
        const box = node?.getClientRect({ relativeTo: stage });
        return box ? Konva.Util.haveIntersection(rect, box) : false;
      })
      .map((img) => img.id);

    suppressNextClickRef.current = true;
    onSelect(overlapped);
  }, [isRotate3DTool, isGradientTool, isMaskTool, isCropTool, isBgRectTool, model3DRotator, onCropMouseUp, onBgRectMouseUp, gradientMaskDrawer, maskDrawer, stageRef, toContentPoint, images, onSelect]);

  const getCursor = () => {
    if (tool === 'pan') return 'grab';
    if (isRotate3DTool) return 'grab';
    if (isMaskTool || isCropTool || isTextTool || isBgRectTool) return 'crosshair';
    return 'default';
  };

  const sorted = [...images].sort((a, b) => a.zIndex - b.zIndex);

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
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={isMaskTool ? maskDrawer.handleDblClick : undefined}
        onWheel={handleWheel}
        onDragMove={(e) => {
          // The Transformer caches the selection's screen-space rect; recompute
          // it every pan frame so the handles can't lag behind the content.
          if (e.target === e.target.getStage()) trRef.current?.forceUpdate();
        }}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            onStagePositionChange({ x: e.target.x(), y: e.target.y() });
          }
        }}
        style={{ cursor: getCursor() }}
      >
        <Layer>
          {sorted.map((obj) => {
            // Shared by every kind: shift-click toggles membership in the
            // selection, a plain click replaces it.
            const handleSelect = (addToSelection: boolean) => {
              if (addToSelection) {
                const newIds = selectedIds.includes(obj.id)
                  ? selectedIds.filter((id) => id !== obj.id)
                  : [...selectedIds, obj.id];
                onSelect(newIds);
              } else {
                onSelect([obj.id]);
              }
            };
            // Only the node the user actually grabbed commits the group delta;
            // the Transformer drags the rest along and they bail out here.
            const handleMove = (dx: number, dy: number) => {
              if (obj.id !== primaryDragRef.current) return;
              primaryDragRef.current = null;
              onMoveSelected(obj.id, dx, dy);
            };
            // `key` is deliberately NOT part of this bag — React warns when a
            // key is spread in rather than passed directly on the element.
            const shared = {
              isSelected: selectedIds.includes(obj.id),
              tool,
              onSelect: handleSelect,
              onMove: handleMove,
              onGroupDragStart: () => handleNodeDragStart(obj.id),
            };

            if (obj.kind === 'text') {
              return (
                <CollageTextNode
                  key={obj.id}
                  {...shared}
                  textObj={obj}
                  onChange={(changes) => onUpdateImage(obj.id, changes)}
                  onEditStart={() => onStartEditingText(obj.id)}
                />
              );
            }
            if (obj.kind === 'model3d') {
              return (
                <CollageModel3DNode
                  key={obj.id}
                  {...shared}
                  model={obj}
                  onChange={(changes) => onUpdateImage(obj.id, changes)}
                />
              );
            }
            return (
              <CollageImageNode
                key={obj.id}
                {...shared}
                image={obj}
                onChange={(changes) => onUpdateImage(obj.id, changes)}
                onNodeMount={onNodeMount}
              />
            );
          })}
          <Transformer
            ref={trRef}
            rotateEnabled={!isMaskTool && !isCropTool && !isRotate3DTool}
            enabledAnchors={
              isMaskTool || isCropTool || isRotate3DTool || tool === 'mask-gradient'
                ? []
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
          {renderPreview()}
          {gradientPreviewLine && (
            <Line name="gradient-preview" points={gradientPreviewLine.points} {...GRADIENT_LINE_STYLE} />
          )}
          {renderGradientHandles()}
          {isCropTool && cropPreviewRect && (
            <Rect name="crop-preview" {...cropPreviewRect} {...CROP_PREVIEW_STYLE} />
          )}
          {marqueeRect && <Rect name="marquee" {...marqueeRect} {...MARQUEE_STYLE} />}
          {bgRectPreview && <Rect name="bg-rect-preview" {...bgRectPreview} {...BG_RECT_PREVIEW_STYLE} />}
          {bgLoadingRect && (
            <Rect ref={bgLoadingRef} name="bg-loading" {...bgLoadingRect} {...BG_LOADING_STYLE} />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
