import { useEffect, useRef, useState } from 'react';
import { CollageText } from '../types';

interface Props {
  textObj: CollageText;
  stagePosition: { x: number; y: number };
  stageScale: number;
  onCommit: (id: string, text: string) => void;
  onCancel: () => void;
}

// Konva has no native text-editing UI, so the standard recipe is an
// absolutely-positioned HTML overlay shown only while editing — this stays
// axis-aligned (ignoring the object's own rotation) rather than trying to
// rotate a live <textarea>, which is the same trade-off most canvas editors
// make for editable text.
export function TextEditOverlay({ textObj, stagePosition, stageScale, onCommit, onCancel }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(textObj.text);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const screenWidth = Math.max(textObj.width * Math.abs(textObj.scaleX) * stageScale, 80);
  const screenHeight = Math.max(
    textObj.height * Math.abs(textObj.scaleY) * stageScale,
    textObj.fontSize * stageScale * 1.4
  );
  const centerX = textObj.x * stageScale + stagePosition.x;
  const centerY = textObj.y * stageScale + stagePosition.y;

  const commit = () => onCommit(textObj.id, value);

  return (
    <textarea
      ref={ref}
      className="text-edit-overlay"
      style={{
        position: 'absolute',
        left: centerX - screenWidth / 2,
        top: centerY - screenHeight / 2,
        width: screenWidth,
        height: screenHeight,
        fontFamily: textObj.fontFamily,
        fontSize: textObj.fontSize * stageScale,
        fontWeight: textObj.bold ? 700 : 400,
        fontStyle: textObj.italic ? 'italic' : 'normal',
        textDecoration: textObj.underline ? 'underline' : 'none',
        color: textObj.color,
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
