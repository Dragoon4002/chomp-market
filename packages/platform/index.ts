import { useCallback, useEffect, useState, type ReactNode } from 'react';

// Chain seam shared by every client: signed-out stub until Solana lands.
// TODO(solana): wallet adapter (connect/sign/send) + program/MagicBlock ER reads behind this same shape.
export interface Wallet {
  signedAccountId: string; // '' = signed out
  loading: boolean;
  network: string;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getBalance(account: string): Promise<bigint>;
  callFunction(p: { contractId: string; method: string; args?: Record<string, unknown>; gas?: string; deposit?: string }): Promise<unknown>;
  viewFunction(p: { contractId: string; method: string; args?: Record<string, unknown> }): Promise<unknown>;
  signMessage(p: { message: string; recipient: string; nonce: Uint8Array }): Promise<{ publicKey: string; signature: string }>;
}

export const SOON = 'On-chain features coming soon (Solana port in progress)';
const soon = async (): Promise<never> => { throw new Error(SOON); };
const STUB: Wallet = {
  signedAccountId: '', loading: false, network: 'none',
  signIn: soon, signOut: async () => {}, getBalance: soon, callFunction: soon, viewFunction: soon, signMessage: soon,
};

// TODO(solana): mount wallet-adapter providers here.
export const WalletProvider = ({ children }: { children: ReactNode; config?: unknown }) => children;
export const useWallet = (): Wallet => STUB;

export const NETWORK = 'none' as const;
export const PLATFORM_ID: string = process.env.NEXT_PUBLIC_PLATFORM_ID ?? '';
export const MARKET_URL: string = process.env.NEXT_PUBLIC_MARKET_URL ?? 'http://localhost:3100';
export const GAS = '0';
export const UNIT = 'SOL';

// TODO(solana): amounts are still 24-decimal base-unit strings; switch to lamports (1e9).
const DEC = 24;
export const toYocto = (amount: string | number) => {
  const [i, f = ''] = String(amount).split('.');
  return (BigInt(i || '0') * 10n ** BigInt(DEC) + BigInt((f + '0'.repeat(DEC)).slice(0, DEC))).toString();
};
export const fmt = (base: string | bigint | undefined | null) => {
  if (base == null) return '0';
  const n = Number(BigInt(base)) / 10 ** DEC;
  return n === 0 ? '0' : n < 0.01 ? n.toPrecision(2) : n.toFixed(n < 10 ? 3 : 2).replace(/\.?0+$/, '');
};

// tx done -> every useBalance refetches
const bus = new EventTarget();
export const balanceChanged = () => bus.dispatchEvent(new Event('bal'));

export function usePlatform() {
  const w = useWallet();
  const call = async (method: string, args: Record<string, unknown>, deposit = '0', gas = GAS) => {
    try { return await w.callFunction({ contractId: PLATFORM_ID, method, args, gas, deposit }); } finally { balanceChanged(); }
  };
  const view = <T,>(method: string, args: Record<string, unknown> = {}) =>
    w.viewFunction({ contractId: PLATFORM_ID, method, args }) as Promise<T>;
  return {
    w, call, view,
    balanceOf: async (account: string) => String((await view<string>('balance_of', { account_id: account }).catch(() => null)) ?? '0'),
    deposit: (amount: string) => call('deposit', {}, amount),
    withdraw: (amount: string) => call('withdraw', { amount }),
  };
}

// Unified balance (base units), null = signed out/unknown. Polls 15 s + refetch on balanceChanged.
export function useBalance(): { balance: string | null; refresh: () => void } {
  const { w, balanceOf } = usePlatform();
  const acct = w.signedAccountId;
  const [balance, set] = useState<string | null>(null);
  const refresh = useCallback(() => {
    if (!acct) return set(null);
    balanceOf(acct).then(set).catch(() => {});
  }, [acct]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    bus.addEventListener('bal', refresh);
    return () => { clearInterval(t); bus.removeEventListener('bal', refresh); };
  }, [refresh]);
  return { balance, refresh };
}
