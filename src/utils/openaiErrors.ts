// Turns a failed OpenAI request into a message that says what went wrong and
// what to do about it, keeping OpenAI's own wording (and the status and timing)
// at the end so nothing useful for debugging is lost.

// The one image model every generation request names. OpenAI retired
// gpt-image-1 on 2026-10-23; gpt-image-2.5-sunburst is its recommended
// replacement and still supports transparent backgrounds for stickers.
export const IMAGE_MODEL = 'gpt-image-2.5-sunburst';

// Image models regularly need over a minute for one 1024px transparent image,
// so the wait has to be generous before we call it a timeout.
export const IMAGE_TIMEOUT_MS = 180_000;

function openAIMessage(body: unknown): { message: string; code?: string } {
  if (typeof body === 'object' && body !== null) {
    const error = (body as { error?: { message?: unknown; code?: unknown } }).error;
    if (error && typeof error.message === 'string') {
      return { message: error.message, code: typeof error.code === 'string' ? error.code : undefined };
    }
    return { message: JSON.stringify(body).slice(0, 400) };
  }
  return { message: String(body).slice(0, 400) };
}

function advice(status: number, message: string, code?: string): string {
  if (status === 401) {
    return 'Your OpenAI API key was rejected. Check it was pasted in full and hasn\'t been revoked.';
  }
  if (status === 403 && /verif/i.test(message)) {
    return `Your OpenAI organization has to be verified before it can use ${IMAGE_MODEL}. Verify it at platform.openai.com/settings/organization/general, then try again (access can take a few minutes to appear).`;
  }
  if (status === 403) {
    return 'Your OpenAI key doesn\'t have access to this model or endpoint. Check the key\'s project permissions.';
  }
  if (status === 429 && (code === 'insufficient_quota' || code === 'billing_hard_limit_reached' || /quota|billing/i.test(message))) {
    return 'Your OpenAI account is out of credits or has hit its spending limit. Add credits under Billing on platform.openai.com.';
  }
  if (status === 429) {
    return 'OpenAI\'s rate limit was hit. Wait a minute and try again.';
  }
  if (status === 400 && (code === 'moderation_blocked' || /safety/i.test(message))) {
    return 'OpenAI\'s safety system blocked this prompt. Try rewording it.';
  }
  if ((status === 400 || status === 404) && (code === 'model_not_found' || /model .*(does not exist|not found)/i.test(message))) {
    return 'OpenAI no longer offers the image model this app asked for — it has probably been retired. The app needs updating to a current model; there\'s nothing to fix on your end.';
  }
  if (status === 400) {
    return 'OpenAI couldn\'t accept the request.';
  }
  if (status >= 500) {
    return 'OpenAI hit an error on OpenAI\'s side. This usually passes — try again shortly, or check status.openai.com.';
  }
  return 'The request to OpenAI failed.';
}

export function describeHttpError(status: number, body: unknown, elapsedSec: string): string {
  const { message, code } = openAIMessage(body);
  return `${advice(status, message, code)} (HTTP ${status} after ${elapsedSec}s — OpenAI said: ${message})`;
}

export function describeTimeout(limitMs: number, elapsedSec: string): string {
  return `No response from OpenAI after ${limitMs / 1000}s, so the request was stopped. Image generation usually takes 30–90 seconds; when it runs this long OpenAI is often overloaded — check status.openai.com and try again. (Gave up after ${elapsedSec}s.)`;
}

export function describeNetworkError(elapsedSec: string): string {
  return `Couldn't reach OpenAI. Check your internet connection, and whether a browser extension, VPN, or firewall is blocking api.openai.com. (Failed after ${elapsedSec}s.)`;
}
