import { useCallback } from 'react';

export function useImageLoader(onLoad: (src: string, name: string, w: number, h: number) => void) {
  const loadFromFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => onLoad(dataUrl, file.name, img.naturalWidth, img.naturalHeight);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [onLoad]);

  const loadFromFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(loadFromFile);
  }, [loadFromFile]);

  const loadFromClipboard = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) loadFromFile(file);
      }
    }
  }, [loadFromFile]);

  return { loadFromFile, loadFromFiles, loadFromClipboard };
}
