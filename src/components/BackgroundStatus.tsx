import { useEffect, useState } from 'react';
import type { BgProgressEvent } from '../utils/generateBackground';

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="bg-status-elapsed">{m}:{s.toString().padStart(2, '0')}</span>;
}

export function BgStatusPanel({ progress, startedAt }: { progress: BgProgressEvent; startedAt: number }) {
  const step1Done = progress.step === 2;
  const visionPrompt = progress.visionPrompt ?? null;

  return (
    <div className="bg-status-panel">
      <div className="bg-status-header">
        <span className="bg-status-title">Generating Background</span>
        <ElapsedTimer startedAt={startedAt} />
      </div>
      <div className="bg-status-steps">
        <div className={`bg-status-step ${step1Done ? 'done' : 'active'}`}>
          <span className="bg-status-dot">{step1Done ? '✓' : '○'}</span>
          <span>
            {step1Done ? 'Vision analysis complete' : progress.label}
          </span>
        </div>
        <div className={`bg-status-step ${step1Done ? 'active' : 'pending'}`}>
          <span className="bg-status-dot">{step1Done ? '○' : '·'}</span>
          <span>{step1Done ? progress.label : 'Generating background image…'}</span>
        </div>
      </div>
      {visionPrompt && (
        <div className="bg-status-prompt">
          <span className="bg-status-prompt-label">Vision prompt</span>
          <span className="bg-status-prompt-text">{visionPrompt}</span>
        </div>
      )}
    </div>
  );
}

export function BgPromptEditPanel({
  prompt,
  startedAt,
  onGenerate,
  onCancel,
}: {
  prompt: string;
  startedAt: number;
  onGenerate: (prompt: string) => void;
  onCancel: () => void;
}) {
  const [edited, setEdited] = useState(prompt);
  return (
    <div className="bg-status-panel bg-prompt-edit-panel">
      <div className="bg-status-header">
        <span className="bg-status-title">Edit Vision Prompt</span>
        <ElapsedTimer startedAt={startedAt} />
      </div>
      <p className="bg-prompt-hint">GPT-4o derived this prompt from your images. Edit it before generating.</p>
      <textarea
        className="bg-prompt-textarea"
        value={edited}
        onChange={(e) => setEdited(e.target.value)}
        rows={5}
        autoFocus
      />
      <div className="bg-prompt-actions">
        <button className="bg-prompt-cancel" onClick={onCancel}>Cancel</button>
        <button
          className="bg-prompt-generate"
          onClick={() => onGenerate(edited.trim())}
          disabled={!edited.trim()}
        >
          Generate →
        </button>
      </div>
    </div>
  );
}
