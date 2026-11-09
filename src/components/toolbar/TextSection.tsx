import { useEffect, useRef } from 'react';
import { CollageText, TextAlign, WARP_SHAPES, WarpShape } from '../../types';
import { GOOGLE_FONTS, fontWeightFor, loadGoogleFontFace } from '../../utils/googleFonts';
import { canvasMeasure, clearMeasureCache, drawWordArt, layoutWordArt } from '../../utils/wordArt';
import { WORDART_PRESETS, applyWordArtPreset, type WordArtPreset } from '../../utils/wordArtPresets';
import { BoldIcon, ItalicIcon, UnderlineIcon } from '../ToolbarIcons';
import { SliderField, ToolButton } from './primitives';
import { usePopupMenu } from './usePopupMenu';
import type { UpdateObject } from './types';

const WARP_LABELS: Record<WarpShape, string> = {
  'arch-up': 'Arch Up',
  'arch-down': 'Arch Down',
  circle: 'Circle',
  wave: 'Wave',
  'slant-up': 'Slant Up',
  'slant-down': 'Slant Down',
  bulge: 'Bulge',
  pinch: 'Pinch',
};

// A small picture of each warp's baseline, for the Warp menu.
const WARP_PATHS: Record<WarpShape | 'none', string> = {
  none: 'M2 10 H22',
  'arch-up': 'M2 13 Q12 1 22 13',
  'arch-down': 'M2 5 Q12 17 22 5',
  circle: 'M12 3 A6 6 0 1 1 11.9 3',
  wave: 'M2 9 Q7 2 12 9 T22 9',
  'slant-up': 'M2 14 L22 4',
  'slant-down': 'M2 4 L22 14',
  bulge: 'M2 7 Q12 1 22 7 M2 12 Q12 18 22 12',
  pinch: 'M2 4 Q12 9 22 4 M2 15 Q12 10 22 15',
};

function WarpIcon({ shape }: { shape: WarpShape | 'none' }) {
  return (
    <svg width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d={WARP_PATHS[shape]} strokeLinecap="round" />
    </svg>
  );
}

function AlignIcon({ align }: { align: TextAlign }) {
  const rows = [14, 9, 12, 7];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      {rows.map((w, i) => {
        const x = align === 'left' ? 1 : align === 'right' ? 15 - w : (16 - w) / 2;
        return <rect key={i} x={x} y={2 + i * 3.4} width={w} height={1.8} rx={0.9} />;
      })}
    </svg>
  );
}

// A live rendering of a preset, drawn by the same renderer as the canvas.
function PresetThumbnail({ preset }: { preset: WordArtPreset }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const style = {
      text: 'WordArt',
      fontFamily: preset.style.fontFamily ?? GOOGLE_FONTS[0],
      fontSize: 30,
      bold: preset.style.bold ?? false,
      italic: preset.style.italic ?? false,
      underline: false,
      ...preset.style,
    };
    let cancelled = false;
    const draw = () => {
      const layout = layoutWordArt(style, canvasMeasure);
      const ratio = window.devicePixelRatio || 1;
      const fit = Math.min(
        (canvas.width / ratio - 8) / layout.bounds.width,
        (canvas.height / ratio - 6) / layout.bounds.height,
        1.4
      );
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(
        ratio * fit,
        0,
        0,
        ratio * fit,
        (canvas.width - layout.bounds.width * fit * ratio) / 2,
        (canvas.height - layout.bounds.height * fit * ratio) / 2
      );
      drawWordArt(ctx, style, layout);
    };
    draw();
    // Drawn again once the preset's own font has arrived.
    loadGoogleFontFace(style.fontFamily, fontWeightFor(style.bold), style.italic).then(() => {
      if (cancelled) return;
      clearMeasureCache(style.fontFamily);
      draw();
    });
    return () => {
      cancelled = true;
    };
  }, [preset]);
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return (
    <canvas
      ref={ref}
      width={84 * ratio}
      height={44 * ratio}
      style={{ width: 84, height: 44 }}
      className="wordart-thumb"
      aria-hidden
    />
  );
}

