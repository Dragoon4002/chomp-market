import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Keyfall', description: '1v1 typing duel' };
export const viewport: Viewport = { themeColor: '#748ab2', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Chomp portal bridge, served by the market. Sync (tiny) so window.Chomp exists before the app mounts */}
        <script src="/chomp-sdk.js" />
        <link rel="preload" href="/g/keyfall/fonts/OpenDyslexic-BoldItalic.otf" as="font" type="font/otf" crossOrigin="" />
      </head>
      <body>
        <noscript>Keyfall needs JavaScript to run.</noscript>
        {children}
      </body>
    </html>
  );
}
