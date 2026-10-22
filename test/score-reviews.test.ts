import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askGemini, askOpenAI, needsScoring, parseJson } from '../scripts/score-reviews';
import { review } from './fixtures';

const OPENAI_KEY = 'sk-test-openai-0123456789';
const GEMINI_KEY = 'AIza-test-gemini-0123456789';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', OPENAI_KEY);
  vi.stubEnv('GEMINI_API_KEY', GEMINI_KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('parseJson', () => {
  it('pulls the JSON object out of a model reply', () => {
    expect(parseJson('Sure! {"score": 88, "reason": "ok"} done')).toEqual({ score: 88, reason: 'ok' });
  });
  it.each(['', 'no json', '{"score": "high"}', '{bad json}'])('returns null for %j', (s) => {
    expect(parseJson(s)).toBeNull();
  });
});

describe('model calls', () => {
  it('sends the OpenAI key as a bearer header', async () => {
    const fetch = mockFetch(200, { choices: [{ message: { content: '{"score": 91, "reason": "r"}' } }] });
    await expect(askOpenAI('prompt')).resolves.toEqual({ score: 91, reason: 'r' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(OPENAI_KEY);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${OPENAI_KEY}`);
  });

  it('sends the Gemini key as a header, not in the URL', async () => {
    const fetch = mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"score": 72, "reason": "r"}' }] } }] });
    await expect(askGemini('prompt')).resolves.toEqual({ score: 72, reason: 'r' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(GEMINI_KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(GEMINI_KEY);
  });

  it('reports API errors without the key', async () => {
    mockFetch(401, { error: { message: 'Incorrect API key provided' } });
    const err = await askOpenAI('prompt').catch((e: Error) => e);
    expect(String(err)).toMatch(/HTTP 401: Incorrect API key/);
    expect(String(err)).not.toContain(OPENAI_KEY);
  });
});

describe('needsScoring', () => {
  const done = { modelScores: { openai: 93, gemini: 94 }, scoreBand: [91, 100] as [number, number] };

  it('skips reviews both models already placed', () => {
    expect(needsScoring(review({ rating: '9/10', ...done }))).toBe(false);
    expect(needsScoring(review({ rating: null, scoreSource: 'text', modelScores: { openai: 70, gemini: 72 } }))).toBe(
      false,
    );
  });

  it('picks up unscored reviews', () => {
    expect(needsScoring(review({ rating: '9/10' }))).toBe(true);
  });

  it('picks up reviews whose rating changed since they were placed', () => {
    expect(needsScoring(review({ rating: '4/5', ...done }))).toBe(true);
  });
});
