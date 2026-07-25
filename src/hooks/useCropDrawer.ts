import { useState, useCallback, useEffect } from 'react';
import Konva from 'konva';
import { CollageImage, CropRect } from '../types';
import { stageToImageLocal, localToStage } from '../utils/geometry';

interface UseCropDrawerProps {
  active: boolean;
  targetImage: CollageImage | null;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function useCropDrawer({ active, targetImage, stageRef }: UseCropDrawerProps) {
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  // The last confirmed drag, in the target image's current local space —
  // clamped to its bounds. Cleared whenever crop mode is (re-)entered or the
  // selected image changes, so a stale rect never leaks into a new session.
  const [committedRect, setCommittedRect] = useState<CropRect | null>(null);

  useEffect(() => {
    setDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setCommittedRect(null);
  }, [active, targetImage?.id]);

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
      if (!targetImage || !active) return;
      const pt = getStagePointer();
      if (!pt) return;
      e.evt.preventDefault();
      const local = stageToImageLocal(pt.x, pt.y, targetImage);
      setStartPoint(local);
      setCurrentPoint(local);
      setDrawing(true);
    },
    [active, targetImage, getStagePointer]
  );

  const handleMouseMove = useCallback(() => {
    if (!targetImage || !active || !drawing || !startPoint) return;
    const pt = getStagePointer();
    if (!pt) return;
    setCurrentPoint(stageToImageLocal(pt.x, pt.y, targetImage));
  }, [active, targetImage, drawing, startPoint, getStagePointer]);

  const handleMouseUp = useCallback(() => {
    if (!targetImage || !drawing || !startPoint || !currentPoint) return;
    setDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);

    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);
    if (width <= 5 || height <= 5) return;

    // Clamp to the image's current local bounds — the crop box can't extend
    // past pixels that aren't currently displayed.
    const clampedX = Math.max(0, x);
    const clampedY = Math.max(0, y);
    const clampedWidth = Math.min(width - (clampedX - x), targetImage.width - clampedX);
    const clampedHeight = Math.min(height - (clampedY - y), targetImage.height - clampedY);
    if (clampedWidth <= 5 || clampedHeight <= 5) return;

    setCommittedRect({ x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight });
  }, [targetImage, drawing, startPoint, currentPoint]);

  const getPreviewRect = useCallback((): {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
  } | null => {
    if (!targetImage) return null;

    const local =
      drawing && startPoint && currentPoint
        ? {
            x: Math.min(startPoint.x, currentPoint.x),
            y: Math.min(startPoint.y, currentPoint.y),
            width: Math.abs(currentPoint.x - startPoint.x),
            height: Math.abs(currentPoint.y - startPoint.y),
          }
        : committedRect;
    if (!local) return null;

    const topLeft = localToStage(local.x, local.y, targetImage);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: local.width * Math.abs(targetImage.scaleX),
      height: local.height * Math.abs(targetImage.scaleY),
      rotation: targetImage.rotation,
    };
  }, [targetImage, drawing, startPoint, currentPoint, committedRect]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getPreviewRect,
    committedRect,
  };
}
