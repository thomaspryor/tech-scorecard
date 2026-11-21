// Pure decisions for the weekly health checks (scripts/check-keys.js, scripts/audit-stored.js), so the tests cover them without
// the network. Each check turns what it saw into findings; a finding is either `action` (something only the owner can fix: a key
// was rejected, or a service the site depends on is out of credits) or `note` (worth knowing, fixes itself or has a fallback).
// Only `action` findings open the GitHub issue the caretaker reads (docs/CARETAKER.md), so a fallback running low never emails anyone.

/**
 * `text` is the stable part (it is what decides whether the issue is posted to again); `detail` carries numbers that change from
 * week to week and is shown under it.
 * @typedef {{level: 'action' | 'note', text: string, detail?: string}} Finding
 */

/** Below this share of credits left, a service the site depends on is reported. */
const LOW_SHARE = 0.1;

/**
 * What a key check's answer means. `kind` says what the service is for: `required` (OpenAI and Gemini score every review; ScrapingDog
 * runs the outlet search and is the first page reader) or `fallback` (Bright Data and ScrapingBee only read pages the others could not).
 * @param {object} o
 * @param {string} o.name
 * @param {'required' | 'fallback'} o.kind
 * @param {number} o.status HTTP status, 0 when the request failed
 * @param {any} [o.body] parsed JSON body, when there is one
 * @returns {Finding[]}
 */
function keyFindings({ name, kind, status, body }) {
  /** @type {Finding[]} */
  const out = [];
  // A 403 counts only when the service itself answered (a JSON body): a proxy or firewall in between also says 403.
  const fromService = body !== undefined;
  const rejected =
    status === 401 ||
    (status === 403 && fromService) ||
    body?.success === false ||
    (name === 'Gemini' && status === 400);
  if (rejected)
    return [{ level: 'action', text: `${name}: the API key was rejected (HTTP ${status}). It needs a new key.` }];
  if (status === 429)
    return [
      { level: kind === 'required' ? 'action' : 'note', text: `${name}: over its quota or rate limit (HTTP 429).` },
    ];
  if (status !== 200)
    return [{ level: 'note', text: `${name}: could not be checked (HTTP ${status || 'no answer'}).` }];
  const credits = creditsOf(name, body);
  if (credits) {
    const left = credits.max - credits.used;
    const share = credits.max > 0 ? left / credits.max : 1;
    const renews = credits.renews ? ` It renews ${credits.renews}.` : '';
    if (left <= 0)
      out.push({
        level: kind === 'required' ? 'action' : 'note',
        text: `${name}: out of credits.`,
        detail: `${credits.used} of ${credits.max} used.${renews}`,
      });
    else if (share < LOW_SHARE)
      out.push({
        level: kind === 'required' ? 'action' : 'note',
        text: `${name}: under ${Math.round(LOW_SHARE * 100)}% of its credits left.`,
        detail: `${left} of ${credits.max} left (${Math.round(share * 100)}%).${renews}`,
      });
  }
  if (name === 'Bright Data' && (body?.plan?.disable || body?.disable))
    out.push({ level: 'note', text: `Bright Data: the zone is disabled (${body.plan?.disable || body.disable}).` });
  return out;
}

/**
 * Credits used and available, for the services that report them.
 * @param {string} name
 * @param {any} body
 * @returns {{used: number, max: number, renews?: string} | null}
 */
function creditsOf(name, body) {
  if (!body) return null;
  if (name === 'ScrapingDog' && Number.isFinite(body.requestLimit) && Number.isFinite(body.requestUsed))
    return { used: body.requestUsed, max: body.requestLimit };
  if (name === 'ScrapingBee' && Number.isFinite(body.max_api_credit) && Number.isFinite(body.used_api_credit))
    return {
      used: body.used_api_credit,
      max: body.max_api_credit,
      renews:
        typeof body.renewal_subscription_date === 'string' ? body.renewal_subscription_date.slice(0, 10) : undefined,
    };
  return null;
}

/**
 * What re-reading a stored review found. Only a page that is plainly gone (404/410) or a full page that no longer carries the
 * quote is a finding; a page that refuses a plain request is not (the daily pipeline reads those through the paid services).
 * @param {{status: number, blocked: boolean, textLength: number, quoteFound: boolean}} r
 * @returns {'gone' | 'quote-missing' | 'unknown' | 'ok'}
 */
function storedVerdict({ status, blocked, textLength, quoteFound }) {
  if (status === 404 || status === 410) return 'gone';
  if (status < 200 || status >= 300 || blocked) return 'unknown';
  if (quoteFound) return 'ok';
  // A short page is a teaser or a script shell, not proof the quote went away.
  return textLength >= 3000 ? 'quote-missing' : 'unknown';
}

/**
 * The issue text for a set of findings: one "- " line each (the alert script compares these lines to decide whether to post).
 * @param {string} intro
 * @param {Finding[]} findings
 */
function issueBody(intro, findings) {
  const action = findings.filter((f) => f.level === 'action');
  const notes = findings.filter((f) => f.level === 'note');
  if (!action.length) return '';
  return [
    intro,
    '',
    ...action.flatMap((f) => [`- ${f.text}`, ...(f.detail ? [`  ${f.detail}`] : [])]),
    ...(notes.length
      ? ['', 'Also noted (no action needed):', ...notes.map((f) => `  ${f.text}${f.detail ? ` ${f.detail}` : ''}`)]
      : []),
    '',
    'The daily caretaker session (docs/CARETAKER.md) picks this up.',
    '',
  ].join('\n');
}

module.exports = { keyFindings, creditsOf, storedVerdict, issueBody, LOW_SHARE };
