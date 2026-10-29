import { useCallback, useState } from 'react';
import { parseICP, ICPImportError, type ParsedICP } from '../store';
import { CollageObject } from '../types';

type Viewport = { stagePosition: { x: number; y: number }; stageScale: number };

interface Options {
  hasObjects: boolean;
  importObjects: (incoming: CollageObject[], mode: 'add' | 'replace', viewport?: Viewport) => void;
}

// Picking an ICP JSON file, then (if the canvas isn't empty) asking whether
// to add it or replace the canvas — or explaining why it couldn't be read.
export function useImportFlow({ hasObjects, importObjects }: Options) {
  const [pendingImport, setPendingImport] = useState<(ParsedICP & { fileName: string }) | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // The picker is a detached <input>, not one rendered into the page: the
  // image upload input is the page's only file input, and keeping it that way
  // keeps it unambiguous.
  const handleImportJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = parseICP(await file.text());
        if (parsed.objects.length === 0) {
          setImportError(`${file.name} doesn't contain any objects.`);
        } else if (!hasObjects) {
          // Nothing on the canvas to keep, so there's nothing to ask about.
          importObjects(parsed.objects, 'replace', parsed.viewport);
        } else {
          setPendingImport({ ...parsed, fileName: file.name });
        }
      } catch (err) {
        setImportError(
          err instanceof ICPImportError ? err.message : `Couldn't read ${file.name}.`
        );
      }
    };
    input.click();
  }, [hasObjects, importObjects]);

  const handleImportChoice = useCallback(
    (mode: 'add' | 'replace') => {
      if (!pendingImport) return;
      importObjects(pendingImport.objects, mode, pendingImport.viewport);
      setPendingImport(null);
    },
    [pendingImport, importObjects]
  );
  const handleImportAdd = useCallback(() => handleImportChoice('add'), [handleImportChoice]);
  const handleImportReplace = useCallback(() => handleImportChoice('replace'), [handleImportChoice]);
  const handleImportCancel = useCallback(() => setPendingImport(null), []);
  const handleImportErrorClose = useCallback(() => setImportError(null), []);

  return {
    pendingImport,
    importError,
    handleImportJSON,
    handleImportAdd,
    handleImportReplace,
    handleImportCancel,
    handleImportErrorClose,
  };
}
