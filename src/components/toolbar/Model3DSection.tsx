import { useRef, useState } from 'react';
import {
  CollageModel3D,
  DEFAULT_ROTATION_3D,
  DirectionalLightData,
  Model3DMaterial,
  Model3DTexture,
  TEXTURE_PRESETS,
  TexturePreset,
  Tool,
} from '../../types';
import { fileToTextureDataURL } from '../../utils/textureImage';
import { Rotate3DIcon, LightIcon } from '../ToolbarIcons';
import { SliderField, ToolButton } from './primitives';
import { usePopupMenu } from './usePopupMenu';
import type { UpdateObject } from './types';

const TEXTURE_LABELS: Record<TexturePreset | 'none' | 'image', string> = {
  none: 'No Texture',
  checker: 'Checker',
  grid: 'Grid',
  stripes: 'Stripes',
  dots: 'Dots',
  noise: 'Noise',
  brushed: 'Brushed',
  image: 'Custom Image',
};

interface Props {
  model: CollageModel3D;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onUpdate: UpdateObject;
}

// A 3D object's own controls: orbiting, the directional light, and its
// surface (colour, texture, metalness, roughness).
export function Model3DSection({ model, tool, onToolChange, onUpdate }: Props) {
  const textureMenu = usePopupMenu();
  const textureFileRef = useRef<HTMLInputElement>(null);
  const [textureError, setTextureError] = useState<string | null>(null);

  // Lighting and material are continuous adjustments, so they coalesce into a
  // single undo step the same way the opacity and shadow sliders do.
  const updateLight = (changes: Partial<DirectionalLightData>) => {
    onUpdate(model.id, { light: { ...model.light, ...changes } }, { coalesce: true });
  };

  const updateMaterial = (changes: Partial<Model3DMaterial>) => {
    onUpdate(model.id, { material: { ...model.material, ...changes } }, { coalesce: true });
  };

  // Choosing a texture is discrete, so it gets its own undo step rather than
  // coalescing into whatever slider was last touched.
  const setTexture = (texture: Model3DTexture | undefined) => {
    onUpdate(model.id, { material: { ...model.material, texture } });
    textureMenu.close();
  };

  const handleTextureFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const src = await fileToTextureDataURL(file);
      setTextureError(null);
      setTexture({ source: 'image', src, repeat: model.material.texture?.repeat ?? 1 });
    } catch (err) {
      setTextureError(err instanceof Error ? err.message : 'Could not load that texture.');
      textureMenu.close();
    }
  };

  return (
    <>
      <div className="toolbar-section">
        <ToolButton
          active={tool === 'rotate3d'}
          onClick={() => onToolChange(tool === 'rotate3d' ? 'select' : 'rotate3d')}
          title="3D Rotate (R)"
        >
          <Rotate3DIcon />
        </ToolButton>
        <ToolButton
          onClick={() => onUpdate(model.id, { rotation3D: { ...DEFAULT_ROTATION_3D } })}
          title="Reset 3D Rotation"
          className="export-btn"
        >
          Reset
        </ToolButton>
        <span className="mask-hint">
          {tool === 'rotate3d'
            ? 'Drag anywhere to turn it; hold Shift to roll'
            : 'Grab a ring on the object to turn it; hold Shift to snap to 15°'}
        </span>
      </div>

      <div className="toolbar-section">
        <span className="toolbar-field"><LightIcon /></span>
        <SliderField
          label="Azimuth"
          min={0}
          max={360}
          step={1}
          value={model.light.azimuth}
          display={`${Math.round(model.light.azimuth)}°`}
          onChange={(value) => updateLight({ azimuth: value })}
        />
        <SliderField
          label="Elevation"
          min={-90}
          max={90}
          step={1}
          value={model.light.elevation}
          display={`${Math.round(model.light.elevation)}°`}
          onChange={(value) => updateLight({ elevation: value })}
        />
        <SliderField
          label="Intensity"
          min={0}
          max={5}
          step={0.1}
          value={model.light.intensity}
          display={model.light.intensity.toFixed(1)}
          onChange={(value) => updateLight({ intensity: value })}
        />
        <SliderField
          label="Ambient"
          min={0}
          max={2}
          step={0.1}
          value={model.light.ambient}
          display={model.light.ambient.toFixed(1)}
          onChange={(value) => updateLight({ ambient: value })}
        />
        <label className="toolbar-field">
          <span>Light</span>
          <input
            type="color"
            value={model.light.color}
            onChange={(e) => updateLight({ color: e.target.value })}
          />
        </label>
      </div>

      <div className="toolbar-section">
        <label className="toolbar-field">
          <span>Colour</span>
          <input
            type="color"
            value={model.material.color}
            onChange={(e) => updateMaterial({ color: e.target.value })}
          />
        </label>

        <div className="blend-mode-field">
          <ToolButton
            ref={textureMenu.buttonRef}
            onClick={textureMenu.toggle}
            title="Texture"
            active={!!textureMenu.pos}
            className="export-btn"
          >
            {TEXTURE_LABELS[model.material.texture?.source === 'preset'
              ? model.material.texture.preset
              : model.material.texture
                ? 'image'
                : 'none']}
          </ToolButton>
          {textureMenu.pos && (
            <div
              ref={textureMenu.menuRef}
              className="blend-mode-popup shape-picker-popup"
              role="menu"
              style={{ top: textureMenu.pos.top, left: textureMenu.pos.left }}
            >
              <button
                role="menuitem"
                className={`blend-mode-option ${model.material.texture ? '' : 'active'}`}
                onClick={() => setTexture(undefined)}
              >
                None
              </button>
              {TEXTURE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  role="menuitem"
                  className={`blend-mode-option ${
                    model.material.texture?.source === 'preset' &&
                    model.material.texture.preset === preset
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    setTexture({
                      source: 'preset',
                      preset,
                      repeat: model.material.texture?.repeat ?? 2,
                    })
                  }
                >
                  {TEXTURE_LABELS[preset]}
                </button>
              ))}
              <button
                role="menuitem"
                className={`blend-mode-option ${
                  model.material.texture?.source === 'image' ? 'active' : ''
                }`}
                onClick={() => textureFileRef.current?.click()}
              >
                Upload Image…
              </button>
            </div>
          )}
        </div>

        <input
          ref={textureFileRef}
          type="file"
          accept="image/*"
          aria-label="Texture image"
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleTextureFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {model.material.texture && (
          <SliderField
            label="Tiling"
            min={1}
            max={12}
            step={1}
            value={model.material.texture.repeat}
            display={`${model.material.texture.repeat}×`}
            onChange={(value) =>
              updateMaterial({
                texture: { ...model.material.texture!, repeat: value },
              })
            }
          />
        )}

        {textureError && <span className="mask-hint">{textureError}</span>}
        <SliderField
          label="Metalness"
          min={0}
          max={1}
          step={0.05}
          value={model.material.metalness}
          display={`${Math.round(model.material.metalness * 100)}%`}
          onChange={(value) => updateMaterial({ metalness: value })}
        />
        <SliderField
          label="Roughness"
          min={0}
          max={1}
          step={0.05}
          value={model.material.roughness}
          display={`${Math.round(model.material.roughness * 100)}%`}
          onChange={(value) => updateMaterial({ roughness: value })}
        />
      </div>
    </>
  );
}
