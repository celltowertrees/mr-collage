import { useState, useCallback, useEffect } from 'react';
import Konva from 'konva';
import { GradientMask, CollageImage } from '../types';
import { stageToImageLocal, localToStage } from '../utils/geometry';

interface UseGradientMaskDrawerProps {
  active: boolean;
  targetImage: CollageImage | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  onChange: (imageId: string, gradientMask: GradientMask) => void;
}

export function useGradientMaskDrawer({
  active,
  targetImage,
  stageRef,
  onChange,
}: UseGradientMaskDrawerProps) {
  const [drawing, setDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);

  // Reset in-progress drawing when the tool is toggled off or the selected
  // image changes — an existing gradientMask on the image is left alone,
  // since it's edited afterward via its own handles, not by redrawing here.
  useEffect(() => {
    setDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
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
      // A gradient line is only drawn from scratch when the image doesn't
      // already have one — once it exists, its own draggable endpoint
      // handles are how it gets adjusted (see getHandles/handleHandleDrag).
      if (!targetImage || !active || targetImage.gradientMask) return;
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

    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    if (Math.hypot(dx, dy) < 5) return;

    onChange(targetImage.id, { start: startPoint, end: currentPoint });
  }, [targetImage, drawing, startPoint, currentPoint, onChange]);

  const getPreviewLine = useCallback((): { points: number[] } | null => {
    if (!targetImage || !drawing || !startPoint || !currentPoint) return null;
    const a = localToStage(startPoint.x, startPoint.y, targetImage);
    const b = localToStage(currentPoint.x, currentPoint.y, targetImage);
    return { points: [a.x, a.y, b.x, b.y] };
  }, [targetImage, drawing, startPoint, currentPoint]);

  const getHandles = useCallback((): {
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null => {
    if (!targetImage || !active || !targetImage.gradientMask) return null;
    return {
      start: localToStage(targetImage.gradientMask.start.x, targetImage.gradientMask.start.y, targetImage),
      end: localToStage(targetImage.gradientMask.end.x, targetImage.gradientMask.end.y, targetImage),
    };
  }, [targetImage, active]);

  const handleHandleDrag = useCallback(
    (which: 'start' | 'end', stagePoint: { x: number; y: number }) => {
      if (!targetImage || !targetImage.gradientMask) return;
      const local = stageToImageLocal(stagePoint.x, stagePoint.y, targetImage);
      const g = targetImage.gradientMask;
      onChange(targetImage.id, which === 'start' ? { ...g, start: local } : { ...g, end: local });
    },
    [targetImage, onChange]
  );

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    getPreviewLine,
    getHandles,
    handleHandleDrag,
  };
}
