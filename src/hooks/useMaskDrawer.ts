import { useState, useCallback, useEffect } from 'react';
import Konva from 'konva';
import { Tool, MaskData, CollageImage } from '../types';

interface UseMaskDrawerProps {
  tool: Tool;
  targetImage: CollageImage | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  onMaskComplete: (imageId: string, mask: MaskData) => void;
}

/** Convert stage-space point to image-local coordinates. */
function stageToImageLocal(
  stageX: number,
  stageY: number,
  image: CollageImage
): { x: number; y: number } {
  const dx = stageX - image.x;
  const dy = stageY - image.y;

  const rad = (-image.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  return {
    x: rx / image.scaleX + image.width / 2,
    y: ry / image.scaleY + image.height / 2,
  };
}

/** Convert image-local coords back to stage coords for preview. */
function localToStage(
  lx: number,
  ly: number,
  image: CollageImage
): { x: number; y: number } {
  const ox = lx - image.width / 2;
  const oy = ly - image.height / 2;
  const sx = ox * image.scaleX;
  const sy = oy * image.scaleY;
  const rad = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: image.x + sx * cos - sy * sin,
    y: image.y + sx * sin + sy * cos,
  };
}

export function useMaskDrawer({ tool, targetImage, stageRef, onMaskComplete }: UseMaskDrawerProps) {
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);

  const isMaskTool = tool.startsWith('mask-');

  // Reset all drawing state when tool changes or target image changes
  useEffect(() => {
    setDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setPolygonPoints([]);
  }, [tool, targetImage?.id]);

  const getStagePointer = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(pos);
  }, [stageRef]);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!targetImage || !isMaskTool) return;

      const pt = getStagePointer();
      if (!pt) return;
      const local = stageToImageLocal(pt.x, pt.y, targetImage);

      if (tool === 'mask-polygon') {
        setPolygonPoints((prev) => [...prev, local]);
        setCurrentPoint(local);
        return;
      }

      // Circle / rect: start drag
      e.evt.preventDefault();
      setStartPoint(local);
      setCurrentPoint(local);
      setDrawing(true);
    },
    [tool, isMaskTool, targetImage, getStagePointer]
  );

  const handleMouseMove = useCallback(
    () => {
      if (!targetImage || !isMaskTool) return;
      const pt = getStagePointer();
      if (!pt) return;
      const local = stageToImageLocal(pt.x, pt.y, targetImage);

      if (tool === 'mask-polygon' && polygonPoints.length > 0) {
        setCurrentPoint(local);
        return;
      }

      if (!drawing || !startPoint) return;
      setCurrentPoint(local);
    },
    [tool, isMaskTool, targetImage, drawing, startPoint, getStagePointer, polygonPoints.length]
  );

  const handleMouseUp = useCallback(() => {
    if (!targetImage || !drawing || !startPoint || !currentPoint) return;
    if (tool === 'mask-polygon') return;

    if (tool === 'mask-circle') {
      const dx = currentPoint.x - startPoint.x;
      const dy = currentPoint.y - startPoint.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius > 5) {
        onMaskComplete(targetImage.id, {
          type: 'circle',
          cx: startPoint.x,
          cy: startPoint.y,
          radius,
        });
      }
    } else if (tool === 'mask-rect') {
      const w = Math.abs(currentPoint.x - startPoint.x);
      const h = Math.abs(currentPoint.y - startPoint.y);
      if (w > 5 && h > 5) {
        onMaskComplete(targetImage.id, {
          type: 'rect',
          x: Math.min(startPoint.x, currentPoint.x),
          y: Math.min(startPoint.y, currentPoint.y),
          width: w,
          height: h,
        });
      }
    }

    setDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [tool, targetImage, drawing, startPoint, currentPoint, onMaskComplete]);

  const handleDblClick = useCallback(() => {
    if (tool !== 'mask-polygon' || !targetImage || polygonPoints.length < 3) return;
    onMaskComplete(targetImage.id, {
      type: 'polygon',
      points: [...polygonPoints],
    });
    setPolygonPoints([]);
    setCurrentPoint(null);
  }, [tool, targetImage, polygonPoints, onMaskComplete]);

  // Build preview shape data (consumed by Canvas to render Konva shapes)
  const getPreview = useCallback((): {
    type: 'circle' | 'rect' | 'polygon';
    props: Record<string, unknown>;
  } | null => {
    if (!targetImage) return null;

    if ((tool === 'mask-circle' || tool === 'mask-rect') && drawing && startPoint && currentPoint) {
      if (tool === 'mask-circle') {
        const dx = currentPoint.x - startPoint.x;
        const dy = currentPoint.y - startPoint.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const center = localToStage(startPoint.x, startPoint.y, targetImage);
        const avgScale = (Math.abs(targetImage.scaleX) + Math.abs(targetImage.scaleY)) / 2;
        return {
          type: 'circle',
          props: { x: center.x, y: center.y, radius: radius * avgScale },
        };
      }
      if (tool === 'mask-rect') {
        const x = Math.min(startPoint.x, currentPoint.x);
        const y = Math.min(startPoint.y, currentPoint.y);
        const w = Math.abs(currentPoint.x - startPoint.x);
        const h = Math.abs(currentPoint.y - startPoint.y);
        const topLeft = localToStage(x, y, targetImage);
        return {
          type: 'rect',
          props: {
            x: topLeft.x,
            y: topLeft.y,
            width: w * Math.abs(targetImage.scaleX),
            height: h * Math.abs(targetImage.scaleY),
            rotation: targetImage.rotation,
          },
        };
      }
    }

    if (tool === 'mask-polygon' && polygonPoints.length > 0) {
      const stagePoints = polygonPoints.map((p) => localToStage(p.x, p.y, targetImage));
      const flatPoints = stagePoints.flatMap((p) => [p.x, p.y]);
      if (currentPoint) {
        const curStage = localToStage(currentPoint.x, currentPoint.y, targetImage);
        flatPoints.push(curStage.x, curStage.y);
      }
      return { type: 'polygon', props: { points: flatPoints } };
    }

    return null;
  }, [tool, targetImage, drawing, startPoint, currentPoint, polygonPoints]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDblClick,
    getPreview,
  };
}
