import { useRef, useCallback, useEffect, useState } from 'react';
import Konva from 'konva';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { TextEditOverlay } from './components/TextEditOverlay';
import { StickerGenerator } from './components/StickerGenerator';
import { useCollage } from './hooks/useCollage';
import { useImageLoader } from './hooks/useImageLoader';
import { useCropDrawer } from './hooks/useCropDrawer';
import { useBgRectDrawer, type BgRect } from './hooks/useBgRectDrawer';
import { analyzeImages, generateBackgroundFromPrompt, type VisionDetail, type BgProgressEvent } from './utils/generateBackground';
import { localToStage } from './utils/geometry';
import { exportToICP, exportToStaticHTML } from './store';
import { renderModelToDataURL } from './utils/model3dRenderer';
import { CollageImage, CollageText } from './types';
import './App.css';

const API_KEY_STORAGE_KEY = 'mr-collage-openai-key';

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="bg-status-elapsed">{m}:{s.toString().padStart(2, '0')}</span>;
}

function BgStatusPanel({ progress, startedAt }: { progress: BgProgressEvent; startedAt: number }) {
  const step1Done = progress.step === 2;
  const visionPrompt = progress.visionPrompt ?? null;

  return (
    <div className="bg-status-panel">
      <div className="bg-status-header">
        <span className="bg-status-title">Generating Background</span>
        <ElapsedTimer startedAt={startedAt} />
      </div>
      <div className="bg-status-steps">
        <div className={`bg-status-step ${step1Done ? 'done' : 'active'}`}>
          <span className="bg-status-dot">{step1Done ? '✓' : '○'}</span>
          <span>
            {step1Done ? 'Vision analysis complete' : progress.label}
          </span>
        </div>
        <div className={`bg-status-step ${step1Done ? 'active' : 'pending'}`}>
          <span className="bg-status-dot">{step1Done ? '○' : '·'}</span>
          <span>{step1Done ? progress.label : 'Generating background image…'}</span>
        </div>
      </div>
      {visionPrompt && (
        <div className="bg-status-prompt">
          <span className="bg-status-prompt-label">Vision prompt</span>
          <span className="bg-status-prompt-text">{visionPrompt}</span>
        </div>
      )}
    </div>
  );
}

