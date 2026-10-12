import { useCallback, useEffect, useRef } from 'react';
import { Circle, Ellipse, Group } from 'react-konva';
import Konva from 'konva';
import { CollageModel3D, Rotation3D } from '../types';

type Axis = 'x' | 'y' | 'z';

// Ring radii as a fraction of the object's half-size. The three are kept well
// apart from each other and from the Transformer's resize anchors (which sit
// on the box edge, at 1.0) so every ring has its own uncontested band of
// canvas to be grabbed in.
const GIZMO_ROLL_RATIO = 0.8;
const GIZMO_RING_RATIO = 0.58;
// How flat the yaw/pitch ellipses are drawn. They read as rings seen almost
// edge-on, which is what tells the user which way each one turns.
const GIZMO_FLATTEN = 0.3;

// Screen pixels to degrees for the yaw and pitch rings, matching the free
// orbit tool's feel: a ~360px drag turns the object most of the way around.
const DEGREES_PER_PIXEL = 0.5;

// Shift-drag snaps to this increment, which is what replaces typing an exact
// angle into a number field.
const SNAP_DEGREES = 15;

// Konva paints to a bitmap, not the DOM, so it can't read theme.css custom
// properties — these follow the same hardcoded-colour convention the other
// canvas overlays (mask, crop, gradient previews) already use. Red/green/blue
// for X/Y/Z is the near-universal 3D convention.
const AXIS_COLORS: Record<Axis, string> = {
  x: '#ff5a5a',
  y: '#4ade80',
  z: '#60a5fa',
};

const STROKE_SCREEN_PX = 2.5;
const HALO_SCREEN_PX = 5;
// Generous compared to the drawn line: these are thin ellipses, and a ring you
// have to hit within a couple of pixels is worse than no ring at all.
const HIT_SCREEN_PX = 20;

interface Props {
  model: CollageModel3D;
  stageScale: number;
  stageRef: React.RefObject<Konva.Stage | null>;
  onChange: (id: string, rotation3D: Rotation3D) => void;
  // Called as a ring drag begins, so the Canvas can swallow the `click` that
  // will close the gesture — when the drag ends off the object that click
  // lands on the stage and would otherwise clear the very selection the gizmo
  // belongs to. It has to be flagged up front: Konva synthesises its click
  // inside the same mouseup listener this component's own handler runs after.
  onGestureStart: () => void;
}

const normalize = (deg: number) => ((deg + 180) % 360 + 360) % 360 - 180;

/**
 * The grab-and-turn rotation handles drawn over a selected 3D object: a flat
 * horizontal ring for yaw, a flat vertical one for pitch, and an outer circle
 * for roll.
 *
 * Yaw and pitch track raw screen travel (drag right to turn right, drag down
 * to tip forward), while roll tracks the pointer's angle about the object's
 * centre, so dragging the outer ring around really does wind the object round
 * with it. Every drag reports `coalesce`-style updates through `onChange`, so
 * the whole gesture collapses into one undo step.
 */
export function Model3DRotationGizmo({ model, stageScale, stageRef, onChange, onGestureStart }: Props) {
  const dragRef = useRef<{
    axis: Axis;
    startX: number;
    startY: number;
    from: Rotation3D;
    // Roll only: the pointer's angle at grab time, and the turn accumulated
    // so far, so a sweep past the ±180° seam keeps winding instead of jumping.
    lastAngle: number;
    turned: number;
  } | null>(null);

  // The gizmo is drawn unscaled inside a scaled layer, so anything that should
  // stay a constant thickness on screen has to be divided back out.
  const px = (screen: number) => screen / stageScale;

  const half = Math.max(model.width * Math.abs(model.scaleX), model.height * Math.abs(model.scaleY)) / 2;
  const rollRadius = half * GIZMO_ROLL_RATIO;
  const ringRadius = half * GIZMO_RING_RATIO;
  const flat = ringRadius * GIZMO_FLATTEN;

  // Object centre in client coordinates — needed to measure the pointer's
  // angle for a roll drag.
  const centerClient = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const point = stage.getAbsoluteTransform().point({ x: model.x, y: model.y });
    const rect = stage.container().getBoundingClientRect();
    return { x: rect.left + point.x, y: rect.top + point.y };
  }, [model.x, model.y, stageRef]);

  const beginDrag = (axis: Axis) => (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Keep the grab off the stage: otherwise the free-orbit tool would start
    // its own rotation underneath, and the same drag would turn twice.
    e.cancelBubble = true;
    e.evt.preventDefault();
    onGestureStart();
    const center = centerClient();
    dragRef.current = {
      axis,
      startX: e.evt.clientX,
      startY: e.evt.clientY,
      from: { ...model.rotation3D },
      lastAngle: center
        ? (Math.atan2(e.evt.clientY - center.y, e.evt.clientX - center.x) * 180) / Math.PI
        : 0,
      turned: 0,
    };
  };

  useEffect(() => {
    const handleMove = (evt: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      let delta: number;
      if (drag.axis === 'z') {
        const center = centerClient();
        if (!center) return;
        const angle = (Math.atan2(evt.clientY - center.y, evt.clientX - center.x) * 180) / Math.PI;
        drag.turned += normalize(angle - drag.lastAngle);
        drag.lastAngle = angle;
        delta = drag.turned;
      } else if (drag.axis === 'y') {
        delta = (evt.clientX - drag.startX) * DEGREES_PER_PIXEL;
      } else {
        delta = (evt.clientY - drag.startY) * DEGREES_PER_PIXEL;
      }

      let value = drag.from[drag.axis] + delta;
      if (evt.shiftKey) value = Math.round(value / SNAP_DEGREES) * SNAP_DEGREES;

      onChange(model.id, { ...drag.from, [drag.axis]: value });
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [centerClient, model.id, onChange]);

  // A drag in progress is keyed to the object it started on; changing the
  // selection mid-gesture would otherwise keep writing to the old one.
  useEffect(() => {
    dragRef.current = null;
  }, [model.id]);

  const setCursor = (cursor: string) => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = cursor;
  };

  const ringProps = (axis: Axis) => ({
    // A dark halo under the coloured line keeps the ring readable over a pale
    // object as well as a dark one.
    stroke: AXIS_COLORS[axis],
    strokeWidth: px(STROKE_SCREEN_PX),
    shadowColor: 'rgba(0, 0, 0, 0.55)',
    shadowBlur: px(HALO_SCREEN_PX),
    shadowOpacity: 1,
    hitStrokeWidth: px(HIT_SCREEN_PX),
    fillEnabled: false,
    onMouseDown: beginDrag(axis),
    onMouseEnter: () => setCursor('grab'),
    onMouseLeave: () => setCursor('default'),
  });

  return (
    <Group
      name="model3d-gizmo"
      x={model.x}
      y={model.y}
      rotation={model.rotation}
      listening
    >
      <Circle name="gizmo-ring-roll" radius={rollRadius} {...ringProps('z')} />
      <Ellipse name="gizmo-ring-yaw" radiusX={ringRadius} radiusY={flat} {...ringProps('y')} />
      <Ellipse name="gizmo-ring-pitch" radiusX={flat} radiusY={ringRadius} {...ringProps('x')} />
    </Group>
  );
}
