"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Empty } from "@/components/ui";
import { explorer, short, useAssets } from "@/lib/assets";
import { GAMES, gameSrc, ownOrigin } from "@/lib/games";
import { PublicKey } from "@solana/web3.js";
import { bs58, CHOMP_ID, conn, ER_RPC, findPda, fmt, fromB64, getWallet, ix, NETWORK, openConnect, pda, PET_DEN_ID, RPC, SEALED_HOUSE_ID, subscribe, useChompWallet, type Ix } from "@/lib/wallet";

// Builds served via /g/* share our origin, so they run without allow-same-origin (opaque origin: no access to portal storage/wallet).
// Set NEXT_PUBLIC_GAMES_ORIGIN (scripts/serve-games.ts) to give them their own origin and keep saves (IndexedDB).
const SANDBOX = "allow-scripts allow-forms allow-pointer-lock allow-downloads";
// apps on their own origin keep their own storage
const SANDBOX_EXTERNAL = `${SANDBOX} allow-same-origin allow-forms allow-popups`;

// Trust boundary: games are untrusted code. They may only touch these programs (no raw SystemProgram transfers) and read-only RPC.
// MagicBlock delegation/permission/VRF are reached only via CPI from these, never called directly. No ComputeBudget (fee drain).
const TX_PROGRAMS = new Set([CHOMP_ID, PET_DEN_ID, SEALED_HOUSE_ID]);
// sha256("global:<ix>")[..8]; chomp: games may only use these (settle is referee-only)
const CHOMP_IXS: Record<string, string> = {
  "208,231,100,44,102,12,220,99": "open_match", "244,8,47,130,192,59,179,44": "join_match",
  "232,219,223,41,219,236,220,190": "cancel", "212,128,45,22,112,82,85,235": "submit_score",
};
const COMMIT_BID = "149,237,198,113,53,66,70,76", INIT_HOUSE = "179,199,91,87,163,192,163,183"; // sealed-house: lamports leave the wallet
const ACC_MATCH = "236,63,169,38,15,56,196,162";
const u64At = (b: Uint8Array, o: number) => { if (b.length < o + 8) throw new Error("bad ix data"); return new DataView(b.buffer, b.byteOffset).getBigUint64(o, true); };
// slug binding + user confirm for SOL at risk (burner auto-signs, so this is the only prompt)
async function guardIxs(ixs: Ix[], slug: string, er: boolean) {
  const game = pda.game(slug);
  let risk = 0n;
  for (const i of ixs) {
    const data = fromB64(i.data), d = Array.from(data.subarray(0, 8)).join(",");
    if (i.programId === CHOMP_ID) {
      const name = CHOMP_IXS[d];
      if (!name) throw new Error("chomp instruction not allowed");
      if (name === "open_match" || name === "submit_score") {
        if (i.keys[1]?.pubkey !== game) throw new Error(`${name}: game account is not ${slug}`);
        if (name === "open_match") risk += u64At(data, 16);
      } else {
        const m = i.keys[1] && await conn(er).getAccountInfo(new PublicKey(i.keys[1].pubkey));
        if (!m || Array.from(m.data.subarray(0, 8)).join(",") !== ACC_MATCH || new PublicKey(m.data.subarray(8, 40)).toBase58() !== game)
          throw new Error(`${name}: match is not a ${slug} match`);
        if (name === "join_match") risk += u64At(m.data, 112);
      }
    } else if (i.programId === SEALED_HOUSE_ID) {
      if (d === COMMIT_BID) risk += u64At(data, 40);
      if (d === INIT_HOUSE) risk += u64At(data, 8);
    }
  }
  if (risk > 0n && !confirm(`${slug} wants to stake ${fmt(risk)} SOL from your wallet. Allow?`)) throw new Error("rejected by user");
}
const RPC_METHODS = new Set(["getAccountInfo", "getMultipleAccounts", "getProgramAccounts", "getBalance", "getSignatureStatuses", "getSlot", "getLatestBlockhash"]);
const str = (v: unknown, max = 128): v is string => typeof v === "string" && v.length <= max;
function checkIxs(ixs: unknown): Ix[] {
  if (!Array.isArray(ixs) || !ixs.length || ixs.length > 12) throw new Error("ixs: 1-12 instructions");
  return ixs.map((i) => {
    if (!str(i?.programId, 44) || !TX_PROGRAMS.has(i.programId)) throw new Error(`program not allowed: ${String(i?.programId).slice(0, 44)}`);
    if (!Array.isArray(i.keys) || i.keys.length > 32 || !str(i.data, 2048)) throw new Error("bad ix shape");
    return {
      programId: i.programId, data: i.data,
      keys: i.keys.map((k: { pubkey?: unknown; isSigner?: unknown; isWritable?: unknown }) => {
        if (!str(k?.pubkey, 44) || bs58.decode(k.pubkey).length !== 32) throw new Error("bad key");
        return { pubkey: k.pubkey, isSigner: k.isSigner === true, isWritable: k.isWritable === true };
      }),
    };
  });
}
const seedBytes = (x: Record<string, unknown>): Uint8Array => {
  if (str(x?.s, 32)) return new TextEncoder().encode(x.s);
  if (str(x?.pk, 44)) return bs58.decode(x.pk);
  if (Number.isInteger(x?.u8) && (x.u8 as number) >= 0 && (x.u8 as number) < 256) return Uint8Array.of(x.u8 as number);
  if (str(x?.u64, 20) && /^\d+$/.test(x.u64) && BigInt(x.u64) < 2n ** 64n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(x.u64), true); return b; }
  if (str(x?.hex, 64) && /^([0-9a-f]{2})*$/i.test(x.hex)) return Uint8Array.from(x.hex.match(/../g) ?? [], (h) => parseInt(h, 16));
  throw new Error("bad seed");
};
const tapeBytes = (h: unknown) => (typeof h === "string" && /^[0-9a-f]{64}$/i.test(h) ? Uint8Array.from(h.match(/../g)!, (x) => parseInt(x, 16)) : new Uint8Array(32));
const signedIn = () => new Promise<string>((res, rej) => {
  const t = setTimeout(() => { off(); rej(new Error("sign-in timed out")); }, 60_000);
  const off = subscribe(() => { const a = getWallet().signedAccountId; if (a) { clearTimeout(t); off(); res(a); } });
});

