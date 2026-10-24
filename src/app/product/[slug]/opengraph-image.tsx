import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getAllProducts, getProduct } from '@/lib/data';
import { BREAKDOWN_LABELS, getScoreTier, getTierKey } from '@/config/score-buckets';

export const dynamic = 'force-static';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Tech Scorecard critic score';

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllProducts().map((p) => ({ slug: p.slug }));
}

/** Satori cannot read WebP, so hand it a PNG data URI. */
async function photoDataUri(src: string): Promise<string> {
  const file = path.join(process.cwd(), 'public', src);
  const png = await sharp(await readFile(file))
    .resize({ height: 520, withoutEnlargement: true })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

const font = (name: string) => readFile(path.join(process.cwd(), 'src/assets/fonts', name));

export default async function Image({ params }: { params: Promise<Params> }) {
  const p = getProduct((await params).slug);
  if (!p) return new Response('Not found', { status: 404 });
  const score = p.criticScore != null ? Math.round(p.criticScore) : null;
  const tierKey = score != null ? getTierKey(score) : null;
  const color = tierKey ? BREAKDOWN_LABELS[tierKey].color : '#9ca3af';
  const tierLabel = score != null ? getScoreTier(score).label : 'Not enough reviews yet';
  const [bold, regular] = await Promise.all([font('Inter-ExtraBold.otf'), font('Inter-Regular.otf')]);
  const photo = p.image ? await photoDataUri(p.image.src) : null;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#ffffff',
        padding: 48,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 420,
          height: 534,
          background: '#f4f4f5',
          borderRadius: 28,
          border: '2px solid #e4e4e7',
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" style={{ maxWidth: 380, maxHeight: 494, objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: 120, fontWeight: 800, color: '#a1a1aa' }}>{p.brand.slice(0, 2)}</div>
        )}
      </div>

      <div
        style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 48, justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 800 }}>
          <span style={{ color: '#16161d' }}>Tech</span>
          <span style={{ color: '#bb8148' }}>Scorecard</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: p.name.length > 24 ? 56 : 68, fontWeight: 800, lineHeight: 1.05, color: '#16161d' }}>
            {p.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 36 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 156,
                flexShrink: 0,
                height: 156,
                borderRadius: 28,
                background: color,
                color: tierKey === 'gold' ? '#16161d' : '#ffffff',
                fontSize: score != null ? 96 : 64,
                fontWeight: 800,
              }}
            >
              {score ?? '?'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 28 }}>
              <div style={{ fontSize: 44, fontWeight: 800, color: '#16161d' }}>{tierLabel}</div>
              <div style={{ fontSize: 28, color: '#52525b', marginTop: 6 }}>
                {score != null ? `${p.reviewCount} professional reviews` : 'Critic score pending'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 26, color: '#71717a' }}>thetechscorecard.com</div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 800, style: 'normal' },
      ],
    },
  );
}
