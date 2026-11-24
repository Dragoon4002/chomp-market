import type { Metadata } from 'next';
import { Baloo_2 } from 'next/font/google';
import './globals.css';

const font = Baloo_2({ subsets: ['latin'], weight: ['500', '700', '800'] });

export const metadata: Metadata = { title: 'Ribbon Rush' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.className}>
      <head>
        {/* Chomp portal bridge, served by the market. Sync (tiny) so window.Chomp exists before the app mounts */}
        <script src="/chomp-sdk.js" />
      </head>
      <body>
        <noscript>Ribbon Rush needs JavaScript.</noscript>
        {children}
      </body>
    </html>
  );
}
