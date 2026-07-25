import { useRef, useCallback, useEffect } from 'react';
import Konva from 'konva';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { useCollage } from './hooks/useCollage';
import { useImageLoader } from './hooks/useImageLoader';
import { exportToICP } from './store';
import './App.css';

function App() {
  const {
    images,
    selectedIds,
    setSelectedIds,
    tool,
    setTool,
    stagePosition,
    setStagePosition,
    stageScale,
    setStageScale,
    addImage,
    updateImage,
    moveImages,
    nudgeImages,
    deleteImage,
    bringToFront,
    sendToBack,
    duplicateImage,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCollage();

  const stageRef = useRef<Konva.Stage>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { loadFromFiles, loadFromClipboard } = useImageLoader(addImage);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        loadFromFiles(e.target.files);
        e.target.value = '';
      }
    },
    [loadFromFiles]
  );

  const handleExportJPEG = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || images.length === 0) return;

    const layer = stage.getLayers()[0];
    const rect = layer.getClientRect({ relativeTo: stage });

    const pixelRatio = 2;
    const dataUrl = stage.toDataURL({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      pixelRatio,
      mimeType: 'image/jpeg',
      quality: 0.95,
    });

    const link = document.createElement('a');
    link.download = 'collage.jpg';
    link.href = dataUrl;
    link.click();
  }, [images]);

  const handleExportJSON = useCallback(() => {
    const data = exportToICP(images);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'collage-icp.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [images]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/redo bypasses the input-element guard below: this app has no
      // freeform text fields, so there's no native text-undo to conflict
      // with, and sliders/color pickers keep focus after a drag — the most
      // common moment a user reaches for Ctrl+Z.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (e.target instanceof HTMLInputElement) return;

      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        deleteImage(selectedIds);
      }
      if (e.key === ' ') {
        e.preventDefault();
        setTool('pan');
      }
      if (selectedIds.length > 0) {
        const nudge = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[
          e.key
        ];
        if (nudge) {
          e.preventDefault();
          nudgeImages(selectedIds, nudge[0], nudge[1]);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setTool('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedIds, nudgeImages, deleteImage, setTool, undo, redo]);

  useEffect(() => {
    const handleResize = () => {
      stageRef.current?.width(window.innerWidth);
      stageRef.current?.height(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const selectedImage = selectedIds.length === 1 ? images.find((img) => img.id === selectedIds[0]) ?? null : null;

  const handleClearMask = useCallback(
    (id: string) => {
      updateImage(id, { mask: undefined });
    },
    [updateImage]
  );

  // A dragged image moves the whole selection if it's part of one, so
  // dragging any selected image carries the rest of the group with it.
  const handleMoveSelected = useCallback(
    (draggedId: string, dx: number, dy: number) => {
      const ids = selectedIds.includes(draggedId) ? selectedIds : [draggedId];
      moveImages(ids, dx, dy);
    },
    [selectedIds, moveImages]
  );

  return (
    <div className="app">
      <Toolbar
        tool={tool}
        selectedImage={selectedImage}
        onToolChange={setTool}
        onUpload={handleUploadClick}
        onUpdateImage={updateImage}
        onDelete={deleteImage}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onBringToFront={bringToFront}
        onSendToBack={sendToBack}
        onDuplicate={duplicateImage}
        onClearMask={handleClearMask}
        onExportJPEG={handleExportJPEG}
        onExportJSON={handleExportJSON}
      />
      <Canvas
        images={images}
        selectedIds={selectedIds}
        tool={tool}
        stagePosition={stagePosition}
        stageScale={stageScale}
        onSelect={setSelectedIds}
        onUpdateImage={updateImage}
        onMoveSelected={handleMoveSelected}
        onStagePositionChange={setStagePosition}
        onStageScaleChange={setStageScale}
        onDrop={loadFromFiles}
        onPaste={loadFromClipboard}
        stageRef={stageRef}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {images.length === 0 && (
        <div className="empty-state">
          <p>Drop images here, paste from clipboard, or click upload</p>
          <p className="shortcut-hint">V = Select &middot; H = Pan &middot; Space = Hold to pan &middot; Scroll = Zoom</p>
        </div>
      )}
    </div>
  );
}

export default App;
