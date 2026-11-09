import { useEffect, useState } from 'react';
import { Group, Line } from 'react-konva';
import { CollageText } from '../types';
import type { WordArtLayout } from '../utils/wordArt';

interface Props {
  textObj: CollageText;
  layout: WordArtLayout;
  selectionStart: number;
  selectionEnd: number;
}

const CARET_COLOR = '#2563eb';
const SELECTION_FILL = 'rgba(37, 99, 235, 0.28)';
const BLINK_MS = 530;

// The caret and selection highlight for the text being edited, drawn on the
// canvas in the text's own frame — so they turn, flip, scale and bend with
// the letters, warps included. Positions come from the same layout the
// letters are drawn from.
export function TextCaret({ textObj, layout, selectionStart, selectionEnd }: Props) {
  const [on, setOn] = useState(true);
  // Solid while the caret moves, blinking once it rests.
  useEffect(() => {
    setOn(true);
    const timer = window.setInterval(() => setOn((v) => !v), BLINK_MS);
    return () => window.clearInterval(timer);
  }, [selectionStart, selectionEnd, layout]);

  const flipX = textObj.flipX ? -1 : 1;
  const flipY = textObj.flipY ? -1 : 1;
  const collapsed = selectionStart === selectionEnd;
  const caret = layout.caretAt(selectionEnd);
  const lo = Math.min(selectionStart, selectionEnd);
  const hi = Math.max(selectionStart, selectionEnd);

  return (
    <Group
      listening={false}
      x={textObj.x}
      y={textObj.y}
      offsetX={textObj.width / 2}
      offsetY={textObj.height / 2}
      scaleX={textObj.scaleX * flipX}
      scaleY={textObj.scaleY * flipY}
      rotation={textObj.rotation}
    >
      {!collapsed &&
        layout.glyphs
          .filter((g) => g.index >= lo && g.index < hi)
          .map((g) => (
            <Line
              key={g.index}
              points={layout.glyphQuad(g).flatMap((p) => [p.x, p.y])}
              closed
              fill={SELECTION_FILL}
            />
          ))}
      {collapsed && (
        <Line
          name="text-caret"
          points={[caret.top.x, caret.top.y, caret.bottom.x, caret.bottom.y]}
          stroke={CARET_COLOR}
          strokeWidth={2}
          strokeScaleEnabled={false}
          lineCap="round"
          // Opacity rather than visibility, so the caret keeps its place in
          // the scene graph (and its on-screen box) between blinks.
          opacity={on ? 1 : 0}
        />
      )}
    </Group>
  );
}
