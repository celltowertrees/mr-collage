import { useRef, useCallback, useEffect, useState } from 'react';
import Konva from 'konva';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { TextEditOverlay } from './components/TextEditOverlay';
import { StickerGenerator } from './components/StickerGenerator';
import { ImportChoiceDialog, ImportErrorDialog } from './components/ImportDialog';
import { useCollage } from './hooks/useCollage';
import { useImageLoader } from './hooks/useImageLoader';
import { useCropDrawer } from './hooks/useCropDrawer';
import { useBackgroundGeneration } from './hooks/useBackgroundGeneration';
import { useExports } from './hooks/useExports';
import { useImportFlow } from './hooks/useImportFlow';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { BgPromptEditPanel, BgStatusPanel } from './components/BackgroundStatus';
import { localToStage } from './utils/geometry';
import { CollageText } from './types';
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
    addBackground,
    addText,
    addModel3D,
    updateImage,
    regenerateImage,
    moveImages,
    nudgeImages,
    deleteImage,
    bringToFront,
    sendToBack,
    duplicateImage,
    importObjects,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCollage();

  const stageRef = useRef<Konva.Stage>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [stickerGeneratorOpen, setStickerGeneratorOpen] = useState(false);
  // The generated image the sticker dialog is regenerating, if any.
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const { loadFromFiles, loadFromClipboard } = useImageLoader(addImage);

  const regeneratingObj = regeneratingId ? images.find((obj) => obj.id === regeneratingId) : undefined;
  const regenerating =
    regeneratingObj?.kind === 'image' && regeneratingObj.generation
      ? { id: regeneratingObj.id, generation: regeneratingObj.generation }
      : null;

  const selectedImage = selectedIds.length === 1 ? images.find((img) => img.id === selectedIds[0]) ?? null : null;
  // The crop tool only ever targets images — narrow here so useCropDrawer
  // (typed for CollageImage) never sees anything else. Checked positively:
  // `kind !== 'text'` would quietly let every new object kind through.
  const selectedImageOnly = selectedImage?.kind === 'image' ? selectedImage : null;
  const editingText: CollageText | null =
    (images.find((obj): obj is CollageText => obj.kind === 'text' && obj.id === editingTextId) ?? null);

  const bg = useBackgroundGeneration({ images, tool, setTool, stageRef, addBackground });
  const { handleExportJPEG, handleExportPNGs, handleExportJSON, handleExportHTML } = useExports({
    stageRef,
    images,
    selectedIds,
    stagePosition,
    stageScale,
  });
  const importFlow = useImportFlow({ hasObjects: images.length > 0, importObjects });

  const cropDrawer = useCropDrawer({
    active: tool === 'crop',
    targetImage: selectedImageOnly,
    stageRef,
  });

  const applyCrop = useCallback(() => {
    if (!selectedImageOnly || !cropDrawer.committedRect) return;
    const rect = cropDrawer.committedRect;
    const prevCrop = selectedImageOnly.crop ?? {
      x: 0,
      y: 0,
      width: selectedImageOnly.width,
      height: selectedImageOnly.height,
    };
    const center = localToStage(rect.x + rect.width / 2, rect.y + rect.height / 2, selectedImageOnly);
    updateImage(selectedImageOnly.id, {
      x: center.x,
      y: center.y,
      width: rect.width,
      height: rect.height,
      crop: { x: prevCrop.x + rect.x, y: prevCrop.y + rect.y, width: rect.width, height: rect.height },
    });
    setTool('select');
  }, [selectedImageOnly, cropDrawer.committedRect, updateImage, setTool]);

  const cancelCrop = useCallback(() => {
    setTool('select');
  }, [setTool]);

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

  useKeyboardShortcuts({ selectedIds, setTool, deleteImage, nudgeImages, undo, redo });

  useEffect(() => {
    const handleResize = () => {
      stageRef.current?.width(window.innerWidth);
      stageRef.current?.height(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleClearMask = useCallback(
    (id: string) => {
      updateImage(id, { mask: undefined });
    },
    [updateImage]
  );

  const handleClearGradient = useCallback(
    (id: string) => {
      updateImage(id, { gradientMask: undefined });
    },
    [updateImage]
  );

  // A dragged image moves the whole selection if it's part of one, so
  // dragging any selected image carries the rest of the group with it.
  // Reads the selection through a ref so this stays one stable function —
  // it's handed to every canvas node, and a new identity on each selection
  // change would re-render all of them.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const handleMoveSelected = useCallback(
    (draggedId: string, dx: number, dy: number) => {
      const current = selectedIdsRef.current;
      const ids = current.includes(draggedId) ? current : [draggedId];
      moveImages(ids, dx, dy);
    },
    [moveImages]
  );

  // Placing text with the Text tool is a single click: create it, switch
  // back to Select so the formatting toolbar shows up right away, and open
  // it for editing immediately.
  const handleAddText = useCallback(
    (point: { x: number; y: number }) => {
      const id = addText(point);
      setTool('select');
      setEditingTextId(id);
    },
    [addText, setTool]
  );

  const handleCommitTextEdit = useCallback(
    (id: string, text: string) => {
      updateImage(id, { text });
      setEditingTextId(null);
    },
    [updateImage]
  );

  const handleCancelTextEdit = useCallback(() => {
    setEditingTextId(null);
  }, []);

  return (
    <div className="app">
      <Toolbar
        tool={tool}
        selectedImage={selectedImage}
        onToolChange={setTool}
        onUpload={handleUploadClick}
        onAddModel3D={addModel3D}
        onOpenStickerGenerator={() => setStickerGeneratorOpen(true)}
        visionDetail={bg.visionDetail}
        onVisionDetailChange={bg.setVisionDetail}
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
        onClearGradient={handleClearGradient}
        onExportJPEG={handleExportJPEG}
        onExportJSON={handleExportJSON}
        onExportHTML={handleExportHTML}
        onExportPNGs={handleExportPNGs}
        hasSelection={selectedIds.length > 0}
        onImportJSON={importFlow.handleImportJSON}
        hasPendingCrop={cropDrawer.committedRect !== null}
        onApplyCrop={applyCrop}
        onCancelCrop={cancelCrop}
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
        onAddText={handleAddText}
        onStartEditingText={setEditingTextId}
        stageRef={stageRef}
        cropDrawer={cropDrawer}
        cropPreviewRect={cropDrawer.getPreviewRect()}
        bgRectDrawer={bg.bgRectDrawer}
        bgRectPreview={bg.bgRectDrawer.previewRect}
        bgLoadingRect={bg.bgLoading}
        onRegenerate={setRegeneratingId}
      />
      {editingText && (
        <TextEditOverlay
          textObj={editingText}
          stagePosition={stagePosition}
          stageScale={stageScale}
          onCommit={handleCommitTextEdit}
          onCancel={handleCancelTextEdit}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {stickerGeneratorOpen && (
        <StickerGenerator
          onAddSticker={addImage}
          onClose={() => setStickerGeneratorOpen(false)}
        />
      )}
      {regenerating && (
        <StickerGenerator
          initial={regenerating.generation}
          onAddSticker={(src, _name, width, height, generation) =>
            regenerateImage(regenerating.id, src, width, height, generation)
          }
          onClose={() => setRegeneratingId(null)}
        />
      )}
      {bg.bgProgress && (
        <BgStatusPanel progress={bg.bgProgress} startedAt={bg.startedAt} />
      )}
      {bg.bgAwaiting && (
        <BgPromptEditPanel
          prompt={bg.bgAwaiting.prompt}
          startedAt={bg.startedAt}
          onGenerate={bg.handleBgGenerate}
          onCancel={bg.handleBgCancel}
        />
      )}
      {bg.bgError && (
        <div className="bg-error-toast">
          <span>{bg.bgError}</span>
          <button className="bg-error-dismiss" onClick={bg.dismissError}>✕</button>
        </div>
      )}
      {importFlow.pendingImport && (
        <ImportChoiceDialog
          fileName={importFlow.pendingImport.fileName}
          objectCount={importFlow.pendingImport.objects.length}
          onAdd={importFlow.handleImportAdd}
          onReplace={importFlow.handleImportReplace}
          onCancel={importFlow.handleImportCancel}
        />
      )}
      {importFlow.importError && (
        <ImportErrorDialog message={importFlow.importError} onClose={importFlow.handleImportErrorClose} />
      )}
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
