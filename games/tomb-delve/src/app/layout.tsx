import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Tomb Delve' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* portal bridge, served by the market at its root */}
        <script src="/chomp-sdk.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
