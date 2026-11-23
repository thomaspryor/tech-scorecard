import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { POSTHOG_HOST } from '../src/config/analytics';

// The CSP and the /ingest rewrites live in vercel.json, so a local `serve out` never applies them.
// These tests are the only thing that catches analytics the production CSP blocks or a proxy path
// that no rewrite serves.
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));

function cspDirectives(): Record<string, string[]> {
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

describe('PostHog goes through this site (ad blockers block posthog.com)', () => {
  const csp = cspDirectives();
  const rewrites: { source: string; destination: string }[] = config.rewrites ?? [];

  it('sends events to a path on this site, which connect-src self allows', () => {
    expect(POSTHOG_HOST.startsWith('/')).toBe(true);
    expect(csp['connect-src']).toContain("'self'");
    expect(csp['script-src']).toContain("'self'");
  });

  it('rewrites every PostHog path to PostHog', () => {
    const find = (src: string) => rewrites.find((r) => r.source === src)?.destination;
    expect(find(`${POSTHOG_HOST}/static/:path*`)).toBe('https://us-assets.i.posthog.com/static/:path*');
    expect(find(`${POSTHOG_HOST}/array/:path*`)).toBe('https://us-assets.i.posthog.com/array/:path*');
    expect(find(`${POSTHOG_HOST}/:path*`)).toBe('https://us.i.posthog.com/:path*');
    // Vercel uses the first match, so the catch-all must come after the asset paths.
    expect(rewrites.findIndex((r) => r.source === `${POSTHOG_HOST}/:path*`)).toBe(rewrites.length - 1);
  });

  it('no longer allows posthog.com directly, so a stray direct call shows up as a CSP error', () => {
    expect(csp['connect-src'].join(' ')).not.toContain('posthog.com');
    expect(csp['script-src'].join(' ')).not.toContain('posthog.com');
  });
});
