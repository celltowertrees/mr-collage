import { useCallback } from 'react';
import Konva from 'konva';

export function useStagePointer(stageRef: React.RefObject<Konva.Stage | null>) {
  return useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    const transform = stage.getAbsoluteTransform().copy().invert();
    return transform.point(pos);
  }, [stageRef]);
}
