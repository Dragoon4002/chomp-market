import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Brawler Arena' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Chomp portal bridge, served by the market. Sync (tiny) so window.Chomp exists before the app mounts */}
        <script src="/chomp-sdk.js" />
        <link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <noscript>Brawler Arena needs JavaScript to run the game.</noscript>
        {children}
      </body>
    </html>
  );
}
