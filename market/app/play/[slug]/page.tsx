"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Empty } from "@/components/ui";
import { useAssets } from "@/lib/assets";
import { GAMES, gameSrc } from "@/lib/games";

// Hosted builds share our origin, so they run without allow-same-origin (opaque origin: no access to portal storage/wallet).
// ponytail: costs game saves (IndexedDB). Serve /g/* from a games subdomain, then add allow-same-origin.
const SANDBOX = "allow-scripts allow-pointer-lock allow-downloads";
// first-party apps on their own origin keep their own storage
const SANDBOX_EXTERNAL = `${SANDBOX} allow-same-origin allow-forms allow-popups`;

export default function Player() {
  const { slug } = useParams<{ slug: string }>();
  const g = GAMES.find((x) => x.slug === slug);
  const a = useAssets();
  const frame = useRef<HTMLIFrameElement>(null);
  const [last, setLast] = useState("loading…");

  useEffect(() => {
    const on = (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win || e.data?.chomp !== 1) return;
      setLast(`${e.data.type}${e.data.data ? ` ${JSON.stringify(e.data.data)}` : ""}`);
      if (e.data.type === "ready") {
        const seed = Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-"); // TODO(solana): MagicBlock VRF seed for staked matches
        win.postMessage({ chomp: 1, type: "session", data: { wallet: a.account ?? "", mode: "free", stake: "0", seed } }, "*");
      }
      // TODO(solana): match:start → create + delegate match account on ER; frames → ER commits (settle "frames"); match:result → settle + payout
    };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, [a.account]);

  if (!g) return <Empty>No game “{slug}”. <Link href="/play" className="text-indigo-400 hover:underline">All games</Link></Empty>;
  if (g.soon) return <Empty>{g.name} is coming soon.</Empty>;
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-2xl">{g.name}</h1>
        <Button variant="outline" size="sm" onClick={() => frame.current?.requestFullscreen()}><Maximize /> Fullscreen</Button>
      </div>
      <iframe ref={frame} src={gameSrc(g)} title={g.name} sandbox={g.url ? SANDBOX_EXTERNAL : SANDBOX}
        allow="fullscreen; gamepad; autoplay" className="aspect-video w-full rounded-2xl border border-white/10 bg-black" />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
        <span>{a.account ? `Playing as ${a.account}` : "Playing free. Connect a wallet for staked matches."}</span>
        <span>{g.engine} · settles {g.settle}{g.license && ` · ${g.license}`}</span>
        {g.source && <a href={g.source} target="_blank" rel="noreferrer" className="hover:text-cream">source ↗</a>}
        <span className="ml-auto font-mono">last event: {last}</span>
      </div>
      <p className="mt-3 text-sm text-muted">{g.desc}</p>
    </>
  );
}
