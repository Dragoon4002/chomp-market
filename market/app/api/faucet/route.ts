// Devnet faucet: POST { pubkey } → 0.2 SOL from FAUCET_SECRET / FAUCET_KEYPAIR (server-only; key bytes never leave this module).
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

const DRIP = 0.2 * LAMPORTS_PER_SOL;
const RICH = 0.5 * LAMPORTS_PER_SOL;
const WINDOW = 10 * 60_000;
const IP_MAX = 3; // drips per IP per window
const ALL_MAX = 20; // drips per window, all callers (caps the drain if IP limits are dodged)
// ponytail: in-memory limits, reset on restart / not shared across instances; move to KV if the faucet gets abused
const byKey = new Map<string, number>();
const byIp = new Map<string, number[]>();
let all: number[] = [];
const prune = (now: number) => {
  if (byKey.size > 5000) for (const [k, t] of byKey) if (now - t >= WINDOW) byKey.delete(k);
  if (byIp.size > 5000) for (const [k, ts] of byIp) if (ts.every((t) => now - t >= WINDOW)) byIp.delete(k);
};

// standalone game apps on other localhost ports + the games origin call this cross-origin
const allowed = (o: string | null) => !!o && (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || o === process.env.NEXT_PUBLIC_GAMES_ORIGIN?.replace(/\/$/, ""));
const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get("origin");
  return allowed(o) ? { "access-control-allow-origin": o!, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" } : {};
};
const out = (req: Request, status: number, body: object) => Response.json(body, { status, headers: cors(req) });

let faucet: Keypair | null = null;
// FAUCET_SECRET = keypair JSON array (hosted, e.g. Vercel env); else FAUCET_KEYPAIR file path (local).
const loadFaucet = () => faucet ??= Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.FAUCET_SECRET ||
  fs.readFileSync(path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.FAUCET_KEYPAIR || "../.keys/faucet.json"), "utf8"))));

export const OPTIONS = (req: Request) => new Response(null, { status: 204, headers: cors(req) });

export async function POST(req: Request) {
  let to: PublicKey;
  try {
    const { pubkey } = await req.json();
    if (typeof pubkey !== "string" || pubkey.length > 44) throw 0;
    to = new PublicKey(pubkey);
    if (!PublicKey.isOnCurve(to.toBytes())) throw 0; // no PDAs
  } catch { return out(req, 400, { error: "Send { pubkey } with a base58 wallet address" }); }
  const key = to.toBase58();
  // Assumes one trusted reverse proxy that appends the client IP: its hop is the LAST x-forwarded-for entry (earlier ones are
  // client-controlled). Without a proxy both headers are spoofable, so ALL_MAX is the real backstop.
  const ip = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  prune(now);
  if (now - (byKey.get(key) ?? 0) < WINDOW) return out(req, 429, { error: "One drip per wallet every 10 minutes" });
  const prevIp = byIp.get(ip);
  const hits = (prevIp ?? []).filter((t) => now - t < WINDOW);
  if (hits.length >= IP_MAX) return out(req, 429, { error: "Too many faucet requests from your network, try again later" });
  all = all.filter((t) => now - t < WINDOW);
  if (all.length >= ALL_MAX) return out(req, 429, { error: "Faucet is busy, try again in a few minutes" });

  let kp: Keypair;
  try { kp = loadFaucet(); } catch { console.error("faucet: keypair unreadable (FAUCET_KEYPAIR)"); return out(req, 503, { error: "Faucet not configured" }); }
  // claim the slots before any await, so concurrent requests can't all pass the checks above
  const prevKey = byKey.get(key);
  byKey.set(key, now);
  byIp.set(ip, [...hits, now]);
  all.push(now);
  // failed/declined drip shouldn't burn the slots
  const rollback = () => {
    if (prevKey === undefined) byKey.delete(key); else byKey.set(key, prevKey);
    if (prevIp) byIp.set(ip, prevIp); else byIp.delete(ip);
    const i = all.indexOf(now);
    if (i >= 0) all.splice(i, 1);
  };
  const c = new Connection(process.env.SOLANA_RPC || process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com", "confirmed");
  try {
    const [have, left] = await Promise.all([c.getBalance(to), c.getBalance(kp.publicKey)]);
    if (have >= RICH) { rollback(); return out(req, 400, { error: "You already have 0.5+ devnet SOL" }); }
    if (left < DRIP + 10_000) { rollback(); return out(req, 503, { error: `Faucet is empty: send devnet SOL to ${kp.publicKey.toBase58()}` }); }
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to, lamports: DRIP }));
    const sig = await sendAndConfirmTransaction(c, tx, [kp], { commitment: "confirmed" });
    return out(req, 200, { sig, lamports: DRIP });
  } catch (e) {
    rollback();
    console.error("faucet: send failed", (e as Error).message);
    return out(req, 502, { error: "Faucet transfer failed, try again" });
  }
}
