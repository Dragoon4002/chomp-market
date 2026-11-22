import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const nunito = Nunito({ weight: ["400", "600", "700", "800"], subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = { title: "Chomp Market", description: "Trade skills and monsters for Brawler Arena." };
export const viewport: Viewport = { themeColor: "#0c0c0f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${nunito.variable}`}>
      <body className="antialiased">
        <noscript>Chomp Market needs JavaScript.</noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
