import type { Metadata, Viewport } from "next";
import { Lilita_One, Nunito } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const nunito = Nunito({ weight: ["400", "600", "700", "800"], subsets: ["latin"], variable: "--font-nunito" });
const lilita = Lilita_One({ weight: "400", subsets: ["latin"], variable: "--font-lilita" });

export const metadata: Metadata = { title: "Chomp Market", description: "Trade game skills and monsters on Solana." };
export const viewport: Viewport = { themeColor: "#140f24" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${nunito.variable} ${lilita.variable}`}>
      <body className="antialiased">
        <noscript>Chomp Market needs JavaScript.</noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
