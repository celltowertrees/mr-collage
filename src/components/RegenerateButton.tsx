import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Konva from 'konva';

interface Props {
  // The generated image to offer regenerating, or null for none.
  targetId: string | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  onRegenerate: (id: string) => void;
}

// A single selected AI-generated image gets a regenerate button hung off the
// bottom-right corner of its on-screen box. It's HTML rather than a Konva
// shape so it's a real, focusable button; its position is read back from the
// node itself, after every render (the node may mount late, while its image
// loads) and on every frame of a drag, resize, pan or zoom.
export function RegenerateButton({ targetId, stageRef, onRegenerate }: Props) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  // The last anchor handed to React. This runs after EVERY render, and a
  // setState there — even one whose updater returns the same value — can
  // schedule another render, which runs this again: an infinite loop. So
  // setState is only called when the anchor genuinely moved.
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const update = useCallback(() => {
    const node = targetId ? stageRef.current?.findOne(`#${targetId}`) : null;
    let next: { x: number; y: number } | null = null;
    if (node) {
      const box = node.getClientRect({ skipShadow: true });
      next = { x: box.x + box.width, y: box.y + box.height };
    }
    const prev = anchorRef.current;
    if (prev === next || (prev && next && prev.x === next.x && prev.y === next.y)) return;
    anchorRef.current = next;
    setAnchor(next);
  }, [targetId, stageRef]);
  useLayoutEffect(update);

  // Drag and transform events bubble from the node to the stage, and a pan
  // or wheel zoom changes the stage's own position/scale attributes — so
  // these stage listeners cover every way the selection moves on screen
  // mid-gesture.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !targetId) return;
    stage.on('dragmove.regen transform.regen xChange.regen yChange.regen scaleXChange.regen', update);
    return () => {
      stage.off('.regen');
    };
  }, [targetId, update, stageRef]);

  if (!targetId || !anchor) return null;
  return (
    <button
      className="regenerate-btn"
      style={{ left: anchor.x, top: anchor.y }}
      onClick={() => onRegenerate(targetId)}
      title="Edit prompt and regenerate"
      aria-label="Regenerate from prompt"
    >
      ✦ Regenerate
    </button>
  );
}
