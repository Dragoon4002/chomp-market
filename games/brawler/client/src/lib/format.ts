import { fmt } from '@xyz/platform';

export const errText = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 160);
export const when = (ms: number) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const short = (a: string | null | undefined) =>
  !a ? '—' : /^[0-9a-f]{64}$/.test(a) ? `${a.slice(0, 3)}...${a.slice(-3)}` : a.length > 22 ? `${a.slice(0, 20)}…` : a;
export const signed = (y: bigint) => `${y >= 0n ? '+' : '−'}${fmt(y >= 0n ? y : -y)}`;
