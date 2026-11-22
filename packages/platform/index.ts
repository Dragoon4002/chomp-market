import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NearProvider, useNearWallet as useBaseWallet, type NearContextValue } from 'near-connect-hooks';
import { nearToYocto, yoctoToNear } from 'near-api-js';

export { NearProvider, useBaseWallet, type NearContextValue };
// lets an app swap in another signer (e.g. social login) under every useNearWallet caller
export const WalletOverride = createContext<NearContextValue | null>(null);
export function useNearWallet(): NearContextValue {
  const base = useBaseWallet();
  return useContext(WalletOverride) ?? base;
}
export const NETWORK = 'testnet' as const;
export const PLATFORM_ID: string = process.env.NEXT_PUBLIC_PLATFORM_ID ?? 'v3.brawler-platform-5c8e2b.testnet';
export const MARKET_URL: string = process.env.NEXT_PUBLIC_MARKET_URL ?? 'http://localhost:3100';
export const GAS = '30000000000000';

export const toYocto = (near: string | number) => nearToYocto(String(near) as `${number}`).toString();
export const fmt = (yocto: string | bigint | undefined | null) => {
  if (yocto == null) return '0';
  const n = Number(yoctoToNear(BigInt(yocto)));
  return n === 0 ? '0' : n < 0.01 ? n.toPrecision(2) : n.toFixed(n < 10 ? 3 : 2).replace(/\.?0+$/, '');
};

// tx done -> every useBalance refetches
const bus = new EventTarget();
export const balanceChanged = () => bus.dispatchEvent(new Event('bal'));

export function usePlatform() {
  const w = useNearWallet();
  const call = async (method: string, args: Record<string, unknown>, deposit = '0', gas = GAS) => {
    try { return await w.callFunction({ contractId: PLATFORM_ID, method, args, gas, deposit }); } finally { balanceChanged(); }
  };
  const view = <T,>(method: string, args: Record<string, unknown> = {}) =>
    w.viewFunction({ contractId: PLATFORM_ID, method, args }) as Promise<T>;
  return {
    w, call, view,
    balanceOf: async (account: string) => String((await view<string>('balance_of', { account_id: account }).catch(() => null)) ?? '0'),
    deposit: (yocto: string) => call('deposit', {}, yocto),
    withdraw: (yocto: string) => call('withdraw', { amount: yocto }),
  };
}

// Unified balance (yocto), null = signed out/unknown. Polls 15 s + refetch on balanceChanged.
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
