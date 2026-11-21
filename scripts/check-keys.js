#!/usr/bin/env node
// Weekly check that every key the pipeline uses still works and has credits left (scripts/lib/health.js decides what counts).
// Free calls only: model lists for OpenAI and Gemini, account or usage pages for the fetch services. Never prints a key.
// Writes .cache/health/keys.md (empty when there is nothing the owner must do) for scripts/alert-issue.sh, and the full list to stdout.
// Ported from Broadway Scorecard's scripts/check-secrets-health.js (same endpoints and the same reading of a rejected key).
const fs = require('fs');
const path = require('path');
const { keyFindings, issueBody } = require('./lib/health');

const OUT = path.join(__dirname, '..', '.cache', 'health');

/**
 * GET that never throws and never reports the URL (it can carry a key).
 * @param {string} url
 * @param {Record<string, string>} [headers]
 */
async function get(url, headers = {}) {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: undefined };
  }
}

/** @type {{name: string, kind: 'required' | 'fallback', env: string[], call: () => Promise<{status: number, body: any}>}[]} */
const CHECKS = [
  {
    name: 'OpenAI',
    kind: 'required',
    env: ['OPENAI_API_KEY'],
    call: () => get('https://api.openai.com/v1/models', { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }),
  },
  {
    name: 'Gemini',
    kind: 'required',
    env: ['GEMINI_API_KEY'],
    call: () => get(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`),
  },
  {
    name: 'ScrapingDog',
    kind: 'required',
    env: ['SCRAPINGDOG_API_KEY'],
    call: () => get(`https://api.scrapingdog.com/account?api_key=${process.env.SCRAPINGDOG_API_KEY}`),
  },
  {
    name: 'ScrapingBee',
    kind: 'fallback',
    env: ['SCRAPINGBEE_API_KEY'],
    call: () => get(`https://app.scrapingbee.com/api/v1/usage?api_key=${process.env.SCRAPINGBEE_API_KEY}`),
  },
  {
    name: 'Bright Data',
    kind: 'fallback',
    env: ['BRIGHTDATA_TOKEN', 'BRIGHTDATA_ZONE'],
    call: () =>
      get(`https://api.brightdata.com/zone?zone=${encodeURIComponent(process.env.BRIGHTDATA_ZONE || '')}`, {
        Authorization: `Bearer ${process.env.BRIGHTDATA_TOKEN}`,
      }),
  },
];

async function main() {
  /** @type {import('./lib/health').Finding[]} */
  const findings = [];
  for (const c of CHECKS) {
    if (!c.env.every((k) => process.env[k])) {
      // A missing key is invisible otherwise: the scripts that use it just skip it. Required services are an owner action
      // (ScrapingDog runs the outlet search and reads pages outlets refuse); a missing fallback is a note.
      const missing = c.env.filter((k) => !process.env[k]).join(', ');
      const why =
        c.name === 'ScrapingDog'
          ? ' Without it the daily refresh cannot search outlets for reviews or read pages outlets refuse.'
          : '';
      const finding = /** @type {import('./lib/health').Finding} */ ({
        level: c.kind === 'required' ? 'action' : 'note',
        text: `${c.name}: no key is set in the repository secrets (${missing}).${why}`,
      });
      console.log(`${c.name}: [${finding.level}] ${finding.text}`);
      findings.push(finding);
      continue;
    }
    const found = keyFindings({ name: c.name, kind: c.kind, ...(await c.call()) });
    console.log(
      `${c.name}: ${found.length ? found.map((f) => `[${f.level}] ${f.text}${f.detail ? ` ${f.detail}` : ''}`).join(' ') : 'ok'}`,
    );
    findings.push(...found);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(
    path.join(OUT, 'keys.md'),
    issueBody(
      `The weekly key check on ${new Date().toISOString().slice(0, 10)} found something only the owner can fix.`,
      findings,
    ),
  );
}

main();
