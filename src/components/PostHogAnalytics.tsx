'use client';

import { useEffect } from 'react';
import { POSTHOG_HOST, POSTHOG_KEY } from '@/config/analytics';

// The SDK costs ~200ms of main-thread work to parse, which pushed Lighthouse below 95 when it ran
// on idle. So it waits for the visitor's first interaction, or LOAD_FALLBACK_MS after window load
// for visitors who only read; the history_change pageview still records the page they are on.
const INTERACTIONS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
const LOAD_FALLBACK_MS = 8000;

// Cookieless mode: no cookies or local storage; PostHog counts unique visitors with a daily server-side hash.
export function PostHogAnalytics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !POSTHOG_KEY) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      INTERACTIONS.forEach((e) => window.removeEventListener(e, start));
      window.removeEventListener('load', armFallback);
      clearTimeout(timer);
    };
    const armFallback = () => {
      timer = setTimeout(start, LOAD_FALLBACK_MS);
    };
    function start() {
      cleanup();
      import('posthog-js')
        .then(({ default: posthog }) => {
          if (posthog.__loaded) return;
          posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            cookieless_mode: 'always',
            person_profiles: 'identified_only',
            autocapture: true,
            capture_pageview: 'history_change',
            capture_pageleave: true,
            disable_session_recording: true,
            disable_surveys: true,
          });
        })
        .catch(() => {
          // Blocked by an ad blocker or the network: the site works the same without it.
        });
    }
    INTERACTIONS.forEach((e) => window.addEventListener(e, start, { once: true, passive: true }));
    if (document.readyState === 'complete') armFallback();
    else window.addEventListener('load', armFallback, { once: true });
    return cleanup;
  }, []);

  return null;
}
