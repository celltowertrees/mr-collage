import { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Circle, Rect, Line } from 'react-konva';
import Konva from 'konva';
import { CollageImage, GradientMask, MaskData, Tool } from '../types';
import { CollageImageNode } from './CollageImageNode';
import { useMaskDrawer } from '../hooks/useMaskDrawer';
import { useGradientMaskDrawer } from '../hooks/useGradientMaskDrawer';

interface CanvasProps {
  images: CollageImage[];
  selectedIds: string[];
  tool: Tool;
  stagePosition: { x: number; y: number };
  stageScale: number;
  onSelect: (ids: string[]) => void;
  onUpdateImage: (id: string, changes: Partial<CollageImage>) => void;
  onMoveSelected: (draggedId: string, dx: number, dy: number) => void;
  onStagePositionChange: (pos: { x: number; y: number }) => void;
  onStageScaleChange: (scale: number) => void;
  onDrop: (files: FileList) => void;
  onPaste: (e: ClipboardEvent) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  onCropMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onCropMouseMove: () => void;
  onCropMouseUp: () => void;
  cropPreviewRect: { x: number; y: number; width: number; height: number; rotation: number } | null;
}

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
  stageRef,
  onCropMouseDown,
  onCropMouseMove,
  onCropMouseUp,
  cropPreviewRect,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImage = selectedIds.length === 1 ? images.find((img) => img.id === selectedIds[0]) ?? null : null;
  const isMaskTool = tool.startsWith('mask-');
  const isGradientTool = tool === 'mask-gradient';
  const isCropTool = tool === 'crop';
  const isSelectTool = tool === 'select';

  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
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

  const handleMaskComplete = useCallback(
    (imageId: string, mask: MaskData) => {
      onUpdateImage(imageId, { mask });
    },
    [onUpdateImage]
  );

  const maskDrawer = useMaskDrawer({
    tool,
    targetImage: selectedImage,
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
    if (isMaskTool || isCropTool) return; // both use mousedown/mouseup, ignore click
    // A marquee drag's mouseup is immediately followed by a Konva `click` on
    // the same target — swallow that one click so it doesn't clear the
    // selection the marquee just made.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (e.target === e.target.getStage()) {
      onSelect([]);
    }
  }, [onSelect, isMaskTool, isCropTool]);

  // MouseDown — mask/crop drawing and marquee selection all start here
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
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
    const stage = stageRef.current;
    if (isSelectTool && stage && e.target === stage) {
      const pointer = stage.getPointerPosition();
      if (pointer) marqueeStartRef.current = pointer;
    }
  }, [isGradientTool, isMaskTool, isCropTool, isSelectTool, gradientMaskDrawer, maskDrawer, onCropMouseDown, stageRef]);

  const handleStageMouseMove = useCallback(() => {
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
  }, [isGradientTool, isMaskTool, isCropTool, gradientMaskDrawer, maskDrawer, onCropMouseMove, stageRef, toContentPoint]);

  const handleStageMouseUp = useCallback(() => {
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
  }, [isGradientTool, isMaskTool, isCropTool, onCropMouseUp, gradientMaskDrawer, maskDrawer, stageRef, toContentPoint, images, onSelect]);

  const getCursor = () => {
    if (tool === 'pan') return 'grab';
    if (isMaskTool || isCropTool) return 'crosshair';
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
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            onStagePositionChange({ x: e.target.x(), y: e.target.y() });
          }
        }}
        style={{ cursor: getCursor() }}
      >
        <Layer>
          {sorted.map((img) => (
            <CollageImageNode
              key={img.id}
              image={img}
              isSelected={selectedIds.includes(img.id)}
              tool={tool}
              onSelect={() => onSelect([img.id])}
              onChange={(changes) => onUpdateImage(img.id, changes)}
              onMove={(dx, dy) => onMoveSelected(img.id, dx, dy)}
            />
          ))}
          {renderPreview()}
          {gradientPreviewLine && (
            <Line name="gradient-preview" points={gradientPreviewLine.points} {...GRADIENT_LINE_STYLE} />
          )}
          {renderGradientHandles()}
          {isCropTool && cropPreviewRect && (
            <Rect name="crop-preview" {...cropPreviewRect} {...CROP_PREVIEW_STYLE} />
          )}
          {marqueeRect && <Rect name="marquee" {...marqueeRect} {...MARQUEE_STYLE} />}
        </Layer>
      </Stage>
    </div>
  );
}