async function handle(method: unknown, p: Record<string, unknown> | undefined, slug: string): Promise<unknown> {
  const w = getWallet();
  switch (method) {
    case "connect":
      if (w.signedAccountId) return { wallet: w.signedAccountId };
      openConnect();
      return { wallet: await signedIn() };
    case "tx": {
      if (!w.signedAccountId) throw new Error("not signed in");
      const ixs = checkIxs(p?.ixs), er = p?.er === true;
      await guardIxs(ixs, slug, er);
      return w.sendIxs(ixs, { er });
    }
    case "rpc": {
      if (!str(p?.method, 40) || !RPC_METHODS.has(p.method)) throw new Error(`rpc method not allowed: ${String(p?.method).slice(0, 40)}`);
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: p.method, params: Array.isArray(p.params) ? p.params : [] });
      // public devnet rate-limits hard: retry 429 / "Too many requests" 4x, 500 ms → 4 s
      for (let i = 0, wait = 500; ; i++, wait *= 2) {
        const r = await fetch(p.er === true ? ER_RPC : RPC, { method: "POST", headers: { "content-type": "application/json" }, body });
        const j = r.status === 429 ? null : await r.json().catch(() => null);
        const limited = !j || /too many requests/i.test(j.error?.message ?? "");
        if (limited && i < 4) { await new Promise((ok) => setTimeout(ok, wait)); continue; }
        if (!j) throw new Error(`rpc HTTP ${r.status}`);
        if (j.error) throw new Error(j.error.message ?? "rpc error");
        return j.result;
      }
    }
    case "pda": {
      if (!str(p?.programId, 44) || !Array.isArray(p.seeds) || p.seeds.length > 16) throw new Error("bad pda params");
      return findPda(p.programId, p.seeds.map(seedBytes));
    }
    case "sign": {
      // printable text only: keeps games from getting a raw tx message / off-chain-message blob signed
      if (!str(p?.message, 1024) || /[\x00-\x1f\x7f]/.test(p.message)) throw new Error("sign: printable text up to 1024 chars");
      // scoped to this game: a game can't get seat auth signed for another game's server
      if (!p.message.startsWith(`chomp:${slug}:`) && !p.message.startsWith(`${slug}:`)) throw new Error(`sign: message must start with "chomp:${slug}:" or "${slug}:"`);
      if (!w.signedAccountId) throw new Error("not signed in");
      return bs58.encode(await w.signBytes(new TextEncoder().encode(p.message)));
    }
  }
  throw new Error(`unknown method ${String(method).slice(0, 20)}`);
}

