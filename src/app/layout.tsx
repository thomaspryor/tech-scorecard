import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.thetechscorecard.com'),
  title: 'Tech Scorecard (Beta): tech reviews, one score',
  description: 'Tech Scorecard (beta) combines professional reviews of new gadgets into one weighted critic score.',
  openGraph: {
    siteName: 'Tech Scorecard',
    type: 'website',
    title: 'Tech Scorecard (Beta): tech reviews, one score',
    description: 'Reviews of the newest gadgets from major tech outlets, combined into one critic score. In beta, with more gadgets on the way.',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans">
        <Header />
        <main>{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
