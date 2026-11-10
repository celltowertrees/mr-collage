import { IMAGE_MODEL, describeHttpError } from './openaiErrors';

const VISION_PROMPT = `Study the provided image carefully. It shows a composite of foreground elements arranged on a collage canvas — you can see their actual positions, sizes, and spatial relationships relative to each other. Any white or pale areas between and around the subjects are empty canvas space, not part of an existing background.

Identify the concrete, literal subject matter of the visible foreground elements.

Using that literal subject matter and spatial composition as your guide, write a 2–3 sentence image generation prompt for a background environment that these subjects would plausibly exist within. If the subjects seem disparate, describe a setting that could plausibly accommodate all of them together.

Examples:
- If you see a computer and a pile of bones, describe a setting where both could logically coexist, like a prehistoric cave full of primitive renditions of technological devices
- If you see a group of people, describe a setting where they could naturally gather depending on their appearance and clothing, such as a conference hall, dark alleyway, presidential palace, hotel suite, protest, or street market.
- If you see a combination of objects or subjects that do not obviously belong together, describe a neutral or versatile setting that could plausibly accommodate all of them, such as a generic room, an open field, or a public space.

These are ONLY EXAMPLES. Do not feel constrained by them; use your judgment to create a suitable background for the given foreground elements. Do not always generate a prehistoric cave whenever you see bones. The point is NOT to follow them as rules but to take them as guidelines. Try to do your very best to find a background that could accommodate all of the visible foreground elements. You can get creative with the subject matter.

Rules:
- Base the background entirely on the literal content of the foreground elements, not on abstract color palettes or moods
- Describe a real physical environment — no surreal, painterly, or abstract elements unless the foreground images themselves are that style
- Background should look like a REALISTIC PHOTOGRAPH, not under any circumstances stylized or cartoonish
- Background should be a background, and NOT contain any foreground characters or objects. It should not be a copy or interpretation of what you see in the image. It should COMPLEMENT the image
- Absolutely NO whimsy is allowed
- Do not make anything "surreal". Do not include any mention of the word "surreal".
- The background will be painted around these subjects exactly where they are, so say where the ground, the horizon and the main light source sit such that the subjects, at the positions and sizes shown, would be standing inside the scene rather than floating in front of it
- Output ONLY the image generation prompt, nothing else`;

// The name every generated background is given. A later generation over the
// same area uses it to leave earlier backgrounds out of what the model sees.
export const AI_BACKGROUND_NAME = 'AI Background';

// What follows the user's (editable) scene description. The model is handed
// the objects as they sit on the canvas, so this is about fitting the scene
// to them rather than describing them.
const PAINT_AROUND_INSTRUCTIONS = `The attached image shows the subjects of a digital collage on an empty white canvas. Paint that scene into the empty canvas around and behind them, so the subjects are standing inside it rather than pasted on top of it. Keep every subject exactly where it is, at exactly the size and shape shown, and do not redraw, move, restyle or cover any of them. Fit the scene to them: choose a camera height, horizon line and scale that agree with how big the subjects are and where they sit in the frame, put a surface under whatever needs something to stand or rest on, and light the scene from a direction consistent with the subjects' own lighting, with soft contact shadows where they meet a surface. Fill the entire frame edge to edge with the environment, leave no white canvas, and add no new foreground subjects, text or borders.`;

async function readJson(res: Response): Promise<unknown> {
  const raw = await res.text();
  try { return JSON.parse(raw); } catch { return raw; }
}

function apiError(step: string, status: number, body: unknown, elapsed: string): Error {
  return new Error(`[${step}] ${describeHttpError(status, body, elapsed)}`);
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

export interface PaintBackgroundRequest {
  prompt: string;
  apiKey: string;
  // The objects as they sit on the canvas, flattened onto white.
  picture: Blob;
  // Same dimensions: opaque over the objects, transparent where to paint.
  mask: Blob;
  // The API `size` the picture and mask were rendered at.
  size: string;
  signal: AbortSignal;
  onProgress?: (event: BgProgressEvent) => void;
}

// Has the image model paint a scene into the empty canvas around the objects
// (the image-edit endpoint, with the objects masked off) rather than generate
// an unrelated picture from a description of them. Returns a PNG data URL the
// same shape as `picture`, with the objects still in place inside it.
export async function paintBackgroundAround({
  prompt,
  apiKey,
  picture,
  mask,
  size,
  signal,
  onProgress,
}: PaintBackgroundRequest): Promise<string> {
  const t0 = Date.now();
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);

  onProgress?.({
    step: 2,
    label: `Painting a ${size} background around your objects with ${IMAGE_MODEL}…`,
    visionPrompt: prompt,
    elapsedMs: Date.now() - t0,
  });

  const form = new FormData();
  form.append('model', IMAGE_MODEL);
  form.append('prompt', `${prompt} ${PAINT_AROUND_INSTRUCTIONS}`);
  form.append('image', picture, 'collage.png');
  form.append('mask', mask, 'mask.png');
  form.append('size', size);
  form.append('n', '1');

  // No Content-Type header: the browser sets the multipart boundary itself.
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    throw apiError('image-edit', res.status, await readJson(res), elapsed());
  }

  const json = await readJson(res) as Record<string, unknown>;
  const b64 = (json?.data as { b64_json?: string }[])?.[0]?.b64_json;

  if (!b64) {
    throw new Error(`[image-edit] Unexpected response shape after ${elapsed()}s: ${JSON.stringify(json).slice(0, 400)}`);
  }

  return `data:image/png;base64,${b64}`;
}
