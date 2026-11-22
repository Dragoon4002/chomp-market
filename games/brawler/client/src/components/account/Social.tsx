import { useEffect, useMemo, useState } from 'react';
import { JavascriptProvider } from '@fast-auth-near/javascript-provider';
import {
  Account, actions, baseDecode, createTransaction, getTransactionLastResult, JsonRpcProvider, KeyPair, keyToImplicitAddress,
  PublicKey, Signature, SignedTransaction, type KeyPairString,
} from 'near-api-js';
import { signMessage } from 'near-api-js/nep413';
import { useBaseWallet, WalletOverride, type NearContextValue } from '@xyz/platform';
import { FASTAUTH, FAUCET_URL, recoverEd25519 } from '@/lib/fastauth.ts';
import { HubDialog, Ico } from '@/components/ui.tsx';

// Social login via NEAR Auth: Auth0 (Google/email) -> MPC-derived key -> implicit account.
// One MPC-signed tx adds a local full-access key per device; after that every call (incl. NEP-413) signs locally.
type Session = { accountId: string; key: KeyPairString };
const STORE = 'fastauth:session';
const load = (): Session | null => { try { return JSON.parse(localStorage.getItem(STORE) ?? 'null'); } catch { return null; } };
const rpc = new JsonRpcProvider({ url: FASTAUTH.rpc });
let fa: JavascriptProvider | undefined;
const auth = () => (fa ??= new JavascriptProvider({ network: 'testnet', clientId: FASTAUTH.clientId, domain: FASTAUTH.domain }));
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

async function derive() {
  const path = await auth().getPath();
  const pk = String(await rpc.callFunction({ contractId: FASTAUTH.mpcId, method: 'derived_public_key', args: { path, predecessor: FASTAUTH.contractId, domain_id: 1 } }));
  return { pk, accountId: keyToImplicitAddress(pk) };
}
const exists = (accountId: string) => rpc.viewAccount({ accountId, blockQuery: { finality: 'final' } }).then(() => true, () => false);
const idToken = async () => (await (auth() as unknown as { client: { getIdTokenClaims(): Promise<{ __raw: string } | undefined> } }).client.getIdTokenClaims())?.__raw;
async function autoFund(accountId: string) {
  const res = await fetch('/api/fastauth/fund', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: await idToken() }) });
  if (!res.ok || (await res.json()).accountId !== accountId) return false;
  for (let i = 0; i < 15; i++) { if (await exists(accountId)) return true; await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}

// built before the click so the Auth0 popup opens inside the user gesture
async function prepare(accountId: string, pk: string) {
  const local = KeyPair.fromRandom('ed25519');
  const [ak, block] = await Promise.all([rpc.viewAccessKey({ accountId, publicKey: pk, finalityQuery: { finality: 'final' } }), rpc.viewBlock({ finality: 'final' })]);
  const tx = createTransaction(accountId, PublicKey.from(pk), accountId, BigInt(ak.nonce) + 1n, [actions.addFullAccessKey(local.getPublicKey())], baseDecode(block.header.hash));
  return { accountId, local, tx };
}
type Prep = Awaited<ReturnType<typeof prepare>>;

async function activate({ accountId, local, tx }: Prep): Promise<Session> {
  await auth().requestTransactionSignature({ transaction: tx as never }); // Auth0 approval popup
  const { signatureRequest } = await auth().getSignatureRequest();
  const res = await fetch('/api/fastauth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...signatureRequest, signPayload: Array.from(signatureRequest.signPayload) }) });
  const j = await res.json().catch(() => ({ error: `relayer ${res.status}` }));
  if (!res.ok) throw new Error(j.error);
  await rpc.sendTransaction(new SignedTransaction({ transaction: tx, signature: new Signature({ keyType: 0, data: recoverEd25519(j.signature) }) }));
  return { accountId, key: local.toString() as KeyPairString };
}

function overrideFor(base: NearContextValue, s: Session, signIn: () => Promise<void>, signOut: () => Promise<void>): NearContextValue {
  const acct = new Account(s.accountId, rpc, s.key);
  const callFunctionRaw: NearContextValue['callFunctionRaw'] = ({ contractId, method, args = {}, gas = '30000000000000', deposit = '0' }) =>
    acct.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, BigInt(gas), BigInt(deposit))] }) as never;
  return {
    ...base, signedAccountId: s.accountId, loading: false, signIn, signOut, callFunctionRaw,
    callFunction: async (p) => getTransactionLastResult((await callFunctionRaw(p)) as never),
    transfer: ({ receiverId, amount }) => acct.signAndSendTransaction({ receiverId, actions: [actions.transfer(BigInt(amount))] }) as never,
    signNEP413Message: async ({ message, recipient, nonce }) => {
      const m = await signMessage({ signerAccount: acct, payload: { message, recipient, nonce } });
      return { accountId: m.accountId, publicKey: m.publicKey.toString(), signature: b64(m.signature) };
    },
  };
}

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const base = useBaseWallet();
  const [session, setSession] = useState(load);
  const [open, setOpen] = useState(false);
  const value = useMemo(() => {
    if (!FASTAUTH.enabled) return null;
    const signIn = async () => setOpen(true);
    if (!session) return { ...base, signIn };
    const signOut = async () => { localStorage.removeItem(STORE); setSession(null); await auth().logout({ openUrl: false }).catch(() => {}); };
    return overrideFor(base, session, signIn, signOut);
  }, [base, session]);
  const done = (s: Session) => { localStorage.setItem(STORE, JSON.stringify(s)); setSession(s); setOpen(false); };
  return (
    <WalletOverride.Provider value={value}>
      {children}
      {open && <SocialDialog onClose={() => setOpen(false)} onWallet={() => { setOpen(false); base.signIn(); }} onDone={done} />}
    </WalletOverride.Provider>
  );
}

