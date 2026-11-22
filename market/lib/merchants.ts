// NPC merchants: recompute a merchant's price reasoning from public chain data with the bots' own rules file.
import { price, soldSince, targetFor, yocto2near, type Quote } from "../../agents/pricing";
import { ASSETS_ID, type Point, type Presale } from "./assets";

export const MERCHANTS = (process.env.NEXT_PUBLIC_MERCHANTS || "smithy.brawler-platform-5c8e2b.testnet,alchemist.brawler-platform-5c8e2b.testnet").split(",").map((s) => s.trim());
const RPC = process.env.NEXT_PUBLIC_NEAR_RPC || "https://test.rpc.fastnear.com";
export const merchantName = (id: string) => id.charAt(0).toUpperCase() + id.split(".")[0].slice(1);

const query = async (params: object) => {
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { finality: "optimistic", ...params } }) })).json();
  if (r.error) throw new Error(JSON.stringify(r.error.data ?? r.error));
  return r.result;
};

export async function reasoning(seller: string, skill: number, history: Point[], presales: Presale[]): Promise<Quote | null> {
  const p = presales.find((x) => x.skill === skill);
  if (!p) return null;
  const [acct, held] = await Promise.all([
    query({ request_type: "view_account", account_id: seller }),
    query({ request_type: "call_function", account_id: ASSETS_ID, method_name: "skills_of", args_base64: btoa(JSON.stringify({ account_id: seller })) })
      .then((r) => JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))) as [number, number, number][]),
  ]);
  const [, free = 0, listed = 0] = held.find(([s]) => s === skill) ?? [];
  const base = yocto2near(p.price);
  return price({ base, stock: free + listed, target: targetFor(base), soldLastHour: soldSince(history, base, Date.now()), cash: yocto2near(acct.amount) });
}
