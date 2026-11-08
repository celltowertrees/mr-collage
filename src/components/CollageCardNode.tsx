import { memo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import Konva from 'konva';
import { CARD_SAFE_MARGIN_IN, CARD_UNITS_PER_INCH, CardSide, CollageCard } from '../types';
import { CARD_BLEED_UNITS, cardLabel, cardPaperId } from '../utils/card';
import { addressGuideLayout } from '../utils/cardPair';
import { useObjectNode, type ObjectNodeProps } from '../hooks/useObjectNode';

const SAFE_UNITS = CARD_SAFE_MARGIN_IN * CARD_UNITS_PER_INCH;

// Guide lines keep a constant on-screen width whatever the zoom.
const TRIM_STYLE = { stroke: '#37474F', strokeWidth: 1.5, strokeScaleEnabled: false };
// Matches the Transformer's selection blue, which cards don't get.
const SELECTED_COLOR = '#2196F3';
const BLEED_STYLE = { stroke: '#E53935', strokeWidth: 1, dash: [6, 4], strokeScaleEnabled: false, listening: false };
const SAFE_STYLE = { stroke: '#00ACC1', strokeWidth: 1, dash: [3, 4], strokeScaleEnabled: false, listening: false };
const LABEL_FONT_PX = 12;
const LABEL_GAP_PX = 6;
// Generous, so the thin trim line is easy to grab.
const TRIM_HIT_PX = 14;
const ADDRESS_COLOR = '#7E57C2';
const ADDRESS_STYLE = { stroke: ADDRESS_COLOR, strokeWidth: 1, strokeScaleEnabled: false, listening: false };
// Printed-size captions: about 1/10 in tall, so they scale with the card.
const ADDRESS_FONT_UNITS = 10;

// Top-left of a card's paper (trim plus bleed) given the card's centre.
function paperOrigin(card: Pick<CollageCard, 'width' | 'height'>, x: number, y: number) {
  return { x: x - card.width / 2 - CARD_BLEED_UNITS, y: y - card.height / 2 - CARD_BLEED_UNITS };
}

// The white sheet under a card, drawn first in the content layer: blend modes
// only composite within a layer, so the paper has to share one with the
// artwork for Multiply and friends to blend against it — on screen and in the
// exported PNG alike. Always the full bleed size; whether the bleed is
// exported is decided by the capture, not by the paper.
export const CardPaper = memo(function CardPaper({ card }: { card: CollageCard }) {
  return (
    <Rect
      id={cardPaperId(card.id)}
      name="card-paper"
      {...paperOrigin(card, card.x, card.y)}
      width={card.width + CARD_BLEED_UNITS * 2}
      height={card.height + CARD_BLEED_UNITS * 2}
      fill="#ffffff"
      listening={false}
    />
  );
});

interface FrameProps extends ObjectNodeProps {
  card: CollageCard;
  side: CardSide | null;
  selected: boolean;
  stageScale: number;
}

// The card's guides and handle, on the overlay layer so they never reach an
// export. Only the trim line and label take the pointer: inside the card,
// clicks fall through to the artwork, and a drag on empty paper starts a
// marquee like anywhere else on the canvas. Dragging the frame moves only the
// frame, re-aiming what the card captures.
export const CardFrame = memo(function CardFrame({ card, side, selected, stageScale, ...nodeProps }: FrameProps) {
  const { groupProps } = useObjectNode(card, nodeProps);
  const px = (n: number) => n / stageScale;

  // The paper lives on another layer, so it's carried along by hand while
  // the frame is mid-drag; React re-positions both once the move commits.
  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const paper = node.getStage()?.findOne(`#${cardPaperId(card.id)}`);
    if (!paper) return;
    paper.position(paperOrigin(card, node.x(), node.y()));
    paper.getLayer()?.batchDraw();
  };

  return (
    <Group {...groupProps} name="card-frame" onDragMove={handleDragMove}>
      <Rect
        x={-CARD_BLEED_UNITS}
        y={-CARD_BLEED_UNITS}
        width={card.width + CARD_BLEED_UNITS * 2}
        height={card.height + CARD_BLEED_UNITS * 2}
        {...BLEED_STYLE}
      />
      <Rect
        x={SAFE_UNITS}
        y={SAFE_UNITS}
        width={card.width - SAFE_UNITS * 2}
        height={card.height - SAFE_UNITS * 2}
        {...SAFE_STYLE}
      />
      {side === 'back' && card.addressGuides && <AddressGuides width={card.width} height={card.height} />}
      <Rect
        width={card.width}
        height={card.height}
        {...TRIM_STYLE}
        stroke={selected ? SELECTED_COLOR : TRIM_STYLE.stroke}
        strokeWidth={selected ? 2.5 : TRIM_STYLE.strokeWidth}
        hitStrokeWidth={TRIM_HIT_PX}
        // Konva's hit canvas fills a shape even when it has no fill colour;
        // without this the whole card face would grab the pointer.
        fillEnabled={false}
      />
      <Text
        text={cardLabel(card, side)}
        x={-CARD_BLEED_UNITS}
        y={-CARD_BLEED_UNITS - px(LABEL_FONT_PX + LABEL_GAP_PX)}
        fontSize={px(LABEL_FONT_PX)}
        fontFamily="system-ui, sans-serif"
        fill={selected ? SELECTED_COLOR : TRIM_STYLE.stroke}
      />
    </Group>
  );
});

// Where a postcard's address side needs room — divider, address lines, stamp
// box, and the barcode strip USPS keeps clear — as guides only. Laid out
// landscape and turned a quarter-turn on a portrait back, since the address
// always reads along the long side.
function AddressGuides({ width, height }: { width: number; height: number }) {
  const portrait = height > width;
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const { divider, stamp, addressLines, barcodeZone } = addressGuideLayout(long, short);
  const caption = { fontSize: ADDRESS_FONT_UNITS, fontFamily: 'system-ui, sans-serif', fill: ADDRESS_COLOR, listening: false };
  return (
    <Group name="address-guides" listening={false} {...(portrait ? { x: width, rotation: 90 } : {})}>
      <Line points={[divider.x, divider.y1, divider.x, divider.y2]} {...ADDRESS_STYLE} />
      <Rect {...stamp} {...ADDRESS_STYLE} dash={[4, 3]} />
      <Text
        text="STAMP"
        x={stamp.x}
        y={stamp.y + stamp.height / 2 - ADDRESS_FONT_UNITS / 2}
        width={stamp.width}
        align="center"
        {...caption}
      />
      {addressLines.map((line) => (
        <Line key={line.y} points={[line.x1, line.y, line.x2, line.y]} {...ADDRESS_STYLE} />
      ))}
      <Text
        text="ADDRESS"
        x={addressLines[0]?.x1 ?? divider.x}
        y={(addressLines[0]?.y ?? short / 2) - ADDRESS_FONT_UNITS * 1.6}
        {...caption}
      />
      <Rect {...barcodeZone} {...ADDRESS_STYLE} dash={[2, 3]} fill="rgba(126, 87, 194, 0.08)" />
      <Text
        text="Keep clear for USPS barcode"
        x={barcodeZone.x + 4}
        y={barcodeZone.y + barcodeZone.height / 2 - ADDRESS_FONT_UNITS / 2}
        {...caption}
      />
    </Group>
  );
}
