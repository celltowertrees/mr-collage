import { CARD_EXPORT_FORMATS, CardExportFormat, CollageCard } from '../../types';
import { DeleteIcon } from '../ToolbarIcons';
import { ToolButton } from './primitives';
import type { UpdateObject } from './types';

const FORMAT_LABELS: Record<CardExportFormat, string> = { png: 'PNG', jpeg: 'JPEG', pdf: 'PDF' };

interface Props {
  card: CollageCard;
  onUpdate: UpdateObject;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

// A card has a fixed print size, so instead of the object and effect
// controls it gets orientation, bleed, and its own export.
export function CardSection({ card, onUpdate, onExport, onDelete }: Props) {
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
      <div className="toolbar-divider" />
      <label className="toolbar-field" title="Print file type">
        <span>Format</span>
        <select
          aria-label="Card Format"
          value={card.exportFormat ?? 'png'}
          onChange={(e) => onUpdate(card.id, { exportFormat: e.target.value as CardExportFormat })}
        >
          {CARD_EXPORT_FORMATS.map((format) => (
            <option key={format} value={format}>
              {FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
      </label>
      <ToolButton onClick={() => onExport(card.id)} title="Export Card" className="export-btn">
        Export Card
      </ToolButton>
      <ToolButton onClick={() => onDelete(card.id)} title="Delete" danger>
        <DeleteIcon />
      </ToolButton>
    </div>
  );
}
