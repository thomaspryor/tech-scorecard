import { describe, expect, it } from 'vitest';
import { issueBody, keyFindings, storedVerdict } from '../scripts/lib/health';

describe('keyFindings', () => {
  it('reports a rejected key as something only the owner can fix', () => {
    expect(keyFindings({ name: 'OpenAI', kind: 'required', status: 401 })[0].level).toBe('action');
    expect(keyFindings({ name: 'Gemini', kind: 'required', status: 400, body: { error: {} } })[0].level).toBe('action');
    // ScrapingDog answers a bad key with success:false (HTTP 400 or 500), not 401.
    expect(keyFindings({ name: 'ScrapingDog', kind: 'required', status: 500, body: { success: false } })[0].level).toBe(
      'action',
    );
  });

  it('does not call a key rejected when a proxy in between answered 403', () => {
    expect(keyFindings({ name: 'ScrapingBee', kind: 'fallback', status: 403 })).toEqual([
      { level: 'note', text: 'ScrapingBee: could not be checked (HTTP 403).' },
    ]);
    expect(
      keyFindings({ name: 'ScrapingBee', kind: 'fallback', status: 403, body: { message: 'Invalid api key' } })[0]
        .level,
    ).toBe('action');
  });

  it('flags low or spent credits: owner action for a service the site depends on, a note for a fallback', () => {
    const dog = (used: number) =>
      keyFindings({
        name: 'ScrapingDog',
        kind: 'required',
        status: 200,
        body: { requestLimit: 1000, requestUsed: used },
      });
    expect(dog(500)).toEqual([]);
    expect(dog(950)[0]).toMatchObject({ level: 'action', text: 'ScrapingDog: under 10% of its credits left.' });
    // The changing numbers stay out of the line the alert compares, so a lasting problem is not posted again every week.
    expect(dog(960)[0].text).toBe(dog(950)[0].text);
    expect(dog(950)[0].detail).toMatch(/50 of 1000 left/);
    expect(dog(1000)[0].text).toMatch(/out of credits/);
    const bee = keyFindings({
      name: 'ScrapingBee',
      kind: 'fallback',
      status: 200,
      body: { max_api_credit: 250000, used_api_credit: 249000, renewal_subscription_date: '2026-12-05T19:40:36' },
    });
    expect(bee).toEqual([
      {
        level: 'note',
        text: 'ScrapingBee: under 10% of its credits left.',
        detail: '1000 of 250000 left (0%). It renews 2026-12-05.',
      },
    ]);
  });

  it('treats a quota error as owner action only for a service the site depends on', () => {
    expect(keyFindings({ name: 'OpenAI', kind: 'required', status: 429 })[0].level).toBe('action');
    expect(keyFindings({ name: 'ScrapingBee', kind: 'fallback', status: 429 })[0].level).toBe('note');
  });
});

describe('storedVerdict', () => {
  const base = { status: 200, blocked: false, textLength: 9000, quoteFound: true };
  it('finds gone pages and full pages without the quote, and nothing else', () => {
    expect(storedVerdict(base)).toBe('ok');
    expect(storedVerdict({ ...base, status: 404 })).toBe('gone');
    expect(storedVerdict({ ...base, status: 410 })).toBe('gone');
    expect(storedVerdict({ ...base, quoteFound: false })).toBe('quote-missing');
  });
  it('does not judge a page it could not read properly', () => {
    expect(storedVerdict({ ...base, status: 403, quoteFound: false })).toBe('unknown');
    expect(storedVerdict({ ...base, blocked: true, quoteFound: false })).toBe('unknown');
    expect(storedVerdict({ ...base, textLength: 1200, quoteFound: false })).toBe('unknown');
    expect(storedVerdict({ ...base, status: 0 })).toBe('unknown');
  });
});

describe('issueBody', () => {
  it('is empty without an action finding, so a note alone never opens an issue', () => {
    expect(issueBody('Intro', [{ level: 'note', text: 'Fallback low.' }])).toBe('');
  });
  it('lists action findings as "- " lines and notes apart', () => {
    const body = issueBody('Intro', [
      { level: 'action', text: 'OpenAI: rejected.' },
      { level: 'note', text: 'ScrapingBee: low.' },
    ]);
    expect(body).toContain('- OpenAI: rejected.');
    expect(body).not.toContain('- ScrapingBee');
    expect(body).toContain('  ScrapingBee: low.');
    const withDetail = issueBody('Intro', [{ level: 'action', text: 'X: low.', detail: '5 of 100 left.' }]);
    expect(withDetail.split('\n').filter((l) => l.startsWith('- '))).toEqual(['- X: low.']);
    expect(withDetail).toContain('  5 of 100 left.');
  });
});
