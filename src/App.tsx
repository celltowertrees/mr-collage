import { useRef, useCallback, useEffect, useState } from 'react';
import Konva from 'konva';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { TextEditor, type TextEditorHandle } from './components/TextEditor';
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
import { lowResImagesOnCard, PRINT_DPI_LOW } from './utils/printQuality';
import { cardExportFilenames, expandCardPairs } from './utils/cardPair';
import { CollageCard, CollageText } from './types';
import { PLACEHOLDER_TEXT } from './hooks/useCollage';
import { applyWordArtPreset } from './utils/wordArtPresets';
import { cardSide } from './utils/cardPair';
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
    addCard,
    addCardBack,
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
  // The text being typed into on the canvas. `group` names the editing
  // session's undo step: every keystroke (and, for a new text, its creation)
  // lands in it, so one Ctrl+Z undoes the whole session.
  const [editing, setEditing] = useState<{
    id: string;
    group: string;
    initial: { start: number; end: number };
  } | null>(null);
  const [editSelection, setEditSelection] = useState({ start: 0, end: 0 });
  const editorRef = useRef<TextEditorHandle>(null);
  const editSession = useRef(0);
  // A WordArt preset picked with the Text tool, for the next text placed.
  const [nextTextStyle, setNextTextStyle] = useState<{ name: string; style: Partial<CollageText> } | null>(null);
  const editingTextId = editing?.id ?? null;
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
  const { handleExportJPEG, handleExportPNGs, handleExportJSON, handleExportHTML, handleExportCards } = useExports({
    stageRef,
    images,
    selectedIds,
    stagePosition,
    stageScale,
  });
  // Exports never block on resolution, but a card about to print soft says so
  // once the file is on its way, naming the card the way its filename does.
  const [printNotice, setPrintNotice] = useState<string | null>(null);
  const exportCards = useCallback(
    (ids?: string[]) => {
      // The same cards, and the same filenames, the export itself will use:
      // either side of a front/back pair brings the other along.
      const names = cardExportFilenames(images);
      const wanted = ids ? expandCardPairs(ids, images) : null;
      const soft = images
        .filter((obj): obj is CollageCard => obj.kind === 'card' && (!wanted || wanted.includes(obj.id)))
        .map((card) => ({ name: names.get(card.id) ?? card.name, lowRes: lowResImagesOnCard(card, images) }))
        .filter(({ lowRes }) => lowRes.length > 0);
      handleExportCards(ids);
      setPrintNotice(
        soft.length === 0
          ? null
          : soft
              .map(
                ({ name, lowRes }) =>
                  `${name} has ${lowRes.length} ${lowRes.length === 1 ? 'image' : 'images'} below ${PRINT_DPI_LOW}dpi (softest ${Math.round(lowRes[0].dpi)}dpi).`
              )
              .join(' ') + " It's exported, but may look soft in print."
      );
    },
    [images, handleExportCards]
  );

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

  // Placing text with the Text tool is a single click: create it with
  // placeholder words selected (so typing replaces them), switch back to
  // Select so the formatting toolbar shows up, and start typing on it.
  const handleAddText = useCallback(
    (point: { x: number; y: number }) => {
      const group = `text-edit:${++editSession.current}`;
      const id = addText(point, nextTextStyle?.style, { group });
      setTool('select');
      setEditing({ id, group, initial: { start: 0, end: PLACEHOLDER_TEXT.length } });
    },
    [addText, setTool, nextTextStyle]
  );

  const handleStartEditingText = useCallback(
    (id: string, caretIndex?: number) => {
      const obj = images.find((o) => o.id === id);
      if (obj?.kind !== 'text') return;
      const at = caretIndex ?? obj.text.length;
      setSelectedIds([id]);
      setEditing({ id, group: `text-edit:${++editSession.current}`, initial: { start: at, end: at } });
    },
    [images, setSelectedIds]
  );

  const handleEditTextChange = useCallback(
    (text: string) => {
      if (editing) updateImage(editing.id, { text }, { group: editing.group });
    },
    [editing, updateImage]
  );

  // Finishing leaves the text as typed — there's nothing to commit, it was
  // live all along. Text emptied out is removed, in the same undo step.
  const handleFinishEditing = useCallback(() => {
    if (!editing) return;
    const obj = images.find((o) => o.id === editing.id);
    if (obj?.kind === 'text' && obj.text.trim() === '') deleteImage(editing.id, { group: editing.group });
    setEditing(null);
  }, [editing, images, deleteImage]);

  const handleEditPointer = useCallback((index: number, extend: boolean) => {
    editorRef.current?.place(index, extend);
  }, []);

  // The edited object went away under the editor (undo, delete).
  useEffect(() => {
    if (editing && !editingText) setEditing(null);
  }, [editing, editingText]);

  return (
    <div className="app">
      <Toolbar
        tool={tool}
        selectedImage={selectedImage}
        objects={images}
        onSelect={setSelectedIds}
        onToolChange={setTool}
        onUpload={handleUploadClick}
        onAddModel3D={addModel3D}
        onAddCard={addCard}
        onAddCardBack={addCardBack}
        selectedCardSide={selectedImage?.kind === 'card' ? cardSide(selectedImage, images) : null}
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
        onExportCards={exportCards}
        hasSelection={images.some((obj) => obj.kind !== 'card' && selectedIds.includes(obj.id))}
        hasCards={images.some((obj) => obj.kind === 'card')}
        onImportJSON={importFlow.handleImportJSON}
        hasPendingCrop={cropDrawer.committedRect !== null}
        onApplyCrop={applyCrop}
        onCancelCrop={cancelCrop}
        nextTextStyleName={nextTextStyle?.name ?? null}
        onPickNextTextStyle={(preset) => setNextTextStyle({ name: preset.name, style: applyWordArtPreset(preset) })}
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
        onStartEditingText={handleStartEditingText}
        textEditing={editing ? { id: editing.id, ...editSelection } : null}
        onEditPointer={handleEditPointer}
        stageRef={stageRef}
        cropDrawer={cropDrawer}
        cropPreviewRect={cropDrawer.getPreviewRect()}
        bgRectDrawer={bg.bgRectDrawer}
        bgRectPreview={bg.bgRectDrawer.previewRect}
        bgLoadingRect={bg.bgLoading}
        onRegenerate={setRegeneratingId}
      />
      {editing && editingText && (
        <TextEditor
          key={editing.group}
          ref={editorRef}
          textObj={editingText}
          stagePosition={stagePosition}
          stageScale={stageScale}
          initialSelection={editing.initial}
          onTextChange={handleEditTextChange}
          onSelectionChange={(start, end) => setEditSelection({ start, end })}
          onFinish={handleFinishEditing}
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
      {printNotice && (
        <div className="print-notice-toast" role="status">
          <span>⚠ {printNotice}</span>
          <button className="bg-error-dismiss" aria-label="Dismiss" onClick={() => setPrintNotice(null)}>✕</button>
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
