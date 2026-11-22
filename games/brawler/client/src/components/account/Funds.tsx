import { useEffect, useState } from 'react';
import { DEMO } from '@/lib/demo.ts';
import { errText } from '@/lib/format.ts';
import { fmt, toYocto, UNIT, usePlatform, useUnifiedBalance, useWallet } from '@/lib/chain.ts';
import { HubDialog, Ico } from '@/components/ui.tsx';

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
    if (kind === 'Withdraw' && BigInt(yocto) > BigInt(balance ?? '0')) return setMsg(`Only ${fmt(balance)} ${UNIT} to withdraw.`);
    setBusy(true); setMsg(`${kind}ing…`);
    try {
      await (kind === 'Deposit' ? deposit : withdraw)(yocto);
      setMsg(`${kind} of ${n} ${UNIT} done.`); setAmount('');
    } catch (e) { setMsg(`${kind} failed: ${errText(e)}`); } finally { setBusy(false); loadWallet(); }
  };

  return (
    <HubDialog title="Deposit / withdraw" onClose={onClose}>
      {!signedAccountId ? (
        <button type="button" className="btn" onClick={() => signIn()}><span><Ico n="icon-wallet" />Connect wallet</span></button>
      ) : (
        <>
          <dl className="kv funds-kv">
            <dt>Game balance</dt><dd className="row-ico"><Ico n="coin-stack" />{balance === null ? 'loading…' : `${fmt(balance)} ${UNIT}`}</dd>
            <dt>Wallet</dt><dd className="row-ico"><Ico n="coin" />{wallet === null ? 'loading…' : `${fmt(wallet)} ${UNIT}`}</dd>
          </dl>
          {DEMO ? <p className="note">Demo mode: deposits and withdrawals are off.</p> : (
            <>
              <label className="funds-amount">
                <span>Amount</span>
                <span className="stake-input"><input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} aria-label={`Amount in ${UNIT}`} /><b>{UNIT}</b></span>
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
    </HubDialog>
  );
}

