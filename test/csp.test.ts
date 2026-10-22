import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSTHOG_HOST } from '../src/config/analytics';

// The CSP lives in vercel.json, so a local `serve out` never applies it. This test is the only
// thing that catches a third-party host the site calls but the production CSP blocks.
function cspDirectives(): Record<string, string[]> {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const headers = config.headers.flatMap((h: { headers: { key: string; value: string }[] }) => h.headers);
  const csp = headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')?.value ?? '';
  return Object.fromEntries(
    csp
      .split(';')
      .map((d: string) => d.trim().split(/\s+/))
      .filter((parts: string[]) => parts[0])
      .map((parts: string[]) => [parts[0], parts.slice(1)]),
  );
}

describe('Content-Security-Policy', () => {
  const csp = cspDirectives();
  const assetsHost = POSTHOG_HOST.replace('://us.', '://us-assets.');

  it('lets PostHog send events', () => {
    expect(csp['connect-src']).toContain(POSTHOG_HOST);
  });

  it('lets PostHog load its config script', () => {
    expect(csp['script-src']).toContain(assetsHost);
    expect(csp['connect-src']).toContain(assetsHost);
  });
});
