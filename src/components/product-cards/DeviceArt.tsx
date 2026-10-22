import type { ReactElement } from 'react';
import type { Product } from '@/lib/data-types';

type Art = Product['art'];
const LENS = { fill: '#0b0b10', stroke: '#3a3a44' };

// One drawing per kind of gadget, in a 300x400 frame. Plain fills only:
// SVG gradient ids collide when the same art renders twice on a page.
const SHAPES: Record<Art['kind'], (a: Art) => ReactElement> = {
  phone: (art) => (
        <g>
          <rect x="48" y="78" width="126" height="258" rx="24" fill="#1b1b20" />
          <rect x="54" y="84" width="114" height="246" rx="19" fill="#14141c" />
          <path d="M54 103 a19 19 0 0 1 19 -19 H168 V200 L54 300 Z" fill={art.accent} opacity="0.85" />
          <rect x="94" y="94" width="34" height="10" rx="5" fill="#0b0b10" />
          <rect x="134" y="58" width="126" height="258" rx="24" fill={art.body} stroke="#000" strokeOpacity="0.08" />
          <rect x="190" y="58" width="22" height="258" fill="#fff" opacity="0.14" />
          <rect x="138" y="64" width="118" height="70" rx="20" fill={art.body} stroke="#000" strokeOpacity="0.12" />
          <circle cx="164" cy="88" r="14" fill="#0b0b10" stroke="#3a3a44" strokeWidth="3" />
          <circle cx="164" cy="116" r="11" fill="#0b0b10" stroke="#3a3a44" strokeWidth="3" />
          <circle cx="194" cy="102" r="14" fill="#0b0b10" stroke="#3a3a44" strokeWidth="3" />
          <circle cx="232" cy="90" r="4" fill="#f1e4b0" opacity="0.8" />
        </g>
  ),
  foldable: (art) => (
        <g>
          <rect x="52" y="92" width="172" height="232" rx="16" fill={art.body} />
          <rect x="58" y="98" width="160" height="220" rx="11" fill="#14141c" />
          <path d="M58 109 a11 11 0 0 1 11 -11 H218 V230 L58 318 Z" fill={art.accent} opacity="0.85" />
          <line x1="138" y1="98" x2="138" y2="318" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" />
          <circle cx="198" cy="112" r="3.5" fill="#0b0b10" />
          <rect x="196" y="70" width="64" height="236" rx="14" fill={art.body} stroke="#000" strokeOpacity="0.08" />
          <rect x="222" y="70" width="14" height="236" fill="#fff" opacity="0.18" />
          <rect x="203" y="78" width="50" height="78" rx="12" fill="#1c1c22" />
          <circle cx="218" cy="98" r="10" fill="#0b0b10" stroke="#3a3a44" strokeWidth="2.5" />
          <circle cx="218" cy="132" r="10" fill="#0b0b10" stroke="#3a3a44" strokeWidth="2.5" />
          <circle cx="241" cy="115" r="4" fill="#3a3a44" />
        </g>
  ),
  flip: (art) => (
        <g>
          {/* open clamshell: tall screen with a horizontal hinge */}
          <rect x="62" y="56" width="108" height="276" rx="20" fill={art.body} />
          <rect x="68" y="62" width="96" height="264" rx="15" fill="#14141c" />
          <path d="M68 77 a15 15 0 0 1 15 -15 H164 V190 L68 300 Z" fill={art.accent} opacity="0.85" />
          <line x1="68" y1="194" x2="164" y2="194" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.5" />
          <circle cx="116" cy="74" r="3.5" fill="#0b0b10" />
          {/* closed: square with cover screen */}
          <rect x="150" y="176" width="112" height="138" rx="20" fill={art.body} stroke="#000" strokeOpacity="0.08" />
          <rect x="158" y="184" width="96" height="84" rx="14" fill="#14141c" />
          <rect x="158" y="184" width="96" height="84" rx="14" fill={art.accent} opacity="0.35" />
          <circle cx="176" cy="202" r="9" fill="#0b0b10" stroke="#3a3a44" strokeWidth="2.5" />
          <circle cx="200" cy="202" r="9" fill="#0b0b10" stroke="#3a3a44" strokeWidth="2.5" />
          <rect x="150" y="296" width="112" height="6" fill="#000" opacity="0.10" />
        </g>
  ),
  tablet: (art) => (
    <g>
      <rect x="58" y="70" width="184" height="262" rx="18" fill={art.body} />
      <rect x="66" y="78" width="168" height="246" rx="11" fill="#14141c" />
      <path d="M66 89 a11 11 0 0 1 11 -11 H234 V200 L66 320 Z" fill={art.accent} opacity="0.85" />
      <circle cx="150" cy="74" r="2.5" fill="#0b0b10" />
    </g>
  ),
  laptop: (art) => (
    <g>
      <rect x="62" y="104" width="176" height="122" rx="10" fill="#1b1b20" />
      <rect x="69" y="111" width="162" height="108" rx="4" fill="#14141c" />
      <path d="M69 111 H231 V160 L69 219 Z" fill={art.accent} opacity="0.85" />
      <path d="M40 232 H260 L248 250 H52 Z" fill={art.body} stroke="#000" strokeOpacity="0.1" />
      <rect x="128" y="232" width="44" height="5" rx="2" fill="#000" opacity="0.12" />
    </g>
  ),
  headphones: (art) => (
    <g>
      <path d="M86 214 V176 a64 64 0 0 1 128 0 V214" fill="none" stroke={art.body} strokeWidth="16" strokeLinecap="round" />
      <rect x="66" y="196" width="48" height="84" rx="22" fill={art.body} stroke="#000" strokeOpacity="0.12" />
      <rect x="186" y="196" width="48" height="84" rx="22" fill={art.body} stroke="#000" strokeOpacity="0.12" />
      <rect x="78" y="210" width="24" height="56" rx="12" fill={art.accent} opacity="0.5" />
      <rect x="198" y="210" width="24" height="56" rx="12" fill={art.accent} opacity="0.5" />
    </g>
  ),
  earbuds: (art) => (
    <g>
      <rect x="84" y="190" width="132" height="104" rx="40" fill={art.body} stroke="#000" strokeOpacity="0.12" />
      <line x1="90" y1="226" x2="210" y2="226" stroke="#000" strokeOpacity="0.15" strokeWidth="2" />
      <circle cx="150" cy="256" r="4" fill={art.accent} />
      <ellipse cx="112" cy="132" rx="22" ry="26" fill={art.body} stroke="#000" strokeOpacity="0.12" />
      <rect x="104" y="140" width="14" height="44" rx="7" fill={art.body} stroke="#000" strokeOpacity="0.12" />
      <ellipse cx="188" cy="132" rx="22" ry="26" fill={art.body} stroke="#000" strokeOpacity="0.12" />
      <rect x="182" y="140" width="14" height="44" rx="7" fill={art.body} stroke="#000" strokeOpacity="0.12" />
    </g>
  ),
  watch: (art) => (
    <g>
      <rect x="116" y="64" width="68" height="84" rx="14" fill={art.body} opacity="0.85" />
      <rect x="116" y="252" width="68" height="84" rx="14" fill={art.body} opacity="0.85" />
      <rect x="96" y="128" width="108" height="144" rx="30" fill="#1b1b20" />
      <rect x="104" y="136" width="92" height="128" rx="23" fill="#14141c" />
      <circle cx="150" cy="200" r="34" fill="none" stroke={art.accent} strokeWidth="8" opacity="0.9" />
      <rect x="204" y="176" width="8" height="26" rx="4" fill={art.body} />
    </g>
  ),
  console: (art) => (
    <g>
      <rect x="40" y="150" width="56" height="128" rx="26" fill={art.body} />
      <rect x="204" y="150" width="56" height="128" rx="26" fill={art.accent} />
      <rect x="92" y="150" width="116" height="128" rx="8" fill="#1b1b20" />
      <rect x="99" y="157" width="102" height="114" rx="4" fill="#14141c" />
      <circle cx="68" cy="190" r="10" fill={LENS.fill} />
      <circle cx="232" cy="236" r="10" fill={LENS.fill} />
    </g>
  ),
  glasses: (art) => (
    <g>
      <rect x="44" y="168" width="96" height="66" rx="24" fill={art.accent} opacity="0.35" stroke={art.body} strokeWidth="10" />
      <rect x="160" y="168" width="96" height="66" rx="24" fill={art.accent} opacity="0.35" stroke={art.body} strokeWidth="10" />
      <path d="M140 190 q10 -10 20 0" fill="none" stroke={art.body} strokeWidth="8" />
      <line x1="44" y1="182" x2="22" y2="176" stroke={art.body} strokeWidth="8" strokeLinecap="round" />
      <line x1="256" y1="182" x2="278" y2="176" stroke={art.body} strokeWidth="8" strokeLinecap="round" />
      <rect x="182" y="184" width="30" height="20" rx="4" fill="#fff" opacity="0.6" />
    </g>
  ),
  headset: (art) => (
    <g>
      <path d="M58 200 q0 -56 92 -56 q92 0 92 56 q0 44 -44 44 q-22 0 -32 -14 q-16 -14 -32 0 q-10 14 -32 14 q-44 0 -44 -44 Z" fill={art.body} stroke="#000" strokeOpacity="0.12" />
      <path d="M72 198 q0 -42 78 -42 q78 0 78 42 q0 30 -30 30 q-16 0 -26 -10 q-22 -18 -44 0 q-10 10 -26 10 q-30 0 -30 -30 Z" fill="#14141c" />
      <path d="M72 198 q0 -42 78 -42 q78 0 78 42 L72 214 Z" fill={art.accent} opacity="0.55" />
      <path d="M58 196 q-26 4 -26 36 q0 34 30 44" fill="none" stroke={art.body} strokeWidth="12" strokeLinecap="round" opacity="0.8" />
      <path d="M242 196 q26 4 26 36 q0 34 -30 44" fill="none" stroke={art.body} strokeWidth="12" strokeLinecap="round" opacity="0.8" />
    </g>
  ),
};

/**
 * Drawn product art standing in for press photos.
 * Broadway Scorecard uses posters here; the tile keeps the same 3:4 frame.
 */
export function DeviceArt({ art, name, className = '' }: { art: Art; name: string; className?: string }) {
  const shape = SHAPES[art.kind] ?? SHAPES.phone;
  return (
    <svg viewBox="0 0 300 400" className={className} role="img" aria-label={`Illustration of ${name}`} preserveAspectRatio="xMidYMid slice">
      <rect width="300" height="400" fill={art.backdrop[0]} />
      <path d="M0 400 L300 120 L300 400 Z" fill={art.backdrop[1]} />
      <ellipse cx="150" cy="352" rx="110" ry="10" fill="#000" opacity="0.10" />
      {shape(art)}
    </svg>
  );
}
