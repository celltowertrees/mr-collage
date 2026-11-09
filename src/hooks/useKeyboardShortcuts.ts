import { useEffect, useRef } from 'react';
import { Tool } from '../types';

interface Options {
  selectedIds: string[];
  setTool: (tool: Tool) => void;
  deleteImage: (ids: string[]) => void;
  nudgeImages: (ids: string[], dx: number, dy: number) => void;
  undo: () => void;
  redo: () => void;
  // Space held: pan from any tool without switching away from it.
  setSpacePanning: (held: boolean) => void;
  zoomBy: (factor: number) => void;
  zoomTo: (scale: number) => void;
  zoomToFit: () => void;
}

// App-wide shortcuts: tool keys, Delete, arrow nudges, hold Space to pan,
// zoom (Ctrl/Cmd +/-, Shift+1 fit, Shift+0 100%), and undo/redo. The selection is read through a ref so the listeners are bound
// once rather than torn down and re-added on every selection change.
export function useKeyboardShortcuts({
  selectedIds,
  setTool,
  deleteImage,
  nudgeImages,
  undo,
  redo,
  setSpacePanning,
  zoomBy,
  zoomTo,
  zoomToFit,
}: Options) {
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The text-edit overlay is a real <textarea> with its own native
      // undo/typing/Escape handling — let all of that through untouched
      // rather than hijacking it with app-level shortcuts below.
      if (e.target instanceof HTMLTextAreaElement) return;
      // A modal dialog owns the keyboard while it's open — Backspace or an
      // arrow key there shouldn't reach the canvas behind it.
      if (document.querySelector('[aria-modal="true"]')) return;

      // Undo/redo bypasses the input-element guard below: sliders/color
      // pickers keep focus after a drag — the most common moment a user
      // reaches for Ctrl+Z — and have no native text-undo of their own to
      // conflict with.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      // Zoom in/out, ahead of the input guard for the same reason as undo:
      // a slider keeps focus after a drag. preventDefault keeps the browser
      // from zooming the whole page instead.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomBy(2);
          return;
        }
        if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          zoomBy(0.5);
          return;
        }
      }

      if (e.target instanceof HTMLInputElement) return;

      // Matched on the physical key: with Shift held, e.key is "!" / ")".
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.code === 'Digit1') {
          e.preventDefault();
          zoomToFit();
          return;
        }
        if (e.code === 'Digit0') {
          e.preventDefault();
          zoomTo(1);
          return;
        }
      }

      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if (e.key === 't' || e.key === 'T') setTool('text');
      if (e.key === 'r' || e.key === 'R') setTool('rotate3d');
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length > 0) {
        deleteImage(selectedIdsRef.current);
      }
      if (e.key === ' ') {
        // Also keeps a focused toolbar button from being "clicked" by Space.
        e.preventDefault();
        setSpacePanning(true);
      }
      if (selectedIdsRef.current.length > 0) {
        const nudge = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[
          e.key
        ];
        if (nudge) {
          e.preventDefault();
          nudgeImages(selectedIdsRef.current, nudge[0], nudge[1]);
        }
      }
    };

    // Releasing Space just ends the borrowed pan — the tool never changed,
    // so there's nothing to switch back to.
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        if (!(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
          e.preventDefault();
        }
        setSpacePanning(false);
      }
    };
    // A keyup that lands in another window never arrives; don't leave the
    // canvas stuck panning.
    const handleBlur = () => setSpacePanning(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [nudgeImages, deleteImage, setTool, undo, redo, setSpacePanning, zoomBy, zoomTo, zoomToFit]);
}
