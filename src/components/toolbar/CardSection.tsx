import { CollageCard } from '../../types';
import { LowResImage, PRINT_DPI_LOW, PRINT_DPI_VERY_LOW } from '../../utils/printQuality';
import { DeleteIcon } from '../ToolbarIcons';
import { ToolButton } from './primitives';
import type { UpdateObject } from './types';

interface Props {
  card: CollageCard;
  onUpdate: UpdateObject;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
  lowRes: LowResImage[];
  onSelectImages: (ids: string[]) => void;
}

// A card has a fixed print size, so instead of the object and effect
// controls it gets orientation, bleed, and its own export.
export function CardSection({ card, onUpdate, onExport, onDelete, lowRes, onSelectImages }: Props) {
  const portrait = card.height > card.width;

  const setPortrait = (wantPortrait: boolean) => {
    if (wantPortrait === portrait) return;
    onUpdate(card.id, { width: card.height, height: card.width });
  };

  return (
    <div className="toolbar-section">
      <ToolButton active={!portrait} onClick={() => setPortrait(false)} title="Landscape" className="export-btn">
        Landscape
      </ToolButton>
      <ToolButton active={portrait} onClick={() => setPortrait(true)} title="Portrait" className="export-btn">
        Portrait
      </ToolButton>
      <label className="toolbar-field" title="Add 1/8 in on every side for a print shop to trim off">
        <input
          type="checkbox"
          checked={card.includeBleed}
          onChange={(e) => onUpdate(card.id, { includeBleed: e.target.checked })}
        />
        <span>Include Bleed</span>
      </label>
      {lowRes.length > 0 && (
        <button
          className={`print-warning${lowRes[0].dpi < PRINT_DPI_VERY_LOW ? ' very-low' : ''}`}
          title="Select Low-Resolution Images"
          aria-label={`Select the images printing below ${PRINT_DPI_LOW}dpi`}
          onClick={() => onSelectImages(lowRes.map(({ image }) => image.id))}
        >
          ⚠ {lowRes.length} {lowRes.length === 1 ? 'image prints' : 'images print'} soft · {Math.round(lowRes[0].dpi)}dpi
        </button>
      )}
      <ToolButton onClick={() => onExport(card.id)} title="Export Card" className="export-btn">
        Export Card
      </ToolButton>
      <ToolButton onClick={() => onDelete(card.id)} title="Delete" danger>
        <DeleteIcon />
      </ToolButton>
    </div>
  );
}
