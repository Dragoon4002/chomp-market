"use client";
// Market wallet: burner + bridge come from packages/platform/chomp.ts; Privy (embedded / external Solana wallets) is injected here
// because the Privy dep lives only in market. Imported by relative path: the platform's index.ts pulls the game clients' React copy.
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { toSolanaWalletConnectors, useSignMessage, useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { balance, bus, getWallet, KIND_KEY, NETWORK, sendTx, setWallet, SIGNED_OUT, subscribe } from "../../packages/platform/chomp";

export * from "../../packages/platform/chomp";
// Privy = the wallet connector when set (Connect opens Privy). Unset (local dev) = burner fallback.
export const PRIVY_APP_ID: string = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ""; // same-origin faucet: requestFaucet(pk, BASE)

export const useChompWallet = () => useSyncExternalStore(subscribe, getWallet, getWallet);
// opens the header connect menu (useAssets().signIn, portal `connect`)
export const openConnect = () => dispatchEvent(new Event("chomp:connect"));

// lamports, null = unknown. Polls 15 s + refetch on balanceChanged.
export function useSol(account: string) {
  const [v, set] = useState<bigint | null>(null);
  const refresh = useCallback(() => { if (account) balance(account).then(set).catch(() => {}); else set(null); }, [account]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    bus.addEventListener("bal", refresh);
    return () => { clearInterval(t); bus.removeEventListener("bal", refresh); };
  }, [refresh]);
  return v;
}

let privyLogin: (() => void) | null = null;
export const loginPrivy = () => { localStorage.setItem(KIND_KEY, "privy"); privyLogin?.(); };

function PrivySync() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { signMessage } = useSignMessage();
  const w = authenticated ? wallets[0] : undefined;
  const sync = useCallback(() => {
    if (w && localStorage.getItem(KIND_KEY) === "privy") {
      setWallet({
        signedAccountId: w.address, loading: false, network: NETWORK, kind: "privy",
        signIn: async () => {},
        signOut: async () => { localStorage.removeItem(KIND_KEY); setWallet(SIGNED_OUT); await logout(); },
        getBalance: (a) => balance(a),
        sendIxs: (ixs, o) => sendTx(w.address, ixs, !!o?.er, async (transaction) =>
          (await signTransaction({ transaction, wallet: w, chain: "solana:devnet" })).signedTransaction),
        signBytes: async (message) => (await signMessage({ message, wallet: w })).signature,
      });
    } else if (getWallet().kind === "privy") setWallet(SIGNED_OUT);
  }, [w, logout, signTransaction, signMessage]);
  useEffect(() => { if (ready) sync(); }, [ready, sync]);
  useEffect(() => { privyLogin = () => (authenticated ? sync() : login()); }, [authenticated, sync, login]);
  return null;
}

export function WalletProviders({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return children;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={{
      appearance: { theme: "dark", walletChainType: "solana-only" },
      embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } },
      externalWallets: { solana: { connectors: toSolanaWalletConnectors(), chain: "solana:devnet" } },
    }}>
      <PrivySync />{children}
    </PrivyProvider>
  );
}
