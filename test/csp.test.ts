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

  // Not a Vercel emulator: it handles only the `/prefix/:name(.*)` form (a prefix match, as
  // path-to-regexp does for it) and rejects any other source, such as the `:path*` that broke.
  function route(urlPath: string): string | undefined {
    for (const r of rewrites) {
      const m = /^(.*):(\w+)\(\.\*\)$/.exec(r.source);
      if (!m) throw new Error(`unsupported rewrite source ${r.source}: use /prefix/:name(.*)`);
      if (urlPath.startsWith(m[1])) return r.destination.replace(`:${m[2]}`, urlPath.slice(m[1].length));
    }
    return undefined;
  }

  it('rewrites every PostHog request path, including the trailing-slash ones', () => {
    // trailingSlash: true sends /ingest/e to /ingest/e/, and `:path*` does not match a trailing
    // slash, which made every event POST a 404 on 2026-11-23. `:path(.*)` matches it.
    expect(route(`${POSTHOG_HOST}/e/`)).toBe('https://us.i.posthog.com/e/');
    expect(route(`${POSTHOG_HOST}/i/v0/e/`)).toBe('https://us.i.posthog.com/i/v0/e/');
    expect(route(`${POSTHOG_HOST}/flags/`)).toBe('https://us.i.posthog.com/flags/');
    expect(route(`${POSTHOG_HOST}/static/array.js`)).toBe('https://us-assets.i.posthog.com/static/array.js');
    expect(route(`${POSTHOG_HOST}/array/phc_x/config.js`)).toBe(
      'https://us-assets.i.posthog.com/array/phc_x/config.js',
    );
  });

  it('no longer allows posthog.com directly, so a stray direct call shows up as a CSP error', () => {
    expect(csp['connect-src'].join(' ')).not.toContain('posthog.com');
    expect(csp['script-src'].join(' ')).not.toContain('posthog.com');
  });
});
