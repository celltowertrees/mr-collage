import { describe, expect, it } from 'vitest';
import { describeHttpError, describeNetworkError, describeTimeout } from '../utils/openaiErrors';

const body = (message: string, code?: string) => ({ error: { message, code } });

// Maps to CLAUDE.md → "Descriptive Sticker Generation Errors"
describe('describeHttpError', () => {
  it('explains a rejected API key', () => {
    const msg = describeHttpError(401, body('Incorrect API key provided: sk-te**st.', 'invalid_api_key'), '0.4');
    expect(msg).toMatch(/API key was rejected/i);
    expect(msg).toContain('HTTP 401');
    expect(msg).toContain('Incorrect API key provided');
  });

  it('points an unverified organisation at the verification page', () => {
    const msg = describeHttpError(403, body('Your organization must be verified to use the model `gpt-image-1`.'), '0.6');
    expect(msg).toMatch(/verif/i);
    expect(msg).toContain('platform.openai.com/settings/organization/general');
  });

  it('tells running out of credits apart from a rate limit', () => {
    const quota = describeHttpError(429, body('You exceeded your current quota.', 'insufficient_quota'), '0.3');
    const rate = describeHttpError(429, body('Rate limit reached for gpt-image-1.', 'rate_limit_exceeded'), '0.3');
    expect(quota).toMatch(/credits|billing/i);
    expect(rate).toMatch(/rate limit/i);
    expect(rate).not.toMatch(/credits|billing/i);
  });

  it('explains a prompt blocked by the safety system', () => {
    const msg = describeHttpError(400, body('Your request was rejected by the safety system.', 'moderation_blocked'), '4.0');
    expect(msg).toMatch(/safety/i);
    expect(msg).toMatch(/reword/i);
  });

  it('explains a retired or unknown model instead of a generic rejection', () => {
    const msg = describeHttpError(400, body("The model 'gpt-image-1' does not exist.", 'model_not_found'), '1.8');
    expect(msg).toMatch(/no longer offers the image model/i);
    expect(msg).toContain("The model 'gpt-image-1' does not exist.");
  });

  it('blames a server error on OpenAI, not the user', () => {
    const msg = describeHttpError(503, 'upstream connect error', '12.0');
    expect(msg).toMatch(/OpenAI's side/i);
    expect(msg).toContain('HTTP 503');
    expect(msg).toContain('upstream connect error');
  });

  it('still shows OpenAI\'s own message for a status it has no advice for', () => {
    const msg = describeHttpError(418, body('I am a teapot'), '1.0');
    expect(msg).toContain('HTTP 418');
    expect(msg).toContain('I am a teapot');
  });
});

describe('describeTimeout', () => {
  it('says how long it waited and what is normal', () => {
    const msg = describeTimeout(180_000, '180.0');
    expect(msg).toContain('180');
    expect(msg).toMatch(/usually takes/i);
    expect(msg).toContain('status.openai.com');
  });
});

describe('describeNetworkError', () => {
  it('says OpenAI could not be reached and what might be blocking it', () => {
    const msg = describeNetworkError('0.1');
    expect(msg).toMatch(/couldn't reach OpenAI/i);
    expect(msg).toMatch(/connection|extension|VPN|firewall/i);
  });
});
