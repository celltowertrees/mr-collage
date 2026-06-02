import { useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Circle, Rect, Line } from 'react-konva';
import Konva from 'konva';
import { CollageImage, MaskData, Tool } from '../types';
import { CollageImageNode } from './CollageImageNode';
import { useMaskDrawer } from '../hooks/useMaskDrawer';

interface CanvasProps {
  images: CollageImage[];
  selectedId: string | null;
  tool: Tool;
  stagePosition: { x: number; y: number };
  stageScale: number;
  onSelect: (id: string | null) => void;
  onUpdateImage: (id: string, changes: Partial<CollageImage>) => void;
  onStagePositionChange: (pos: { x: number; y: number }) => void;
  onStageScaleChange: (scale: number) => void;
  onDrop: (files: FileList) => void;
  onPaste: (e: ClipboardEvent) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

const PREVIEW_STYLE = {
  stroke: '#2196F3',
  strokeWidth: 2,
  dash: [6, 4],
  listening: false,
};

export function Canvas({
  images,
  selectedId,
  tool,
  stagePosition,
  stageScale,
  onSelect,
  onUpdateImage,
  onStagePositionChange,
  onStageScaleChange,
  onDrop,
  onPaste,
  stageRef,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedImage = images.find((img) => img.id === selectedId) ?? null;
  const isMaskTool = tool.startsWith('mask-');

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
    if (isMaskTool) return; // mask uses mousedown/mouseup, ignore click
    if (e.target === e.target.getStage()) {
      onSelect(null);
    }
  }, [onSelect, isMaskTool]);

  // MouseDown — mask drawing starts here
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isMaskTool) {
      maskDrawer.handleMouseDown(e);
    }
  }, [isMaskTool, maskDrawer]);

  const getCursor = () => {
    if (tool === 'pan') return 'grab';
    if (isMaskTool) return 'crosshair';
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
        onMouseMove={isMaskTool ? maskDrawer.handleMouseMove : undefined}
        onMouseUp={isMaskTool ? maskDrawer.handleMouseUp : undefined}
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
              isSelected={img.id === selectedId}
              tool={tool}
              onSelect={() => onSelect(img.id)}
              onChange={(changes) => onUpdateImage(img.id, changes)}
            />
          ))}
          {renderPreview()}
        </Layer>
      </Stage>
    </div>
  );
}
