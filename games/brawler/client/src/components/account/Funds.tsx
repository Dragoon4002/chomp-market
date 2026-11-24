import { useEffect, useState } from 'react';
import { ix, myMatches, readMatch } from '@xyz/platform';
import { DEMO } from '@/lib/demo.ts';
import { errText } from '@/lib/format.ts';
import { fmt, GAME, requestFaucet, UNIT, useUnifiedBalance, useWallet } from '@/lib/chain.ts';
import { type Reclaim, reclaims, remember } from '@/lib/stakes.ts';
import { HubDialog, Ico } from '@/components/ui.tsx';

// Devnet: the wallet's SOL is the balance (no platform deposit). Standalone burner can top up from the faucet.
export function FundsDialog({ onClose }: { onClose: () => void }) {
  const w = useWallet();
  const { balance } = useUnifiedBalance();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const drip = async () => {
    setBusy(true); setMsg('Requesting devnet SOL…');
    try { await requestFaucet(w.signedAccountId); setMsg('Devnet SOL sent.'); } catch (e) { setMsg(`Faucet: ${errText(e)}`); } finally { setBusy(false); }
  };
  return (
    <HubDialog title="Balance" onClose={onClose}>
      {!w.signedAccountId ? (
        <button type="button" className="btn" onClick={() => w.signIn()}><span><Ico n="icon-wallet" />Connect wallet</span></button>
      ) : (
        <>
          <dl className="kv funds-kv">
            <dt>Wallet</dt><dd className="row-ico"><Ico n="coin" />{balance === null ? 'loading…' : `${fmt(balance)} ${UNIT}`} <small>devnet</small></dd>
          </dl>
          {!DEMO && 'kind' in w && w.kind === 'burner' && (
            <div className="funds-actions"><button type="button" className="btn" disabled={busy} onClick={drip}><span><Ico n="coin" />Get devnet SOL</span></button></div>
          )}
          <p className="note">Stakes are held by the match account on-chain; the referee pays the winner.</p>
          {msg && <p className="note" role="status">{msg}</p>}
          {!DEMO && <ReclaimList />}
        </>
      )}
    </HubDialog>
  );
}

// Stakes still escrowed in matches this browser opened/joined: host can cancel an open seat; a filled seat refunds both after 2 h.
function ReclaimList() {
  const w = useWallet();
  const me = w.signedAccountId;
  const [rows, setRows] = useState<Reclaim[]>([]);
  const [msg, setMsg] = useState('');
  const load = () => {
    myMatches(GAME, me).catch(() => []).then((ids) => { ids.forEach((id) => remember(GAME, id)); return reclaims(GAME, me, (id) => readMatch(GAME, id)); }).then(setRows, () => {}); // sandbox has no localStorage
  };
  useEffect(load, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return msg ? <p className="note" role="status">{msg}</p> : null; // keep "Stake refunded." after the last row goes
  const now = Date.now() / 1000;
  const go = async (r: Reclaim) => {
    setMsg('Confirm in your wallet…');
    try { await w.sendIxs([ix.cancel(me, GAME, r.id, r.m.a, r.m.b)]); setMsg('Stake refunded.'); load(); } catch (e) { setMsg(`Reclaim: ${errText(e)}`); }
  };
  return (
    <>
      <h3>Reclaim stake</h3>
      <ul className="reclaim">
        {rows.map((r) => (
          <li key={r.id}>
            {fmt(r.m.stake)} {UNIT} · {r.m.b ? 'rival joined' : 'seat open'}{' '}
            {now > r.at
              ? <button type="button" className="link" onClick={() => go(r)}>Reclaim</button>
              : <small>refund opens {new Date(r.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>}
          </li>
        ))}
      </ul>
      {msg && <p className="note" role="status">{msg}</p>}
    </>
  );
}
