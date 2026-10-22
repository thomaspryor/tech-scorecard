import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Analytics } from '@vercel/analytics/next';
import { JsonLd } from '@/components/JsonLd';
import { organizationLd, websiteLd } from '@/lib/seo';
import { BING_SITE_VERIFICATION, GOOGLE_SITE_VERIFICATION, SITE_NAME, SITE_URL } from '@/config/seo';

// Downloaded at build time and served from our own domain: no render-blocking request to Google.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});

const DEFAULT_TITLE = 'Tech Scorecard: tech reviews combined into one critic score';
const DEFAULT_DESCRIPTION =
  'Professional reviews of new phones, laptops, headphones, watches and more, combined into one weighted 0-100 critic score. Every review links to the original.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: '%s | Tech Scorecard' },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: { card: 'summary_large_image' },
  verification: {
    ...(GOOGLE_SITE_VERIFICATION ? { google: GOOGLE_SITE_VERIFICATION } : {}),
    ...(BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': BING_SITE_VERIFICATION } } : {}),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        <JsonLd data={[websiteLd, organizationLd]} />
        <Header />
        <main>{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