// The WordArt gallery button and its popup. Used on a selected text, and on
// its own while the Text tool is out, to style the next text placed.
export function WordArtStylesButton({ onPick }: { onPick: (preset: WordArtPreset) => void }) {
  const menu = usePopupMenu();
  return (
    <div className="blend-mode-field">
      <ToolButton
        ref={menu.buttonRef}
        onClick={menu.toggle}
        title="WordArt Styles"
        active={!!menu.pos}
        className="export-btn"
      >
        WordArt
      </ToolButton>
      {menu.pos && (
        <div
          ref={menu.menuRef}
          className="blend-mode-popup wordart-gallery"
          role="menu"
          style={{ top: menu.pos.top, left: menu.pos.left }}
        >
          {WORDART_PRESETS.map((preset) => (
            <button
              key={preset.id}
              role="menuitem"
              className="wordart-option"
              title={preset.name}
              onClick={() => {
                onPick(preset);
                menu.close();
              }}
            >
              <PresetThumbnail preset={preset} />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WarpButton({ text, onChange }: { text: CollageText; onChange: (changes: Partial<CollageText>) => void }) {
  const menu = usePopupMenu();
  const current = text.warp?.shape ?? 'none';
  return (
    <div className="blend-mode-field">
      <ToolButton ref={menu.buttonRef} onClick={menu.toggle} title="Warp" active={!!menu.pos} className="export-btn">
        <WarpIcon shape={current} />
        {current === 'none' ? 'Warp' : WARP_LABELS[current]}
      </ToolButton>
      {menu.pos && (
        <div
          ref={menu.menuRef}
          className="blend-mode-popup warp-menu"
          role="menu"
          style={{ top: menu.pos.top, left: menu.pos.left }}
        >
          {(['none', ...WARP_SHAPES] as const).map((shape) => (
            <button
              key={shape}
              role="menuitem"
              className={`blend-mode-option warp-option ${current === shape ? 'active' : ''}`}
              onClick={() => {
                onChange({
                  warp: shape === 'none' ? undefined : { shape, amount: text.warp?.amount ?? 50 },
                });
                menu.close();
              }}
            >
              <WarpIcon shape={shape} />
              {shape === 'none' ? 'None' : WARP_LABELS[shape]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TextSection({ text, onUpdate }: { text: CollageText; onUpdate: UpdateObject }) {
  const updateText = (changes: Partial<CollageText>, options?: { coalesce?: boolean }) =>
    onUpdate(text.id, changes, options);
  const slide = (changes: Partial<CollageText>) => updateText(changes, { coalesce: true });
  const align = text.align ?? 'left';

  return (
    <div className="toolbar-section text-section">
      <WordArtStylesButton onPick={(preset) => updateText(applyWordArtPreset(preset))} />
      <div className="toolbar-divider" />

      <ToolButton active={text.bold} onClick={() => updateText({ bold: !text.bold })} title="Bold">
        <BoldIcon />
      </ToolButton>
      <ToolButton active={text.italic} onClick={() => updateText({ italic: !text.italic })} title="Italic">
        <ItalicIcon />
      </ToolButton>
      <ToolButton active={text.underline} onClick={() => updateText({ underline: !text.underline })} title="Underline">
        <UnderlineIcon />
      </ToolButton>
      {(['left', 'center', 'right'] as const).map((a) => (
        <ToolButton
          key={a}
          active={align === a}
          onClick={() => updateText({ align: a })}
          title={`Align ${a[0].toUpperCase()}${a.slice(1)}`}
        >
          <AlignIcon align={a} />
        </ToolButton>
      ))}
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
      <SliderField
        label="Size"
        min={8}
        max={300}
        step={1}
        value={Math.round(text.fontSize)}
        display={`${Math.round(text.fontSize)}`}
        onChange={(value) => slide({ fontSize: value })}
      />
      <SliderField
        label="Spacing"
        min={-5}
        max={40}
        step={0.5}
        value={text.letterSpacing ?? 0}
        display={`${text.letterSpacing ?? 0}`}
        onChange={(value) => slide({ letterSpacing: value })}
      />

      <div className="toolbar-divider" />
      <label className="toolbar-field">
        <span>Color</span>
        <input type="color" value={text.color} onChange={(e) => updateText({ color: e.target.value })} />
      </label>
      <ToolButton
        active={!!text.gradient}
        onClick={() =>
          updateText({
            gradient: text.gradient ? undefined : { to: '#ff6a00', angle: 90 },
          })
        }
        title="Gradient Fill"
        className="export-btn"
      >
        Gradient
      </ToolButton>
      {text.gradient && (
        <>
          <label className="toolbar-field">
            <span>To</span>
            <input
              type="color"
              value={text.gradient.to}
              onChange={(e) =>
                updateText({
                  gradient: { ...text.gradient!, to: e.target.value },
                })
              }
            />
          </label>
          <SliderField
            label="Angle"
            min={0}
            max={360}
            step={1}
            value={text.gradient.angle}
            display={`${Math.round(text.gradient.angle)}°`}
            onChange={(value) => slide({ gradient: { ...text.gradient!, angle: value } })}
          />
        </>
      )}

      <ToolButton
        active={!!text.outline}
        onClick={() =>
          updateText({
            outline: text.outline ? undefined : { color: '#000000', width: 3 },
          })
        }
        title="Outline"
        className="export-btn"
      >
        Outline
      </ToolButton>
      {text.outline && (
        <>
          <label className="toolbar-field">
            <span>Outline Color</span>
            <input
              type="color"
              value={text.outline.color}
              onChange={(e) =>
                updateText({
                  outline: { ...text.outline!, color: e.target.value },
                })
              }
            />
          </label>
          <SliderField
            label="Width"
            min={0.5}
            max={16}
            step={0.5}
            value={text.outline.width}
            display={`${text.outline.width}`}
            onChange={(value) => slide({ outline: { ...text.outline!, width: value } })}
          />
        </>
      )}

      <ToolButton
        active={!!text.extrusion}
        onClick={() =>
          updateText({
            extrusion: text.extrusion ? undefined : { color: '#555555', depth: 8, angle: 45 },
          })
        }
        title="3D Extrusion"
        className="export-btn"
      >
        3D
      </ToolButton>
      {text.extrusion && (
        <>
          <label className="toolbar-field">
            <span>Side Color</span>
            <input
              type="color"
              value={text.extrusion.color}
              onChange={(e) =>
                updateText({
                  extrusion: { ...text.extrusion!, color: e.target.value },
                })
              }
            />
          </label>
          <SliderField
            label="Depth"
            min={1}
            max={40}
            step={1}
            value={text.extrusion.depth}
            display={`${Math.round(text.extrusion.depth)}`}
            onChange={(value) => slide({ extrusion: { ...text.extrusion!, depth: value } })}
          />
          <SliderField
            label="Direction"
            min={0}
            max={360}
            step={1}
            value={text.extrusion.angle}
            display={`${Math.round(text.extrusion.angle)}°`}
            onChange={(value) => slide({ extrusion: { ...text.extrusion!, angle: value } })}
          />
        </>
      )}

      <div className="toolbar-divider" />
      <WarpButton text={text} onChange={updateText} />
      {text.warp && (
        <SliderField
          label="Amount"
          min={0}
          max={100}
          step={1}
          value={text.warp.amount}
          display={`${Math.round(text.warp.amount)}`}
          onChange={(value) => slide({ warp: { ...text.warp!, amount: value } })}
        />
      )}
    </div>
  );
}
