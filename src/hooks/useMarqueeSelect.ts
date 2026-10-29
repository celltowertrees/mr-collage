import { useCallback, useRef, useState } from 'react';
import Konva from 'konva';
import { CollageObject } from '../types';
import type { PointerToolHandlers } from './pointerTool';

type MarqueeRect = { x: number; y: number; width: number; height: number };

// Minimum drag distance (in screen px) before a mousedown-drag-mouseup on
// empty canvas counts as a marquee rather than a plain click-to-deselect.
const MARQUEE_DRAG_THRESHOLD = 3;

interface Options {
  active: boolean;
  images: CollageObject[];
  stageRef: React.RefObject<Konva.Stage | null>;
  toContentPoint: (pointer: { x: number; y: number }) => { x: number; y: number };
  onSelect: (ids: string[]) => void;
  // Set when a marquee completes, so the stage `click` Konva fires right after
  // its mouseup doesn't immediately clear the selection it just made.
  suppressNextClickRef: React.MutableRefObject<boolean>;
}

// Drag a box over empty canvas to select every object it touches.
export function useMarqueeSelect({
  active,
  images,
  stageRef,
  toContentPoint,
  onSelect,
  suppressNextClickRef,
}: Options): PointerToolHandlers & { marqueeRect: MarqueeRect | null } {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (active && stage && e.target === stage) {
        const pointer = stage.getPointerPosition();
        if (pointer) startRef.current = pointer;
      }
    },
    [active, stageRef]
  );

  const handleMouseMove = useCallback(() => {
    const stage = stageRef.current;
    if (!startRef.current || !stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const start = toContentPoint(startRef.current);
    const current = toContentPoint(pointer);
    setMarqueeRect({
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    });
  }, [stageRef, toContentPoint]);

  const handleMouseUp = useCallback(() => {
    const start = startRef.current;
    startRef.current = null;
    setMarqueeRect(null);
    if (!start) return;

    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    const dragDistance = Math.hypot(pointer.x - start.x, pointer.y - start.y);
    if (dragDistance < MARQUEE_DRAG_THRESHOLD) return; // a plain click; the stage click handler deselects

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
  }, [stageRef, toContentPoint, images, onSelect, suppressNextClickRef]);

  return { handleMouseDown, handleMouseMove, handleMouseUp, marqueeRect };
}
