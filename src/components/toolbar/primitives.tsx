import { forwardRef, type ReactNode } from 'react';

// Building blocks shared by every toolbar section.

interface ToolButtonProps {
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { onClick, title, active, danger, disabled, className, children },
  ref
) {
  const classes = ['toolbar-btn', active && 'active', danger && 'danger', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} className={classes} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
});

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

export function SliderField({ label, value, min, max, step, display, onChange }: SliderFieldProps) {
  return (
    <label className="toolbar-field">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="toolbar-value">{display}</span>
    </label>
  );
}
