// NEAR Intents 1Click API (mainnet only, no testnet). CORS is open, so the browser calls it directly.
const API = 'https://1click.chaindefuser.com/v0';
export const NEAR_ASSET = 'nep141:wrap.near';
// dry quotes need a syntactically valid mainnet account; real flow would use the player's mainnet account
const PREVIEW_ACCOUNT = '0'.repeat(64);

export interface Token { assetId: string; decimals: number; blockchain: string; symbol: string; price: number }
export interface Quote { amountInFormatted: string; amountInUsd: string; amountOutFormatted: string; amountOutUsd: string; minAmountOut: string; timeEstimate: number }

const SHORTLIST = ['base:USDC', 'arb:USDC', 'sol:USDC', 'eth:ETH', 'btc:BTC', 'sol:SOL'];
const rank = (t: Token) => { const i = SHORTLIST.indexOf(`${t.blockchain}:${t.symbol}`); return i < 0 ? SHORTLIST.length : i; };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ? `1Click: ${body.message}` : `1Click HTTP ${res.status}`);
  return body as T;
}

// shortlist first, then the rest alphabetically; NEAR-chain and deprecated assets dropped
export const sortTokens = (ts: Token[]) => ts.filter((t) => t.blockchain !== 'near' && !t.symbol.includes('DEPRECATED'))
  .sort((a, b) => rank(a) - rank(b) || `${a.symbol}${a.blockchain}`.localeCompare(`${b.symbol}${b.blockchain}`));

export const getTokens = () => call<Token[]>('/tokens').then(sortTokens);

export function toBase(amount: string, decimals: number): string {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(amount.trim());
  if (!m || !(m[1] || m[2])) throw new Error('Invalid amount.');
  const frac = (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt((m[1] || '0') + frac).toString();
}

export const dryQuote = (t: Token, amount: string) => call<{ quote: Quote }>('/quote', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    dry: true,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    originAsset: t.assetId,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: NEAR_ASSET,
    amount: toBase(amount, t.decimals),
    refundTo: PREVIEW_ACCOUNT,
    refundType: 'INTENTS', // chain-agnostic refund address, works for every origin chain
    recipient: PREVIEW_ACCOUNT,
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + 3_600_000).toISOString(),
  }),
}).then((r) => r.quote);