type Step = { s: 'choose' } | { s: 'busy'; msg: string } | { s: 'fund'; accountId: string; pk: string } | { s: 'activate'; prep: Prep } | { s: 'error'; msg: string };
const RELAYER_MISSING = 'Social login is not set up on this server yet (NEAR Auth relayer missing). Use a NEAR wallet for now.';

function SocialDialog({ onClose, onWallet, onDone }: { onClose: () => void; onWallet: () => void; onDone: (s: Session) => void }) {
  const [step, setStep] = useState<Step>({ s: 'choose' });
  // checked up front so the click can open the Auth0 popup without awaiting anything first
  const [pre, setPre] = useState<{ ready: boolean; loggedIn: boolean } | null>(null);
  useEffect(() => {
    Promise.all([fetch('/api/fastauth').then((r) => r.json()).then((j) => !!j.ready, () => false), auth().isLoggedIn()]).then(([ready, loggedIn]) => setPre({ ready, loggedIn }));
  }, []);
  const fail = (e: unknown) => setStep({ s: 'error', msg: (e as Error).message || String(e) });
  const toAccount = async (accountId: string, pk: string) => {
    if (!(await exists(accountId))) {
      setStep({ s: 'busy', msg: 'Creating your account…' });
      if (!(await autoFund(accountId).catch(() => false))) return setStep({ s: 'fund', accountId, pk });
    }
    setStep({ s: 'activate', prep: await prepare(accountId, pk) });
  };
  const login = async () => {
    try {
      if (!pre?.ready) throw new Error(RELAYER_MISSING);
      if (!pre.loggedIn) await auth().login();
      setStep({ s: 'busy', msg: 'Finding your account…' });
      const { pk, accountId } = await derive();
      await toAccount(accountId, pk);
    } catch (e) { fail(e); }
  };
  const fundStep = step.s === 'fund' ? step : null;
  useEffect(() => {
    if (!fundStep) return;
    const t = setInterval(() => exists(fundStep.accountId).then((ok) => { if (ok) toAccount(fundStep.accountId, fundStep.pk).catch(fail); }), 4000);
    return () => clearInterval(t);
  }, [fundStep?.accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async (prep: Prep) => {
    try { setStep({ s: 'busy', msg: 'Approve in the NEAR Auth window, then wait ~10 s…' }); onDone(await activate(prep)); } catch (e) { fail(e); }
  };
  return (
    <HubDialog title="Sign in" onClose={onClose}>
      {step.s === 'choose' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <button type="button" className="btn alt" disabled={!pre} onClick={login}><span><Ico n="icon-wallet" />Continue with Google / email</span></button>
          <p className="sub" style={{ margin: 0 }}>No seed phrase. Powered by NEAR Auth (testnet).</p>
          <button type="button" className="btn ghost" onClick={onWallet}><span><Ico n="icon-wallet" />Use a NEAR wallet</span></button>
        </div>
      )}
      {step.s === 'busy' && <p>{step.msg}</p>}
      {step.s === 'fund' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p>Your new NEAR account needs some testnet NEAR before it can play. Paste this address into the faucet:</p>
          <code style={{ overflowWrap: 'anywhere' }}>{step.accountId}</code>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(step.accountId)}><span>Copy address</span></button>
            <a className="btn" href={FAUCET_URL} target="_blank" rel="noreferrer"><span><Ico n="coin" />Open testnet faucet</span></a>
          </div>
          <p className="sub" style={{ margin: 0 }}>Waiting for funds… this updates by itself.</p>
        </div>
      )}
      {step.s === 'activate' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p>Account <code style={{ overflowWrap: 'anywhere' }}>{step.prep.accountId}</code> is ready. Approve once to enable this device.</p>
          <button type="button" className="btn alt" onClick={() => go(step.prep)}><span>Enable this device</span></button>
        </div>
      )}
      {step.s === 'error' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ color: 'var(--danger)' }}>{step.msg}</p>
          <button type="button" className="btn ghost" onClick={() => setStep({ s: 'choose' })}><span>Back</span></button>
        </div>
      )}
    </HubDialog>
  );
}
