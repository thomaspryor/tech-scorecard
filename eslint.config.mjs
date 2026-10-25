// ESLint flat config: Next.js's core-web-vitals rules (the same set `next lint` used),
// applied to src, scripts and test. Run with `npm run lint`.
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals'),
];

export default config;
