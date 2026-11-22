import { useEffect, useState } from 'react';
import { DEMO } from '@/lib/demo.ts';
import { errText } from '@/lib/format.ts';
import { fmt, toYocto, usePlatform, useUnifiedBalance, useWallet } from '@/lib/near.ts';
import { HubDialog, Ico } from '@/components/ui.tsx';
import { dryQuote, getTokens, type Quote, type Token } from '@/lib/intents.ts';

export function FundsDialog({ onClose }: { onClose: () => void }) {
  const { signedAccountId, signIn, getBalance } = useWallet();
  const { deposit, withdraw } = usePlatform();
  const { balance } = useUnifiedBalance();
  const [wallet, setWallet] = useState<bigint | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const loadWallet = () => { if (signedAccountId) getBalance(signedAccountId).then(setWallet).catch(() => setWallet(null)); };
  useEffect(loadWallet, [signedAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (kind: 'Deposit' | 'Withdraw') => {
    const n = Number(amount);
    if (!(n > 0)) return setMsg('Enter an amount above 0.');
    let yocto: string;
    try { yocto = toYocto(amount); } catch { return setMsg('Invalid amount.'); }
    if (kind === 'Withdraw' && BigInt(yocto) > BigInt(balance ?? '0')) return setMsg(`Only ${fmt(balance)} NEAR to withdraw.`);
    setBusy(true); setMsg(`${kind}ing…`);
    try {
      await (kind === 'Deposit' ? deposit : withdraw)(yocto);
      setMsg(`${kind} of ${n} NEAR done.`); setAmount('');
    } catch (e) { setMsg(`${kind} failed: ${errText(e)}`); } finally { setBusy(false); loadWallet(); }
  };

  return (
    <HubDialog title="Deposit / withdraw" onClose={onClose}>
      {!signedAccountId ? (
        <button type="button" className="btn" onClick={() => signIn()}><span><Ico n="icon-wallet" />Connect wallet</span></button>
      ) : (
        <>
          <dl className="kv funds-kv">
            <dt>Game balance</dt><dd className="row-ico"><Ico n="coin-stack" />{balance === null ? 'loading…' : `${fmt(balance)} NEAR`}</dd>
            <dt>Wallet</dt><dd className="row-ico"><Ico n="coin" />{wallet === null ? 'loading…' : `${fmt(wallet)} NEAR`}</dd>
          </dl>
          {DEMO ? <p className="note">Demo mode: deposits and withdrawals are off.</p> : (
            <>
              <label className="funds-amount">
                <span>Amount</span>
                <span className="stake-input"><input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} aria-label="Amount in NEAR" /><b>NEAR</b></span>
              </label>
              <div className="funds-actions">
                <button type="button" className="btn" disabled={busy} onClick={() => run('Deposit')}><span><Ico n="coin" />Deposit</span></button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => run('Withdraw')}><span><Ico n="coin-stack" />Withdraw</span></button>
              </div>
            </>
          )}
          {msg && <p className="note" role="status">{msg}</p>}
        </>
      )}
      <AnyChain />
    </HubDialog>
  );
}

const CHAINS: Record<string, string> = { eth: 'Ethereum', arb: 'Arbitrum', base: 'Base', sol: 'Solana', btc: 'Bitcoin', bsc: 'BNB Chain', pol: 'Polygon', op: 'Optimism', avax: 'Avalanche' };
const chain = (c: string) => CHAINS[c] ?? c[0].toUpperCase() + c.slice(1);
const usd = (n: number) => `$${n.toFixed(2)}`;
const eta = (s: number) => (s < 90 ? `~${s} s` : `~${Math.round(s / 60)} min`);

function AnyChain() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [asset, setAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const token = tokens?.find((t) => t.assetId === asset);
  const load = () => { setMsg('Loading tokens…'); getTokens().then((ts) => { setTokens(ts); setAsset(ts[0]?.assetId ?? ''); setMsg(''); }).catch((e) => setMsg(`Tokens failed: ${errText(e)}`)); };
  const reset = () => { setQuote(null); setMsg(''); };

  const getQuote = async () => {
    if (!token) return;
    if (!(Number(amount) > 0)) return setMsg('Enter an amount above 0.');
    setBusy(true); reset(); setMsg('Fetching quote…');
    try { setQuote(await dryQuote(token, amount)); setMsg(''); } catch (e) { setMsg(`Quote failed: ${errText(e)}`); } finally { setBusy(false); }
  };

  return (
    <details className="anychain" onToggle={(e) => e.currentTarget.open && !tokens && load()}>
      <summary>Add funds from any chain <small>NEAR Intents</small></summary>
      <p className="note anychain-warn">Swap any token into NEAR. Quotes are live from mainnet; funding stays off while the game runs on testnet.</p>
      {tokens && (
        <div className="anychain-form">
          <label className="funds-amount">
            <span>From</span>
            <select value={asset} onChange={(e) => { setAsset(e.target.value); reset(); }} disabled={busy} aria-label="Source token">
              {tokens.map((t) => <option key={t.assetId} value={t.assetId}>{t.symbol} on {chain(t.blockchain)}</option>)}
            </select>
          </label>
          <label className="funds-amount">
            <span>Amount</span>
            <span className="stake-input"><input type="number" min="0" step="any" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => { setAmount(e.target.value); reset(); }} disabled={busy} aria-label={`Amount in ${token?.symbol ?? 'source token'}`} /><b>{token?.symbol}</b></span>
          </label>
        </div>
      )}
      {quote && token && (
        <>
          <dl className="kv funds-kv">
            <dt>You send</dt><dd>{quote.amountInFormatted} {token.symbol} ({chain(token.blockchain)}) ≈ {usd(Number(quote.amountInUsd))}</dd>
            <dt>You receive</dt><dd>~{Number(quote.amountOutFormatted).toFixed(4)} NEAR on NEAR ≈ {usd(Number(quote.amountOutUsd))}</dd>
            <dt>Fees</dt><dd>≈ {usd(Number(quote.amountInUsd) - Number(quote.amountOutUsd))} incl. spread, 1% max slippage</dd>
            <dt>ETA</dt><dd>{eta(quote.timeEstimate)} after deposit confirms</dd>
            <dt>Deposit to</dt><dd>address generated on confirm</dd>
          </dl>
        </>
      )}
      {msg && <p className="note" role="status">{msg}</p>}
      {tokens && (
        <div className="funds-actions">
          <button type="button" className="btn" disabled={busy || !token} onClick={getQuote}><span><Ico n="coin" />Get quote</span></button>
          <button type="button" className="btn ghost" disabled title="Mainnet only; this game runs on testnet"><span>Confirm (mainnet)</span></button>
        </div>
      )}
    </details>
  );
}
