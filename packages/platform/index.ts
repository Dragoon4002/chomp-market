import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { bus, getWallet, subscribe, toLamports, type Wallet } from './chomp.ts';

// React layer over chomp.ts (Solana devnet). Wallet impl: bridge inside the portal iframe, else burner (or whatever setWallet injects).
export * from './chomp.ts';

export const SOON = 'On-chain features coming soon (Solana port in progress)';
const soon = async (): Promise<never> => { throw new Error(SOON); };
// Old NEAR-shaped calls kept so un-migrated callers compile; they throw SOON. Use sendIxs/signBytes + chomp ix builders instead.
type Legacy = {
  callFunction(p: { contractId: string; method: string; args?: Record<string, unknown>; gas?: string; deposit?: string }): Promise<unknown>;
  viewFunction(p: { contractId: string; method: string; args?: Record<string, unknown> }): Promise<unknown>;
  signMessage(p: { message: string; recipient: string; nonce: Uint8Array }): Promise<{ publicKey: string; signature: string }>;
};

export const WalletProvider = ({ children }: { children: ReactNode; config?: unknown }) => children;
export function useWallet(): Wallet & Legacy {
  const w = useSyncExternalStore(subscribe, getWallet, getWallet);
  return useMemo(() => ({ ...w, callFunction: soon, viewFunction: soon, signMessage: soon }), [w]);
}

export const PLATFORM_ID: string = process.env.NEXT_PUBLIC_PLATFORM_ID ?? '';
export const GAS = '0';
export const toYocto = toLamports; // old name

// No platform balance on Solana: balance = wallet lamports. deposit/withdraw kept for old callers.
export function usePlatform() {
  const w = useWallet();
  const notHere = async (): Promise<never> => { throw new Error('No platform balance on devnet: your wallet SOL is your balance'); };
  return {
    w,
    call: (method: string, args: Record<string, unknown>, deposit = '0', gas = GAS) => w.callFunction({ contractId: PLATFORM_ID, method, args, gas, deposit }),
    view: <T,>(method: string, args: Record<string, unknown> = {}) => w.viewFunction({ contractId: PLATFORM_ID, method, args }) as Promise<T>,
    balanceOf: async (account: string) => String(await w.getBalance(account)), // via wallet/bridge (429 retry); errors propagate, never a fake 0
    deposit: (_amount: string) => notHere(),
    withdraw: (_amount: string) => notHere(),
  };
}

// Wallet balance (lamports string), null = signed out/unknown. Polls 15 s + refetch on balanceChanged.
export function useBalance(): { balance: string | null; refresh: () => void } {
  const acct = useWallet().signedAccountId;
  const [bal, set] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!acct) return set(null);
    getWallet().getBalance(acct).then((b) => set(String(b))).catch(() => {});
  }, [acct]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    bus.addEventListener('bal', refresh);
    return () => { clearInterval(t); bus.removeEventListener('bal', refresh); };
  }, [refresh]);
  return { balance: bal, refresh };
}
