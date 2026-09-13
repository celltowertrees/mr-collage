import { useCallback, useEffect, useRef } from 'react';
import Konva from 'konva';
import { CollageObject, Rotation3D } from '../types';

// Screen pixels to degrees. Half a degree per pixel means a ~360px drag turns
// the object most of the way around, which feels close to direct manipulation
// without making small corrections twitchy.
const DEGREES_PER_PIXEL = 0.5;

interface UseModel3DRotatorProps {
  active: boolean;
  targetImage: CollageObject | null;
  onChange: (id: string, rotation3D: Rotation3D) => void;
}

/**
 * Orbit-drag for 3D objects: horizontal drag yaws, vertical drag pitches, and
 * holding shift rolls instead of yawing.
 *
 * Deltas are taken in raw screen pixels rather than content coordinates — the
 * gesture is "how far did the pointer travel", which shouldn't change meaning
 * with the canvas zoom level the way a mask outline (drawn in the object's own
 * space) has to.
 */
export function useModel3DRotator({ active, targetImage, onChange }: UseModel3DRotatorProps) {
  const dragRef = useRef<{ id: string; startX: number; startY: number; from: Rotation3D } | null>(null);

  const model = targetImage?.kind === 'model3d' ? targetImage : null;

  useEffect(() => {
    dragRef.current = null;
  }, [active, targetImage?.id]);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!active || !model) return;
      e.evt.preventDefault();
      dragRef.current = {
        id: model.id,
        startX: e.evt.clientX,
        startY: e.evt.clientY,
        from: { ...model.rotation3D },
      };
    },
    [active, model]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const drag = dragRef.current;
      if (!active || !drag) return;
      const dx = (e.evt.clientX - drag.startX) * DEGREES_PER_PIXEL;
      const dy = (e.evt.clientY - drag.startY) * DEGREES_PER_PIXEL;
      const next: Rotation3D = e.evt.shiftKey
        ? { x: drag.from.x, y: drag.from.y, z: drag.from.z + dx }
        : { x: drag.from.x + dy, y: drag.from.y + dx, z: drag.from.z };
      onChange(drag.id, next);
    },
    [active, onChange]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return { isRotating: dragRef.current !== null, handleMouseDown, handleMouseMove, handleMouseUp };
}
