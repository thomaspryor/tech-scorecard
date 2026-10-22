'use client';

import { useEffect } from 'react';
import { POSTHOG_HOST, POSTHOG_KEY } from '@/config/analytics';

// Loads PostHog after the page is idle so it never competes with the first paint.
// Cookieless mode: no cookies or local storage; PostHog counts unique visitors with a daily server-side hash.
export function PostHogAnalytics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !POSTHOG_KEY) return;
    const start = () => {
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
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(start, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 2000);
    return () => clearTimeout(id);
  }, []);

  return null;
}
