"use client";
import { useSyncExternalStore } from "react";
import { JavascriptProvider } from "@fast-auth-near/javascript-provider";
import {
  Account, actions, baseDecode, createTransaction, getTransactionLastResult, JsonRpcProvider, KeyPair, keyToImplicitAddress,
  PublicKey, Signature, SignedTransaction, type KeyPairString,
} from "near-api-js";
import { FASTAUTH, recoverEd25519 } from "./fastauth";

// NEAR Auth (Google / email), same flow and storage key as the game, so one login works for both on the same origin.
export type Session = { accountId: string; key: KeyPairString };
const STORE = "fastauth:session";
const bus = new EventTarget();
const raw = () => { try { return localStorage.getItem(STORE); } catch { return null; } };
const subscribe = (f: () => void) => { bus.addEventListener("s", f); addEventListener("storage", f); return () => { bus.removeEventListener("s", f); removeEventListener("storage", f); }; };
export function useSocial(): Session | null {
  const s = useSyncExternalStore(subscribe, raw, () => null);
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
const save = (s: Session | null) => { if (s) localStorage.setItem(STORE, JSON.stringify(s)); else localStorage.removeItem(STORE); bus.dispatchEvent(new Event("s")); };
export const openSocial = () => bus.dispatchEvent(new Event("open"));
export const onOpenSocial = (f: () => void) => { bus.addEventListener("open", f); return () => bus.removeEventListener("open", f); };

const rpc = new JsonRpcProvider({ url: FASTAUTH.rpc });
let fa: JavascriptProvider | undefined;
const auth = () => (fa ??= new JavascriptProvider({ network: "testnet", clientId: FASTAUTH.clientId, domain: FASTAUTH.domain }));

export async function socialCall(s: Session, p: { contractId: string; method: string; args: object; gas: string; deposit: string }) {
  const out = await new Account(s.accountId, rpc, s.key).signAndSendTransaction({
    receiverId: p.contractId, actions: [actions.functionCall(p.method, p.args, BigInt(p.gas), BigInt(p.deposit))],
  });
  return getTransactionLastResult(out as never);
}
export async function socialSignOut() { save(null); await auth().logout({ openUrl: false }).catch(() => {}); }

export const relayerReady = () => fetch("/api/fastauth").then((r) => r.json()).then((j) => !!j.ready, () => false);
export const isLoggedIn = () => auth().isLoggedIn();
export const login = () => auth().login();
const exists = (accountId: string) => rpc.viewAccount({ accountId, blockQuery: { finality: "final" } }).then(() => true, () => false);

export async function derive() {
  const path = await auth().getPath();
  const pk = String(await rpc.callFunction({ contractId: FASTAUTH.mpcId, method: "derived_public_key", args: { path, predecessor: FASTAUTH.contractId, domain_id: 1 } }));
  return { pk, accountId: keyToImplicitAddress(pk) };
}

export async function ensureFunded(accountId: string) {
  if (await exists(accountId)) return true;
  const idToken = (await (auth() as unknown as { client: { getIdTokenClaims(): Promise<{ __raw: string } | undefined> } }).client.getIdTokenClaims())?.__raw;
  const res = await fetch("/api/fastauth/fund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) });
  if (!res.ok || (await res.json()).accountId !== accountId) return false;
  for (let i = 0; i < 15; i++) { if (await exists(accountId)) return true; await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}

// built before the click so the NEAR Auth popup opens inside the user gesture
export async function prepare(accountId: string, pk: string) {
  const local = KeyPair.fromRandom("ed25519");
  const [ak, block] = await Promise.all([rpc.viewAccessKey({ accountId, publicKey: pk, finalityQuery: { finality: "final" } }), rpc.viewBlock({ finality: "final" })]);
  const tx = createTransaction(accountId, PublicKey.from(pk), accountId, BigInt(ak.nonce) + 1n, [actions.addFullAccessKey(local.getPublicKey())], baseDecode(block.header.hash));
  return { accountId, local, tx };
}
export type Prep = Awaited<ReturnType<typeof prepare>>;

export async function activate({ accountId, local, tx }: Prep) {
  await auth().requestTransactionSignature({ transaction: tx as never });
  const { signatureRequest } = await auth().getSignatureRequest();
  const res = await fetch("/api/fastauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...signatureRequest, signPayload: Array.from(signatureRequest.signPayload) }) });
  const j = await res.json().catch(() => ({ error: `relayer ${res.status}` }));
  if (!res.ok) throw new Error(j.error);
  await rpc.sendTransaction(new SignedTransaction({ transaction: tx, signature: new Signature({ keyType: 0, data: recoverEd25519(j.signature) }) }));
  save({ accountId, key: local.toString() as KeyPairString });
}
