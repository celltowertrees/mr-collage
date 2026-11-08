import { CardSizeId, CollageObject, PrimitiveShape, Tool } from '../types';
import type { VisionDetail } from '../utils/generateBackground';
import { ToolsSection } from './toolbar/ToolsSection';
import { ObjectSection } from './toolbar/ObjectSection';
import { TextSection } from './toolbar/TextSection';
import { Model3DSection } from './toolbar/Model3DSection';
import { CropSection, MaskSection } from './toolbar/MaskSection';
import { ShadowSection, VignetteSection } from './toolbar/EffectSections';
import { ExportSection } from './toolbar/ExportSection';
import { CardSection } from './toolbar/CardSection';
import { imagePrintDpi, lowResImagesOnCard, lowResOnAnyCard, PRINT_DPI_LOW, PRINT_DPI_VERY_LOW } from '../utils/printQuality';
import type { UpdateObject } from './toolbar/types';

interface ToolbarProps {
  tool: Tool;
  selectedImage: CollageObject | null;
  // Everything on the canvas, for checking print resolution against cards.
  objects: CollageObject[];
  onSelect: (ids: string[]) => void;
  onToolChange: (tool: Tool) => void;
  onUpload: () => void;
  onAddModel3D: (shape: PrimitiveShape) => void;
  onAddCard: (sizeId: CardSizeId) => void;
  onOpenStickerGenerator: () => void;
  visionDetail: VisionDetail;
  onVisionDetailChange: (detail: VisionDetail) => void;
  onUpdateImage: UpdateObject;
  onDelete: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onDuplicate: (id: string) => void;
  onClearMask: (id: string) => void;
  onClearGradient: (id: string) => void;
  onExportJPEG: () => void;
  onExportJSON: () => void;
  onExportHTML: () => void;
  onExportPNGs: () => void;
  onExportCards: (ids?: string[]) => void;
  hasSelection: boolean;
  hasCards: boolean;
  onImportJSON: () => void;
  hasPendingCrop: boolean;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const { tool, selectedImage: selected, onToolChange, onUpdateImage } = props;
  // Shape mask/crop/vignette only ever apply to images (there's no real case
  // for clipping or vignetting a text object, or a 3D object, the way there is
  // for a photo); shadow/blend mode/flip/gradient fade apply to every kind;
  // text formatting and the 3D controls only ever apply to their own kind.
  // Each check is positive, so a future kind has to opt in to a control
  // rather than inheriting it by accident.
  const image = selected?.kind === 'image' ? selected : null;
  const text = selected?.kind === 'text' ? selected : null;
  const model = selected?.kind === 'model3d' ? selected : null;
  const card = selected?.kind === 'card' ? selected : null;
  const imageDpi = image && lowResOnAnyCard(image, props.objects) ? imagePrintDpi(image) : null;

  return (
    <div className="toolbar">
      <div className="toolbar-title">Mr. Collage</div>
      <ToolsSection
        tool={tool}
        onToolChange={onToolChange}
        visionDetail={props.visionDetail}
        onVisionDetailChange={props.onVisionDetailChange}
        onUpload={props.onUpload}
        onOpenStickerGenerator={props.onOpenStickerGenerator}
        onAddModel3D={props.onAddModel3D}
        onAddCard={props.onAddCard}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
      />

      {card && tool !== 'pan' && (
        <CardSection
          card={card}
          onUpdate={onUpdateImage}
          onExport={(id) => props.onExportCards([id])}
          onDelete={props.onDelete}
          lowRes={lowResImagesOnCard(card, props.objects)}
          onSelectImages={props.onSelect}
        />
      )}

      {selected && !card && tool !== 'pan' && (
        <>
          <ObjectSection
            obj={selected}
            onUpdate={onUpdateImage}
            onBringToFront={props.onBringToFront}
            onSendToBack={props.onSendToBack}
            onDuplicate={props.onDuplicate}
            onDelete={props.onDelete}
          />
          {imageDpi !== null && (
            <div className="toolbar-section">
              <span
                className={`print-warning${imageDpi < PRINT_DPI_VERY_LOW ? ' very-low' : ''}`}
                title={`Below ${PRINT_DPI_LOW}dpi this image will look soft on the printed card. Shrink it, or use a larger original.`}
              >
                ⚠ Prints at {Math.round(imageDpi)}dpi
              </span>
            </div>
          )}
          {text && <TextSection text={text} onUpdate={onUpdateImage} />}
          {model && <Model3DSection model={model} tool={tool} onToolChange={onToolChange} onUpdate={onUpdateImage} />}
          <MaskSection
            obj={selected}
            tool={tool}
            onToolChange={onToolChange}
            onClearMask={props.onClearMask}
            onClearGradient={props.onClearGradient}
          />
          {image && (
            <CropSection
              tool={tool}
              onToolChange={onToolChange}
              hasPendingCrop={props.hasPendingCrop}
              onApplyCrop={props.onApplyCrop}
              onCancelCrop={props.onCancelCrop}
            />
          )}
          <ShadowSection obj={selected} onUpdate={onUpdateImage} />
          {image && <VignetteSection image={image} onUpdate={onUpdateImage} />}
        </>
      )}

      <ExportSection
        onImportJSON={props.onImportJSON}
        onExportJPEG={props.onExportJPEG}
        onExportJSON={props.onExportJSON}
        onExportHTML={props.onExportHTML}
        onExportPNGs={props.onExportPNGs}
        onExportCards={() => props.onExportCards()}
        hasSelection={props.hasSelection}
        hasCards={props.hasCards}
      />
    </div>
  );
}
