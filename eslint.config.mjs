// ESLint flat config: Next.js's core-web-vitals rules (the set `next lint` used), applied to
// src, scripts and test. Run with `npm run lint`.
import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [{ ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'] }, ...nextVitals];

export default config;
