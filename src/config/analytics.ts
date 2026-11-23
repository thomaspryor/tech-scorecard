// PostHog project "Tech Scorecard" (separate from Broadway Scorecard's project).
// This is the public client token PostHog expects in browser code; it can only send events, not read them.
export const POSTHOG_KEY = 'phc_DjoEPNpBd4ZXHzok4ia5EzYhB8VwomYBE2EQEXgvMrBE';
// Events go to /ingest on this site, which vercel.json rewrites to PostHog, so ad blockers that
// block posthog.com domains do not hide the visit (ported from Broadway Scorecard BRO-5984).
export const POSTHOG_HOST = '/ingest';
// Where PostHog's own links point, since api_host is no longer a posthog.com address. The toolbar and
// heatmap overlay would also need https://us.posthog.com in the CSP connect-src (vercel.json); neither is used.
export const POSTHOG_UI_HOST = 'https://us.posthog.com';
