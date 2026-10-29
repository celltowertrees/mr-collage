import { useCallback, useEffect, useRef, useState } from 'react';

// A toolbar button that drops a menu beneath it, closed by picking an option,
// clicking the button again, or clicking anywhere else. Shared by the blend
// mode, 3D shape and texture pickers.
export function usePopupMenu() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && !buttonRef.current?.contains(target)) {
        setPos(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [pos]);

  // Opens the menu under its button, or closes it if it's already open.
  // Returns whether it's now open.
  const toggle = useCallback((): boolean => {
    if (pos) {
      setPos(null);
      return false;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    return true;
  }, [pos]);

  const close = useCallback(() => setPos(null), []);

  return { pos, menuRef, buttonRef, toggle, close };
}
