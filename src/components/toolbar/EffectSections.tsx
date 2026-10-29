import { CollageImage, CollageObject, ShadowData, VignetteData } from '../../types';
import { ShadowIcon, VignetteIcon } from '../ToolbarIcons';
import { SliderField, ToolButton } from './primitives';
import type { UpdateObject } from './types';

const DEFAULT_SHADOW: ShadowData = {
  enabled: true,
  color: '#000000',
  blur: 12,
  offsetX: 6,
  offsetY: 6,
  opacity: 0.5,
};

const DEFAULT_VIGNETTE: VignetteData = {
  enabled: true,
  innerRadius: 0.5,
  outerRadius: 1,
};

export function ShadowSection({ obj, onUpdate }: { obj: CollageObject; onUpdate: UpdateObject }) {
  const shadow = obj.shadow;

  const toggleShadow = () => {
    onUpdate(obj.id, { shadow: { ...(shadow ?? DEFAULT_SHADOW), enabled: !shadow?.enabled } });
  };

  const updateShadow = (changes: Partial<ShadowData>) => {
    onUpdate(obj.id, { shadow: { ...(shadow ?? DEFAULT_SHADOW), ...changes } }, { coalesce: true });
  };

  return (
    <div className="toolbar-section">
      <ToolButton
        active={shadow?.enabled}
        onClick={toggleShadow}
        title={shadow?.enabled ? 'Disable Drop Shadow' : 'Enable Drop Shadow'}
      >
        <ShadowIcon />
      </ToolButton>
      {shadow?.enabled && (
        <>
          <label className="toolbar-field">
            <span>Color</span>
            <input type="color" value={shadow.color} onChange={(e) => updateShadow({ color: e.target.value })} />
          </label>
          <SliderField
            label="Blur"
            min={0}
            max={60}
            step={1}
            value={shadow.blur}
            display={`${Math.round(shadow.blur)}`}
            onChange={(value) => updateShadow({ blur: value })}
          />
          <SliderField
            label="Offset X"
            min={-50}
            max={50}
            step={1}
            value={shadow.offsetX}
            display={`${Math.round(shadow.offsetX)}`}
            onChange={(value) => updateShadow({ offsetX: value })}
          />
          <SliderField
            label="Offset Y"
            min={-50}
            max={50}
            step={1}
            value={shadow.offsetY}
            display={`${Math.round(shadow.offsetY)}`}
            onChange={(value) => updateShadow({ offsetY: value })}
          />
          <SliderField
            label="Opacity"
            min={0}
            max={1}
            step={0.05}
            value={shadow.opacity}
            display={`${Math.round(shadow.opacity * 100)}%`}
            onChange={(value) => updateShadow({ opacity: value })}
          />
        </>
      )}
    </div>
  );
}

export function VignetteSection({ image, onUpdate }: { image: CollageImage; onUpdate: UpdateObject }) {
  const vignette = image.vignette;

  const toggleVignette = () => {
    onUpdate(image.id, { vignette: { ...(vignette ?? DEFAULT_VIGNETTE), enabled: !vignette?.enabled } });
  };

  const updateVignette = (changes: Partial<VignetteData>) => {
    onUpdate(image.id, { vignette: { ...(vignette ?? DEFAULT_VIGNETTE), ...changes } }, { coalesce: true });
  };

  return (
    <div className="toolbar-section">
      <ToolButton
        active={vignette?.enabled}
        onClick={toggleVignette}
        title={vignette?.enabled ? 'Disable Vignette' : 'Enable Vignette'}
      >
        <VignetteIcon />
      </ToolButton>
      {vignette?.enabled && (
        <>
          <SliderField
            label="Inner Radius"
            min={0}
            max={1.5}
            step={0.05}
            value={vignette.innerRadius}
            display={`${Math.round(vignette.innerRadius * 100)}%`}
            onChange={(value) => updateVignette({ innerRadius: value })}
          />
          <SliderField
            label="Outer Radius"
            min={0}
            max={1.5}
            step={0.05}
            value={vignette.outerRadius}
            display={`${Math.round(vignette.outerRadius * 100)}%`}
            onChange={(value) => updateVignette({ outerRadius: value })}
          />
        </>
      )}
    </div>
  );
}
