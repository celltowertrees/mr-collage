import { useEffect, useRef, useState } from 'react';
import { IMAGE_TIMEOUT_MS, describeHttpError, describeNetworkError, describeTimeout } from '../utils/openaiErrors';

const API_KEY_STORAGE_KEY = 'mr-collage-openai-key';

// Style presets offered in the dialog; the picked one's lower-cased label is
// appended to the prompt ("cat smoking a cigar" → "cat smoking a cigar, real photograph").
const STICKER_STYLES = ['Real Photograph', 'Line Drawing', 'Fine Art Illustration', 'Clip Art'];

interface StickerGeneratorProps {
  onAddSticker: (src: string, name: string, width: number, height: number) => void;
  onClose: () => void;
}

export function StickerGenerator({ onAddSticker, onClose }: StickerGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE_KEY) ?? '');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  // The in-flight request, so Cancel (or closing the dialog) can abort it.
  const requestRef = useRef<{ controller: AbortController; cancelled: boolean } | null>(null);

  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  // Abandon a request still running when the dialog goes away.
  useEffect(() => () => requestRef.current?.controller.abort(), []);

  // Tick a visible timer while waiting, so a slow generation reads as
  // "still working" rather than "frozen".
  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    setElapsedSec(0);
    const id = setInterval(() => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const cancel = () => {
    const request = requestRef.current;
    if (!request) return;
    request.cancelled = true;
    request.controller.abort();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (loading) cancel();
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, loading]);

  const handleGenerate = async () => {
    if (loading) return;
    const key = apiKey.trim();
    const text = prompt.trim();
    if (!key) { setError('Enter your OpenAI API key.'); return; }
    if (!text) { setError('Enter a prompt.'); return; }
    const styledText = style ? `${text}, ${style.toLowerCase()}` : text;

    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    setError(null);
    setLoading(true);

    const request = { controller: new AbortController(), cancelled: false };
    requestRef.current = request;
    const timeout = setTimeout(() => request.controller.abort(), IMAGE_TIMEOUT_MS);
    const startedAt = Date.now();
    const elapsed = () => ((Date.now() - startedAt) / 1000).toFixed(1);

    try {
      let res: Response;
      try {
        res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          signal: request.controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-image-1',
            prompt: `${styledText}. The subject must be shown in full, with clear empty space on all sides — nothing cropped, clipped, or touching the edges of the image.`,
            n: 1,
            size: '1024x1024',
            background: 'transparent',
          }),
        });
      } catch (err) {
        // An abort is ours (timeout or Cancel); anything else thrown by
        // fetch itself means the request never got an HTTP answer.
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        throw new Error(describeNetworkError(elapsed()));
      }

      const raw = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        json = raw;
      }

      if (!res.ok) throw new Error(describeHttpError(res.status, json, elapsed()));

      const b64 = ((json as { data?: { b64_json?: string }[] })?.data)?.[0]?.b64_json;
      if (!b64) {
        throw new Error(`OpenAI answered, but without an image in the response. (After ${elapsed()}s: ${raw.slice(0, 300)})`);
      }

      const dataUrl = `data:image/png;base64,${b64}`;
      const img = new Image();
      img.onload = () => {
        onAddSticker(dataUrl, text, img.naturalWidth, img.naturalHeight);
        onClose();
      };
      img.onerror = () => {
        setError('OpenAI sent back image data, but it couldn\'t be decoded as a picture. Try generating again.');
        setLoading(false);
      };
      img.src = dataUrl;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (!request.cancelled) setError(describeTimeout(IMAGE_TIMEOUT_MS, elapsed()));
      } else {
        setError(err instanceof Error ? err.message : `Unknown error after ${elapsed()}s.`);
      }
      setLoading(false);
    } finally {
      clearTimeout(timeout);
      if (requestRef.current === request) requestRef.current = null;
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

          <label className="sticker-label">
            <span>Style</span>
            <select
              className="sticker-style-select"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              disabled={loading}
            >
              <option value="">None</option>
              {STICKER_STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
            {loading ? (
              <>
                <span className="sticker-hint sticker-progress">
                  Generating… {elapsedSec}s (usually 30–90s)
                </span>
                <button type="button" className="sticker-key-toggle" onClick={cancel}>
                  Cancel
                </button>
              </>
            ) : (
              <span className="sticker-hint">⌘↵ to generate</span>
            )}
            <button type="submit" className="sticker-generate-btn" disabled={loading}>
              {loading ? <span className="sticker-spinner" /> : '✦ Generate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
