import { CollageText } from '../../types';
import { GOOGLE_FONTS } from '../../utils/googleFonts';
import { BoldIcon, ItalicIcon, UnderlineIcon } from '../ToolbarIcons';
import { SliderField, ToolButton } from './primitives';
import type { UpdateObject } from './types';

export function TextSection({ text, onUpdate }: { text: CollageText; onUpdate: UpdateObject }) {
  const updateText = (changes: Partial<CollageText>, options?: { coalesce?: boolean }) =>
    onUpdate(text.id, changes, options);

  return (
    <div className="toolbar-section">
      <ToolButton active={text.bold} onClick={() => updateText({ bold: !text.bold })} title="Bold">
        <BoldIcon />
      </ToolButton>
      <ToolButton active={text.italic} onClick={() => updateText({ italic: !text.italic })} title="Italic">
        <ItalicIcon />
      </ToolButton>
      <ToolButton
        active={text.underline}
        onClick={() => updateText({ underline: !text.underline })}
        title="Underline"
      >
        <UnderlineIcon />
      </ToolButton>
      <label className="toolbar-field">
        <span>Color</span>
        <input type="color" value={text.color} onChange={(e) => updateText({ color: e.target.value })} />
      </label>
      <SliderField
        label="Size"
        min={8}
        max={200}
        step={1}
        value={text.fontSize}
        display={`${Math.round(text.fontSize)}`}
        onChange={(value) => updateText({ fontSize: value }, { coalesce: true })}
      />
      <label className="toolbar-field">
        <span>Font</span>
        <select value={text.fontFamily} onChange={(e) => updateText({ fontFamily: e.target.value })}>
          {GOOGLE_FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
