import { useEffect, useRef, useState } from 'react';

const API_KEY_STORAGE_KEY = 'mr-collage-openai-key';
const TIMEOUT_MS = 90_000;

interface StickerGeneratorProps {
  onAddSticker: (src: string, name: string, width: number, height: number) => void;
  onClose: () => void;
}

export function StickerGenerator({ onAddSticker, onClose }: StickerGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) ?? '');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  const handleGenerate = async () => {
    const key = apiKey.trim();
    const text = prompt.trim();
    if (!key) { setError('Enter your OpenAI API key.'); return; }
    if (!text) { setError('Enter a prompt.'); return; }

    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = Date.now();

    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: `${text}. The subject must be shown in full, with clear empty space on all sides — nothing cropped, clipped, or touching the edges of the image.`,
          n: 1,
          size: '1024x1024',
          background: 'transparent',
        }),
      });

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

      if (!res.ok) {
        const raw = await res.text();
        let detail = raw;
        try {
          const body = JSON.parse(raw);
          detail = body?.error?.message ?? raw;
        } catch { /* use raw text */ }
        throw new Error(`HTTP ${res.status} after ${elapsed}s: ${detail}`);
      }

      const raw = await res.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(`Non-JSON response after ${elapsed}s: ${raw.slice(0, 300)}`);
      }

      const b64 = (json?.data as { b64_json?: string }[])?.[0]?.b64_json;
      if (!b64) throw new Error(`Unexpected response shape after ${elapsed}s: ${raw.slice(0, 300)}`);

      const dataUrl = `data:image/png;base64,${b64}`;
      const img = new Image();
      img.onload = () => {
        onAddSticker(dataUrl, text, img.naturalWidth, img.naturalHeight);
        onClose();
      };
      img.onerror = () => {
        setError('Image decoded but could not be rendered (corrupted data?).');
        setLoading(false);
      };
      img.src = dataUrl;
    } catch (err) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError(`Request timed out after ${elapsed}s (${TIMEOUT_MS / 1000}s limit). OpenAI may be slow — try again.`);
      } else {
        setError(err instanceof Error ? err.message : `Unknown error after ${elapsed}s.`);
      }
      setLoading(false);
    } finally {
      clearTimeout(timeout);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGenerate();
  };

  return (
    <div className="sticker-backdrop">
      <div className="sticker-modal" role="dialog" aria-modal="true" aria-label="Generate Sticker">
        <div className="sticker-modal-header">
          <span className="sticker-modal-title">Generate Sticker</span>
          {!loading && (
            <button className="sticker-close-btn" onClick={onClose} title="Close (Esc)">✕</button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="sticker-form">
          <label className="sticker-label">
            <span>Prompt</span>
            <textarea
              ref={promptRef}
              className="sticker-prompt"
              placeholder="a fluffy orange cat wearing sunglasses"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
            />
          </label>

          <details className="sticker-key-section">
            <summary className="sticker-key-summary">
              OpenAI API key {apiKey ? '(saved)' : '(required)'}
            </summary>
            <div className="sticker-key-row">
              <input
                type={showKey ? 'text' : 'password'}
                className="sticker-key-input"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
              <button
                type="button"
                className="sticker-key-toggle"
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              {apiKey && (
                <button
                  type="button"
                  className="sticker-key-toggle danger"
                  onClick={() => {
                    setApiKey('');
                    localStorage.removeItem(API_KEY_STORAGE_KEY);
                  }}
                  title="Clear saved key"
                >
                  Clear
                </button>
              )}
            </div>
          </details>

          {error && <div className="sticker-error">{error}</div>}

          <div className="sticker-actions">
            <span className="sticker-hint">⌘↵ to generate</span>
            <button type="submit" className="sticker-generate-btn" disabled={loading}>
              {loading ? <span className="sticker-spinner" /> : '✦ Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
