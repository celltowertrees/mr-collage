const VISION_PROMPT = `Study the provided image carefully. It shows a composite of foreground elements arranged on a collage canvas — you can see their actual positions, sizes, and spatial relationships relative to each other. Any white or pale areas between and around the subjects are empty canvas space, not part of an existing background.

Identify the concrete, literal subject matter of the visible foreground elements.

Using that literal subject matter and spatial composition as your guide, write a 2–3 sentence image generation prompt for a background environment that these subjects would plausibly exist within. If the subjects seem disparate, describe a setting that could plausibly accommodate all of them together. For example, if you see a computer and a pile of bones, describe a setting where both could logically coexist, like a study room with a desk and shelves containing various curiosities.

Rules:
- Base the background entirely on the literal content of the foreground elements, not on abstract color palettes or moods
- Describe a real physical environment — no surreal, painterly, or abstract elements unless the foreground images themselves are that style
- Background should look like a REALISTIC PHOTOGRAPH, not under any circumstances stylized or cartoonish
- Absolutely NO whimsy is allowed
- Output ONLY the image generation prompt, nothing else`;

export interface BgGenerationResult {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  visionPrompt: string;
}

function pickSize(aspectRatio: number): { size: string; naturalWidth: number; naturalHeight: number } {
  if (aspectRatio > 1.2) return { size: '1536x1024', naturalWidth: 1536, naturalHeight: 1024 };
  if (aspectRatio < 0.8) return { size: '1024x1536', naturalWidth: 1024, naturalHeight: 1536 };
  return { size: '1024x1024', naturalWidth: 1024, naturalHeight: 1024 };
}

async function readJson(res: Response): Promise<unknown> {
  const raw = await res.text();
  try { return JSON.parse(raw); } catch { return raw; }
}

function apiError(step: string, status: number, body: unknown, elapsed: string): Error {
  const msg =
    typeof body === 'object' && body !== null
      ? ((body as Record<string, unknown>)?.error as Record<string, unknown>)?.message ?? JSON.stringify(body).slice(0, 400)
      : String(body).slice(0, 400);
  return new Error(`[${step}] HTTP ${status} after ${elapsed}s — ${msg}`);
}

export type VisionDetail = 'low' | 'auto' | 'high';

export interface BgProgressEvent {
  step: 1 | 2;
  label: string;
  visionPrompt?: string;
  elapsedMs: number;
}

export async function analyzeImages(
  imageSrcs: string[],
  apiKey: string,
  visionDetail: VisionDetail = 'low',
  signal: AbortSignal,
  onProgress?: (event: BgProgressEvent) => void
): Promise<string> {
  const t0 = Date.now();
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);
  const elapsedMs = () => Date.now() - t0;

  onProgress?.({
    step: 1,
    label: `Analyzing composition with GPT-4o (detail: ${visionDetail})…`,
    elapsedMs: elapsedMs(),
  });

  const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            ...imageSrcs.map((src) => ({
              type: 'image_url',
              image_url: { url: src, detail: visionDetail },
            })),
          ],
        },
      ],
    }),
  });

  if (!visionRes.ok) {
    throw apiError('vision', visionRes.status, await readJson(visionRes), elapsed());
  }

  const visionJson = await readJson(visionRes) as Record<string, unknown>;
  const visionPrompt = (
    (visionJson?.choices as { message: { content: string } }[])?.[0]?.message?.content ?? ''
  ).trim();

  if (!visionPrompt) {
    throw new Error(`[vision] Model returned empty prompt after ${elapsed()}s. Full response: ${JSON.stringify(visionJson).slice(0, 400)}`);
  }

  return visionPrompt;
}

export async function generateBackgroundFromPrompt(
  prompt: string,
  apiKey: string,
  aspectRatio: number,
  signal: AbortSignal,
  onProgress?: (event: BgProgressEvent) => void
): Promise<BgGenerationResult> {
  const t0 = Date.now();
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);
  const elapsedMs = () => Date.now() - t0;

  const { size, naturalWidth, naturalHeight } = pickSize(aspectRatio);

  onProgress?.({
    step: 2,
    label: `Generating ${size} background with gpt-image-1…`,
    visionPrompt: prompt,
    elapsedMs: elapsedMs(),
  });

  const genRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: `${prompt} This is a background for a digital collage — wide establishing shot, environment and setting only, no foreground subjects.`,
      n: 1,
      size,
      background: 'opaque',
    }),
  });

  if (!genRes.ok) {
    throw apiError('image-gen', genRes.status, await readJson(genRes), elapsed());
  }

  const genJson = await readJson(genRes) as Record<string, unknown>;
  const b64 = (genJson?.data as { b64_json?: string }[])?.[0]?.b64_json;

  if (!b64) {
    throw new Error(`[image-gen] Unexpected response shape after ${elapsed()}s: ${JSON.stringify(genJson).slice(0, 400)}`);
  }

  return { dataUrl: `data:image/png;base64,${b64}`, naturalWidth, naturalHeight, visionPrompt: prompt };
}

export async function generateBackground(
  imageSrcs: string[],
  apiKey: string,
  aspectRatio: number,
  signal: AbortSignal,
  visionDetail: VisionDetail = 'low',
  onProgress?: (event: BgProgressEvent) => void
): Promise<BgGenerationResult> {
  const visionPrompt = await analyzeImages(imageSrcs, apiKey, visionDetail, signal, onProgress);
  return generateBackgroundFromPrompt(visionPrompt, apiKey, aspectRatio, signal, onProgress);
}
