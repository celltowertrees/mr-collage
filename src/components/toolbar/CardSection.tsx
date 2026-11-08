import { CardSide, CollageCard } from '../../types';
import { DeleteIcon } from '../ToolbarIcons';
import { ToolButton } from './primitives';
import type { UpdateObject } from './types';

interface Props {
  card: CollageCard;
  side: CardSide | null;
  onAddBack: (frontId: string) => void;
  onUpdate: UpdateObject;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

// A card has a fixed print size, so instead of the object and effect
// controls it gets orientation, bleed, and its own export. Orientation and
// bleed apply to both sides of a pair, and exporting either side exports both.
export function CardSection({ card, side, onAddBack, onUpdate, onExport, onDelete }: Props) {
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
      {side === null && (
        <ToolButton onClick={() => onAddBack(card.id)} title="Add Back" className="export-btn">
          Add Back
        </ToolButton>
      )}
      {side === 'back' && (
        <label className="toolbar-field" title="Show where USPS needs the address, stamp and barcode (guides only, never exported)">
          <input
            type="checkbox"
            checked={!!card.addressGuides}
            onChange={(e) => onUpdate(card.id, { addressGuides: e.target.checked })}
          />
          <span>Address Layout</span>
        </label>
      )}
      <ToolButton onClick={() => onExport(card.id)} title="Export Card" className="export-btn">
        {side ? 'Export Front & Back' : 'Export Card'}
      </ToolButton>
      <ToolButton onClick={() => onDelete(card.id)} title="Delete" danger>
        <DeleteIcon />
      </ToolButton>
    </div>
  );
}