function BgPromptEditPanel({
  prompt,
  startedAt,
  onGenerate,
  onCancel,
}: {
  prompt: string;
  startedAt: number;
  onGenerate: (prompt: string) => void;
  onCancel: () => void;
}) {
  const [edited, setEdited] = useState(prompt);
  return (
    <div className="bg-status-panel bg-prompt-edit-panel">
      <div className="bg-status-header">
        <span className="bg-status-title">Edit Vision Prompt</span>
        <ElapsedTimer startedAt={startedAt} />
      </div>
      <p className="bg-prompt-hint">GPT-4o derived this prompt from your images. Edit it before generating.</p>
      <textarea
        className="bg-prompt-textarea"
        value={edited}
        onChange={(e) => setEdited(e.target.value)}
        rows={5}
        autoFocus
      />
      <div className="bg-prompt-actions">
        <button className="bg-prompt-cancel" onClick={onCancel}>Cancel</button>
        <button
          className="bg-prompt-generate"
          onClick={() => onGenerate(edited.trim())}
          disabled={!edited.trim()}
        >
          Generate →
        </button>
      </div>
    </div>
  );
}

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
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [stickerGeneratorOpen, setStickerGeneratorOpen] = useState(false);
  const [bgLoading, setBgLoading] = useState<BgRect | null>(null);
  const [bgProgress, setBgProgress] = useState<BgProgressEvent | null>(null);
  const bgStartedAtRef = useRef<number>(0);
  const [bgError, setBgError] = useState<string | null>(null);
  const [visionDetail, setVisionDetail] = useState<VisionDetail>(
    () => (localStorage.getItem('mr-collage-vision-detail') as VisionDetail | null) ?? 'low'
  );
  const bgAbortRef = useRef<AbortController | null>(null);
  const [bgAwaiting, setBgAwaiting] = useState<{
    prompt: string;
    rect: BgRect;
    minZIndex: number;
    aspectRatio: number;
  } | null>(null);

  const { loadFromFiles, loadFromClipboard } = useImageLoader(addImage);

  const selectedImage = selectedIds.length === 1 ? images.find((img) => img.id === selectedIds[0]) ?? null : null;
  // The crop tool only ever targets images — narrow here so useCropDrawer
  // (typed for CollageImage) never sees anything else. Checked positively:
  // `kind !== 'text'` would quietly let every new object kind through.
  const selectedImageOnly = selectedImage?.kind === 'image' ? selectedImage : null;
  const editingText: CollageText | null =
    (images.find((obj): obj is CollageText => obj.kind === 'text' && obj.id === editingTextId) ?? null);

  const cropDrawer = useCropDrawer({
    active: tool === 'crop',
    targetImage: selectedImageOnly,
    stageRef,
  });

  const handleBgRectComplete = useCallback(
    (rect: BgRect) => {
      const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';
      if (!apiKey) {
        setBgError('No OpenAI API key found. Generate a sticker first to save your key, or open the sticker generator to add one.');
        setTool('select');
        return;
      }

      const stage = stageRef.current;
      const containedImages = images.filter((obj): obj is CollageImage => {
        if (obj.kind !== 'image') return false;
        const node = stage?.findOne(`#${obj.id}`);
        const box = node?.getClientRect({ relativeTo: stage ?? undefined });
        return box ? Konva.Util.haveIntersection(rect, box) : false;
      });

      if (containedImages.length === 0) {
        setBgError('No images found within the drawn area. Draw the rectangle over the images you want to use as context.');
        setTool('select');
        return;
      }

      const minZIndex = Math.min(...containedImages.map((img) => img.zIndex));
      const aspectRatio = rect.width / rect.height;

      // Render the drawn region to a JPEG so the vision model sees how everything
      // is laid out together rather than each image in isolation.
      const scale = stage!.scaleX();
      const compositeJpeg = stage!.toDataURL({
        x: rect.x * scale + stage!.x(),
        y: rect.y * scale + stage!.y(),
        width: rect.width * scale,
        height: rect.height * scale,
        pixelRatio: 2,
        mimeType: 'image/jpeg',
        quality: 0.85,
      });

      setTool('select');
      bgStartedAtRef.current = Date.now();
      setBgLoading(rect);

      const controller = new AbortController();
      bgAbortRef.current = controller;

      analyzeImages([compositeJpeg], apiKey, visionDetail, controller.signal, (event) => setBgProgress(event))
        .then((visionPrompt) => {
          setBgAwaiting({ prompt: visionPrompt, rect, minZIndex, aspectRatio });
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            setBgLoading(null);
            return;
          }
          setBgError(err instanceof Error ? err.message : 'Vision analysis failed.');
          setBgLoading(null);
        })
        .finally(() => {
          setBgProgress(null);
        });
    },
    [images, stageRef, setTool, visionDetail]
  );

  const handleBgGenerate = useCallback(
    (editedPrompt: string) => {
      if (!bgAwaiting) return;
      const { rect, minZIndex, aspectRatio } = bgAwaiting;
      const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY)?.trim() ?? '';

      setBgAwaiting(null);

      const controller = new AbortController();
      bgAbortRef.current = controller;

      generateBackgroundFromPrompt(editedPrompt, apiKey, aspectRatio, controller.signal, (event) => setBgProgress(event))
        .then(({ dataUrl, naturalWidth, naturalHeight }) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                reject(new Error('API returned a blank image. Try editing the prompt and generating again.'));
                return;
              }
              try {
                addBackground(dataUrl, 'AI Background', naturalWidth, naturalHeight, rect, minZIndex);
                setBgError(null);
                resolve();
              } catch (e) {
                reject(e);
              }
            };
            img.onerror = () => reject(new Error('Background image was generated but could not be decoded.'));
            img.src = dataUrl;
          })
        )
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setBgError(err instanceof Error ? err.message : 'Background generation failed.');
        })
        .finally(() => {
          setBgLoading(null);
          setBgProgress(null);
        });
    },
    [bgAwaiting, addBackground]
  );

  const handleBgCancel = useCallback(() => {
    bgAbortRef.current?.abort();
    setBgAwaiting(null);
    setBgLoading(null);
    setBgProgress(null);
  }, []);

  const bgRectDrawer = useBgRectDrawer({
    active: tool === 'bg-rect',
    stageRef,
    onComplete: handleBgRectComplete,
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

  const handleExportJPEG = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || images.length === 0) return;

    const layer = stage.getLayers()[0];
    // No `relativeTo`: getClientRect() defaults to absolute/screen coordinates,
    // which is the same space stage.toDataURL()'s x/y/width/height expect
    // (they include the stage's current pan and zoom). Passing `relativeTo: stage`
    // stripped that transform out, so the crop region didn't match the content.
    const rect = layer.getClientRect();

    const padding = 40;
    const pixelRatio = 2;
    const dataUrl = stage.toDataURL({
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      pixelRatio,
      mimeType: 'image/png',
    });

    // JPEG has no alpha channel, so transparent canvas pixels would otherwise
    // composite to black. Draw the PNG capture over a white background first.
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const link = document.createElement('a');
      link.download = 'collage.jpg';
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
    };
    img.src = dataUrl;
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

  const handleExportHTML = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || images.length === 0) return;

    // Only cropped images need their natural (pre-crop) pixel size to scale
    // the <img> element up so the cropped region fills its display box.
    const naturalSizes: Record<string, { width: number; height: number }> = {};
    const croppedImages = images.filter((obj): obj is CollageImage => obj.kind === 'image' && !!obj.crop);
    await Promise.all(
      croppedImages.map(
        (img) =>
          new Promise<void>((resolve) => {
            const el = new window.Image();
            el.onload = () => {
              naturalSizes[img.id] = { width: el.naturalWidth, height: el.naturalHeight };
              resolve();
            };
            el.src = img.src;
          })
      )
    );

    // A static file can't carry the live WebGL renderer, so each 3D object is
    // rendered once here and embedded as a PNG — the same pre-pass shape as
    // naturalSizes above.
    const modelSnapshots: Record<string, string> = {};
    for (const obj of images) {
      if (obj.kind !== 'model3d') continue;
      const snapshot = renderModelToDataURL(
        { shape: obj.shape, rotation3D: obj.rotation3D, light: obj.light, material: obj.material },
        obj.width,
        obj.height
      );
      if (snapshot) modelSnapshots[obj.id] = snapshot;
    }

    const html = await exportToStaticHTML(
      images,
      { x: stagePosition.x, y: stagePosition.y, scale: stageScale, width: stage.width(), height: stage.height() },
      naturalSizes,
      modelSnapshots
    );

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'collage.html';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [images, stagePosition, stageScale]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The text-edit overlay is a real <textarea> with its own native
      // undo/typing/Escape handling — let all of that through untouched
      // rather than hijacking it with app-level shortcuts below.
      if (e.target instanceof HTMLTextAreaElement) return;

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

      if (e.target instanceof HTMLInputElement) return;

      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if (e.key === 't' || e.key === 'T') setTool('text');
      if (e.key === 'r' || e.key === 'R') setTool('rotate3d');
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
  const handleMoveSelected = useCallback(
    (draggedId: string, dx: number, dy: number) => {
      const ids = selectedIds.includes(draggedId) ? selectedIds : [draggedId];
      moveImages(ids, dx, dy);
    },
    [selectedIds, moveImages]
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
        visionDetail={visionDetail}
        onVisionDetailChange={(d) => {
          setVisionDetail(d);
          localStorage.setItem('mr-collage-vision-detail', d);
        }}
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
        onCropMouseDown={cropDrawer.handleMouseDown}
        onCropMouseMove={cropDrawer.handleMouseMove}
        onCropMouseUp={cropDrawer.handleMouseUp}
        cropPreviewRect={cropDrawer.getPreviewRect()}
        onBgRectMouseDown={bgRectDrawer.handleMouseDown}
        onBgRectMouseMove={bgRectDrawer.handleMouseMove}
        onBgRectMouseUp={bgRectDrawer.handleMouseUp}
        bgRectPreview={bgRectDrawer.previewRect}
        bgLoadingRect={bgLoading}
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
      {bgProgress && (
        <BgStatusPanel progress={bgProgress} startedAt={bgStartedAtRef.current} />
      )}
      {bgAwaiting && (
        <BgPromptEditPanel
          prompt={bgAwaiting.prompt}
          startedAt={bgStartedAtRef.current}
          onGenerate={handleBgGenerate}
          onCancel={handleBgCancel}
        />
      )}
      {bgError && (
        <div className="bg-error-toast">
          <span>{bgError}</span>
          <button className="bg-error-dismiss" onClick={() => setBgError(null)}>✕</button>
        </div>
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
