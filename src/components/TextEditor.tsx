import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { CollageText } from '../types';

export interface TextEditorHandle {
  // Moves the caret to `index`, or with `extend` stretches the selection
  // from where the last placement started.
  place: (index: number, extend: boolean) => void;
}

interface Props {
  textObj: CollageText;
  stagePosition: { x: number; y: number };
  stageScale: number;
  // Where the caret starts: an index, or the whole text selected.
  initialSelection: { start: number; end: number };
  onTextChange: (text: string) => void;
  onSelectionChange: (start: number, end: number) => void;
  onFinish: () => void;
}

// Typing happens on the canvas: the text object itself updates on every
// keystroke and the caret is drawn there (see TextCaret). This invisible
// textarea is only the keyboard's target — it keeps typing, paste, IME
// composition, arrow keys and shift-selection native — and it sits over the
// object so the browser's own IME and on-screen keyboard popups appear there.
export const TextEditor = forwardRef<TextEditorHandle, Props>(function TextEditor(
  { textObj, stagePosition, stageScale, initialSelection, onTextChange, onSelectionChange, onFinish },
  ref
) {
  const area = useRef<HTMLTextAreaElement>(null);
  const anchor = useRef(initialSelection.start);
  // Reading the latest callback from a ref lets the listeners below be
  // attached once.
  const report = useRef(onSelectionChange);
  report.current = onSelectionChange;

  const sync = () => {
    const el = area.current;
    if (el) report.current(el.selectionStart, el.selectionEnd);
  };

  useImperativeHandle(ref, () => ({
    place: (index, extend) => {
      const el = area.current;
      if (!el) return;
      if (!extend) anchor.current = index;
      const start = Math.min(anchor.current, index);
      const end = Math.max(anchor.current, index);
      el.focus();
      el.setSelectionRange(start, end, index < anchor.current ? 'backward' : 'forward');
      sync();
    },
  }));

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(initialSelection.start, initialSelection.end);
    anchor.current = initialSelection.start;
    sync();
    // The caret position the browser settles on after arrow keys, clicks and
    // shift-selection only shows up in selectionchange.
    const onSelect = () => {
      if (document.activeElement === el) sync();
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
    // Only on opening; later placements go through `place`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <textarea
      ref={area}
      className="text-edit-overlay"
      aria-label="Edit text"
      spellCheck={false}
      style={{
        left: textObj.x * stageScale + stagePosition.x,
        top: textObj.y * stageScale + stagePosition.y,
      }}
      value={textObj.text}
      onChange={(e) => {
        onTextChange(e.target.value);
        sync();
      }}
      onSelect={sync}
      onBlur={onFinish}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          onFinish();
        }
        // Enter on its own falls through: a new line, as in any editor.
      }}
    />
  );
});