export default function Player() {
  const { slug } = useParams<{ slug: string }>();
  const g = GAMES.find((x) => x.slug === slug);
  const a = useAssets();
  const wallet = useChompWallet().signedAccountId;
  const frame = useRef<HTMLIFrameElement>(null);
  const seed = useRef(""); // per "ready"
  const [ready, setReady] = useState(0); // bumps on every game "ready" (iframe reloads)
  const submitting = useRef(false);
  const scored = useRef({ at: 0, cycle: false }); // auto submit_score: once per match:start/ready cycle, ≥10 s apart
  const [last, setLast] = useState("loading…");
  const [scoreSig, setScoreSig] = useState("");
  const [txSig, setTxSig] = useState(""); // latest bridge `tx` (pet-den, sealed-house, staking)
  // own-origin games: pin messages to that origin; sandboxed /g/* builds have an opaque origin ("null"), so "*" + source check
  const origin = g && ownOrigin(g) ? new URL(gameSrc(g), location.href).origin : "*";

  useEffect(() => {
    const win = frame.current?.contentWindow;
    if (!win || !ready) return;
    win.postMessage({ chomp: 1, type: "session", data: {
      wallet, network: NETWORK, mode: "free", stake: "0", seed: seed.current, // TODO(solana): MagicBlock VRF seed for staked matches
      programs: { chomp: CHOMP_ID, petDen: PET_DEN_ID, sealedHouse: SEALED_HOUSE_ID },
    } }, origin);
  }, [wallet, origin, ready]); // re-sent when the wallet changes

  useEffect(() => {
    const on = (e: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win || e.data?.chomp !== 1 || (origin !== "*" && e.origin !== origin)) return;
      const { type, data } = e.data;
      if (type === "req") {
        const id = data?.id;
        handle(data?.method, data?.params, g!.slug)
          .then((value) => { if (data?.method === "tx" && typeof value === "string") setTxSig(value); return { id, ok: true, value }; }, (err) => ({ id, ok: false, error: String(err?.message ?? err).slice(0, 300) }))
          .then((res) => win.postMessage({ chomp: 1, type: "res", data: res }, origin));
        setLast(`req ${String(data?.method).slice(0, 20)}`);
        return;
      }
      setLast(`${type}${data ? ` ${JSON.stringify(data).slice(0, 120)}` : ""}`);
      if (type === "ready" || type === "match:start") scored.current.cycle = false;
      if (type === "ready") {
        seed.current = Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-");
        setReady((n) => n + 1);
      }
      // generic on-chain leaderboard: every numeric result → chomp submit_score (one in flight; games can't spam fees)
      const w = getWallet();
      if (type === "match:result" && Number.isSafeInteger(data?.score) && data.score >= 0 && w.signedAccountId && !submitting.current && g
        && !scored.current.cycle && Date.now() - scored.current.at >= 10_000) {
        submitting.current = true;
        scored.current = { at: Date.now(), cycle: true };
        w.sendIxs([ix.submitScore(w.signedAccountId, g.slug, data.score, tapeBytes(data.tapeHash))])
          .then(setScoreSig, (err) => setScoreSig(`error: ${String(err?.message ?? err).slice(0, 80)}`))
          .finally(() => { submitting.current = false; });
      }
      // TODO(solana): match:start → create + delegate match account on ER; frames → ER commits (settle "frames")
    };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, [g, origin]);

  if (!g) return <Empty>No game “{slug}”. <Link href="/play" className="text-gold hover:underline">All games</Link></Empty>;
  if (g.soon) return <Empty>{g.name} is coming soon.</Empty>;
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-2xl">{g.name}</h1>
        {ownOrigin(g) && <Button asChild variant="outline" size="sm"><a href={gameSrc(g)} target="_blank" rel="noreferrer" title="Runs on its own server: keeps playing while the market reloads"><ExternalLink /> Open detached</a></Button>}
        <Button variant="outline" size="sm" onClick={() => frame.current?.requestFullscreen()}><Maximize /> Fullscreen</Button>
      </div>
      <iframe ref={frame} src={gameSrc(g)} title={g.name} sandbox={ownOrigin(g) ? SANDBOX_EXTERNAL : SANDBOX}
        allow="fullscreen; gamepad; autoplay" className="aspect-video w-full rounded-2xl border border-white/10 bg-black" />
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
        <span>{a.account ? `Playing as ${short(a.account)}` : "Playing free. Connect a wallet for staked matches."}</span>
        <span>{g.engine} · settles {g.settle}{g.license && ` · ${g.license}`}</span>
        {g.source && <a href={g.source} target="_blank" rel="noreferrer" className="hover:text-cream">source ↗</a>}
        {scoreSig && (scoreSig.startsWith("error")
          ? <span className="text-ember">score not saved ({scoreSig.slice(7)})</span>
          : <a href={explorer("tx", scoreSig)} target="_blank" rel="noreferrer" className="text-gold hover:underline">score on-chain {short(scoreSig)} ↗</a>)}
        {txSig && <a href={explorer("tx", txSig)} target="_blank" rel="noreferrer" className="text-gold hover:underline">last tx {short(txSig)} ↗</a>}
        <span className="ml-auto font-mono">last event: {last}</span>
      </div>
      <p className="mt-3 text-sm text-muted">{g.desc}</p>
    </>
  );
}
