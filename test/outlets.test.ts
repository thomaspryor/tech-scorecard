import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { rejectedOn, keepRejected, REJECT_DAYS, NEAR_MISS_DAYS, addDays } from '../scripts/lib/backfill';

const require = createRequire(import.meta.url);
const { outletFor } = require('../scripts/lib/outlets') as typeof import('../scripts/lib/outlets');

const outlets = [
  { id: 'eurogamer', domain: 'eurogamer.net' },
  { id: 'digital-foundry', domain: 'eurogamer.net' },
  { id: 'the-verge', domain: 'theverge.com' },
  { id: 'cnet', domain: 'cnet.com', altDomains: ['cnet.co.uk'] },
];

describe('outletFor', () => {
  it('matches a domain, its subdomains and alternate domains', () => {
    expect(outletFor('https://www.theverge.com/a/b', outlets)?.id).toBe('the-verge');
    expect(outletFor('https://m.cnet.co.uk/x', outlets)?.id).toBe('cnet');
    expect(outletFor('https://example.com/x', outlets)).toBeUndefined();
  });
  it('picks the outlet named in the path when two share a domain', () => {
    expect(outletFor('https://www.eurogamer.net/digitalfoundry-2026-switch-2-review', outlets)?.id).toBe(
      'digital-foundry',
    );
    expect(outletFor('https://www.eurogamer.net/ps6-review', outlets)?.id).toBe('eurogamer');
  });
});

describe('near-miss rejections', () => {
  const today = '2026-11-12';
  it('dates a candidate with 3 or 4 reviews so it comes back after NEAR_MISS_DAYS, others after REJECT_DAYS', () => {
    expect(rejectedOn(today, 0)).toBe(today);
    expect(rejectedOn(today, -1)).toBe(today);
    expect(rejectedOn(today, 2)).toBe(today);
    const near = rejectedOn(today, 4);
    expect(near).toBe(addDays(today, -(REJECT_DAYS - NEAR_MISS_DAYS)));
    expect(Object.keys(keepRejected({ 'backfill:a': near }, addDays(today, NEAR_MISS_DAYS - 1), 30))).toEqual([
      'backfill:a',
    ]);
    expect(Object.keys(keepRejected({ 'backfill:a': near }, addDays(today, NEAR_MISS_DAYS + 1), 30))).toEqual([]);
    expect(Object.keys(keepRejected({ 'backfill:b': today }, addDays(today, NEAR_MISS_DAYS + 1), 30))).toEqual([
      'backfill:b',
    ]);
  });
});
