import { useRef, useState, useCallback } from 'react';
import Konva from 'konva';

export interface BgRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseBgRectDrawerOptions {
  active: boolean;
  stageRef: React.RefObject<Konva.Stage | null>;
  onComplete: (rect: BgRect) => void;
}

const MIN_SIZE = 20;

export function useBgRectDrawer({ active, stageRef, onComplete }: UseBgRectDrawerOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<BgRect | null>(null);

  const toContent = (pointer: { x: number; y: number }) => {
    const stage = stageRef.current;
    if (!stage) return pointer;
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  };

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!active) return;
      const stage = stageRef.current;
      const pointer = stage?.getPointerPosition();
      if (!pointer) return;
      e.cancelBubble = true;
      startRef.current = toContent(pointer);
      setPreviewRect(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, stageRef]
  );

  const handleMouseMove = useCallback(() => {
    if (!active || !startRef.current) return;
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const start = startRef.current;
    const cur = toContent(pointer);
    setPreviewRect({
      x: Math.min(start.x, cur.x),
      y: Math.min(start.y, cur.y),
      width: Math.abs(cur.x - start.x),
      height: Math.abs(cur.y - start.y),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stageRef]);

  const handleMouseUp = useCallback(() => {
    if (!active || !startRef.current) return;
    const start = startRef.current;
    startRef.current = null;
    setPreviewRect(null);

    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    const cur = toContent(pointer);
    const rect: BgRect = {
      x: Math.min(start.x, cur.x),
      y: Math.min(start.y, cur.y),
      width: Math.abs(cur.x - start.x),
      height: Math.abs(cur.y - start.y),
    };
    if (rect.width > MIN_SIZE && rect.height > MIN_SIZE) {
      onComplete(rect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stageRef, onComplete]);

  return { handleMouseDown, handleMouseMove, handleMouseUp, previewRect };
}
