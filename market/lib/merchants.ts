// NPC merchants: recompute a merchant's price reasoning from public chain data with the bots' own rules file.
import type { Point, Presale } from "./assets";
import type { Quote } from "../../agents/pricing";

export const MERCHANTS = (process.env.NEXT_PUBLIC_MERCHANTS || "").split(",").map((s) => s.trim()).filter(Boolean);
export const merchantName = (id: string) => id.charAt(0).toUpperCase() + id.split(".")[0].slice(1);

// TODO(solana): read seller balance + skill holdings from the program, then `price()` from agents/pricing.
export async function reasoning(_seller: string, _skill: number, _history: Point[], _presales: Presale[]): Promise<Quote | null> {
  return null;
}
