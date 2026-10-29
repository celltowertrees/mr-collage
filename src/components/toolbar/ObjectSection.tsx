import { BLEND_MODES, BlendMode, CollageObject, ObjectChanges } from '../../types';
import {
  BringToFrontIcon, SendToBackIcon, DuplicateIcon, DeleteIcon, FlipHorizontalIcon, FlipVerticalIcon,
} from '../ToolbarIcons';
import { SliderField, ToolButton } from './primitives';
import { usePopupMenu } from './usePopupMenu';
import type { UpdateObject } from './types';

function formatBlendModeLabel(mode: BlendMode): string {
  return mode
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

interface Props {
  obj: CollageObject;
  onUpdate: UpdateObject;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

// What every kind of object has: opacity, rotation, blend mode, stacking,
// duplicate/delete, and flipping.
export function ObjectSection({ obj, onUpdate, onBringToFront, onSendToBack, onDuplicate, onDelete }: Props) {
  const blendMenu = usePopupMenu();
  const update = (changes: ObjectChanges, options?: { coalesce?: boolean }) => onUpdate(obj.id, changes, options);

  return (
    <div className="toolbar-section">
      <SliderField
        label="Opacity"
        min={0}
        max={1}
        step={0.05}
        value={obj.opacity}
        display={`${Math.round(obj.opacity * 100)}%`}
        onChange={(value) => update({ opacity: value }, { coalesce: true })}
      />

      <SliderField
        label="Rotation"
        min={0}
        max={360}
        step={1}
        value={obj.rotation}
        display={`${Math.round(obj.rotation)}°`}
        onChange={(value) => update({ rotation: value }, { coalesce: true })}
      />

      <div className="blend-mode-field">
        <ToolButton
          ref={blendMenu.buttonRef}
          onClick={blendMenu.toggle}
          title="Blend Mode"
          active={!!blendMenu.pos}
          className="export-btn"
        >
          {formatBlendModeLabel(obj.blendMode ?? 'normal')}
        </ToolButton>
        {blendMenu.pos && (
          <div
            ref={blendMenu.menuRef}
            className="blend-mode-popup"
            role="menu"
            style={{ top: blendMenu.pos.top, left: blendMenu.pos.left }}
          >
            {BLEND_MODES.map((mode) => (
              <button
                key={mode}
                role="menuitem"
                className={`blend-mode-option ${(obj.blendMode ?? 'normal') === mode ? 'active' : ''}`}
                onClick={() => {
                  update({ blendMode: mode === 'normal' ? undefined : mode });
                  blendMenu.close();
                }}
              >
                {formatBlendModeLabel(mode)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      <ToolButton onClick={() => onBringToFront(obj.id)} title="Bring to Front">
        <BringToFrontIcon />
      </ToolButton>
      <ToolButton onClick={() => onSendToBack(obj.id)} title="Send to Back">
        <SendToBackIcon />
      </ToolButton>
      <ToolButton onClick={() => onDuplicate(obj.id)} title="Duplicate">
        <DuplicateIcon />
      </ToolButton>
      <ToolButton danger onClick={() => onDelete(obj.id)} title="Delete">
        <DeleteIcon />
      </ToolButton>
      <div className="toolbar-divider" />
      <ToolButton active={obj.flipX} onClick={() => update({ flipX: !obj.flipX })} title="Flip Horizontal">
        <FlipHorizontalIcon />
      </ToolButton>
      <ToolButton active={obj.flipY} onClick={() => update({ flipY: !obj.flipY })} title="Flip Vertical">
        <FlipVerticalIcon />
      </ToolButton>
    </div>
  );
}
