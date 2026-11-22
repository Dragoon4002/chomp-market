"use client";
import { useEffect, useState } from "react";
import { useNearWallet } from "near-connect-hooks";
import { activate, derive, ensureFunded, isLoggedIn, login, onOpenSocial, prepare, relayerReady, type Prep } from "@/lib/social";
import { Btn } from "@/components/ui";

type Step = { s: "choose" } | { s: "busy"; msg: string } | { s: "activate"; prep: Prep } | { s: "error"; msg: string };

export function SignIn() {
  const w = useNearWallet();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ s: "choose" });
  const [pre, setPre] = useState<{ ready: boolean; loggedIn: boolean } | null>(null);
  useEffect(() => onOpenSocial(() => { setStep({ s: "choose" }); setOpen(true); }), []);
  useEffect(() => { if (open) Promise.all([relayerReady(), isLoggedIn()]).then(([ready, loggedIn]) => setPre({ ready, loggedIn })); }, [open]);
  if (!open) return null;
  const fail = (e: unknown) => setStep({ s: "error", msg: (e as Error)?.message || String(e) });
  const google = async () => {
    try {
      if (!pre?.ready) throw new Error("Google login needs the NEAR Auth relayer (FASTAUTH_RELAYER_ID / KEY) on this server.");
      if (!pre.loggedIn) await login();
      setStep({ s: "busy", msg: "Finding your account…" });
      const { pk, accountId } = await derive();
      setStep({ s: "busy", msg: "Creating your account…" });
      if (!(await ensureFunded(accountId))) throw new Error(`Couldn't fund ${accountId}. Send it some testnet NEAR and retry.`);
      setStep({ s: "activate", prep: await prepare(accountId, pk) });
    } catch (e) { fail(e); }
  };
  const enable = async (prep: Prep) => {
    try { setStep({ s: "busy", msg: "Approve in the NEAR Auth window, then wait ~10 s…" }); await activate(prep); setOpen(false); } catch (e) { fail(e); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="grid w-full max-w-md gap-4 rounded-3xl border-3 border-ink bg-panel p-6 shadow-drop">
        <div className="flex items-center justify-between"><h2 className="text-3xl">Sign in</h2><button onClick={() => setOpen(false)} aria-label="Close" className="text-2xl text-muted hover:text-cream">✕</button></div>
        {step.s === "choose" && <>
          <Btn disabled={!pre} onClick={google}>Continue with Google / email</Btn>
          <p className="text-sm font-bold text-muted">No seed phrase. Powered by NEAR Auth (testnet).</p>
          <Btn tone="ghost" onClick={() => { setOpen(false); w.signIn(); }}>Use a NEAR wallet</Btn>
        </>}
        {step.s === "busy" && <p className="font-bold">{step.msg}</p>}
        {step.s === "activate" && <>
          <p className="font-bold">Account <code className="break-all">{step.prep.accountId}</code> is ready. Approve once to enable this device.</p>
          <Btn onClick={() => enable(step.prep)}>Enable this device</Btn>
        </>}
        {step.s === "error" && <>
          <p className="font-bold text-down">{step.msg}</p>
          <Btn tone="ghost" onClick={() => setStep({ s: "choose" })}>Back</Btn>
        </>}
      </div>
    </div>
  );
}
