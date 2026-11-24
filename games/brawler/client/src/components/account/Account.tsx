import { useEffect, useState } from 'react';
import { getAudio, setAudio } from '@/lib/audio.ts';
import { fmt, UNIT, useUnifiedBalance, useWallet } from '@/lib/chain.ts';
import { MARKET_URL, useMonsters } from '@/lib/nft.ts';
import { useLoad } from '@/hooks/async.ts';
import { monsters } from '@/lib/store.ts';
import { Ico } from '@/components/ui.tsx';
import { Claims } from './Claims.tsx';
import { FundsDialog } from './Funds.tsx';
import { History, Stats, useFights } from './History.tsx';
import { short } from '@/lib/format.ts';

export function Account() {
  const { signedAccountId, signIn, signOut, getBalance, loading, network, kind } = useWallet();
  const { balance } = useUnifiedBalance();
  const [bal, setBal] = useState<string>('');
  useEffect(() => {
    if (!signedAccountId) return setBal('');
    getBalance(signedAccountId).then((y: bigint) => setBal(fmt(y))).catch(() => setBal('unavailable'));
  }, [signedAccountId, getBalance]);
  const { fights, loading: fl } = useFights(signedAccountId, true);
  const api = useMonsters();
  const [owed, setOwed] = useState('0');
  const [funds, setFunds] = useState(false);
  useEffect(() => { if (signedAccountId) api.owed().then(setOwed).catch(() => {}); }, [signedAccountId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div><h1 className="row-ico"><Ico n="icon-wallet" className="ico h" />Account</h1><p className="sub">Your wallet owns your monsters. Network: {network}.</p></div>
      <div className="split">
        <section className="slab" style={{ display: 'grid', gap: 14 }}>
          {loading ? <p>Checking wallet…</p> : signedAccountId ? (
            <>
              <h2 title={signedAccountId}>{short(signedAccountId)}</h2>
              <dl className="kv"><dt>Wallet</dt><dd className="row-ico"><Ico n="coin" />{bal ? `${bal} ${UNIT}` : 'loading…'} <button type="button" className="link" onClick={() => setFunds(true)}>Get devnet SOL</button></dd><dt>Monsters</dt><dd className="row-ico"><Ico n="icon-monster" />{monsters().length}</dd></dl>
              {owed !== '0' && <button className="btn" onClick={() => api.withdrawOwed().then(() => setOwed('0'))}><span><Ico n="coin" />Withdraw {fmt(owed)} {UNIT} from failed payouts</span></button>}
              {kind !== 'bridge' && <button className="btn ghost" onClick={() => signOut()}><span><Ico n="icon-close" />Disconnect</span></button>}
            </>
          ) : (
            <>
              <h2>Connect a wallet</h2>
              <p className="sub">Sign in once. Stakes come from your wallet's devnet SOL.</p>
              <button className="btn" onClick={() => signIn()}><span><Ico n="icon-wallet" />Sign in</span></button>
            </>
          )}
        </section>
        <Stats fights={fights} />
      </div>
      {funds && <FundsDialog onClose={() => setFunds(false)} />}
      {signedAccountId && <SkillsTile me={signedAccountId} />}
      <Claims />
      <History fights={fights} loading={fl} />
      <SoundSettings />
    </>
  );
}

function SkillsTile({ me }: { me: string }) {
  const api = useMonsters();
  const [d] = useLoad(() => Promise.all([api.skills(), api.mine()]), [me]);
  if (!d) return null;
  const [owned, mons] = d;
  const tiles = [['Free', owned.reduce((n, s) => n + s.free, 0)], ['Equipped', mons.reduce((n, m) => n + (m.owner === me ? m.skillIds.length : 0), 0)]] as const;
  return (
    <section className="slab" style={{ display: 'grid', gap: 14 }} aria-label="Skills">
      <h2 className="row-ico"><Ico n="/skills/Power.svg" />Skills</h2>
      <div className="stat-tiles">{tiles.map(([label, v]) => <div key={label} className="stat-tile"><b>{v}</b><small>{label}</small></div>)}</div>
      {owned.length > 0 && <span className="badges">{owned.map((s) => <span key={s.id} className="chip row-ico skill-chip"><Ico n={`/skills/${s.kind}.svg`} />{s.name} ×{s.free}</span>)}</span>}
      <div className="row">
        <a className="btn" href="/customize"><span><Ico n="/skills/Power.svg" />Customize</span></a>
        <a className="btn alt" href={MARKET_URL} target="_blank" rel="noopener"><span><Ico n="coin-stack" />Get skills</span></a>
      </div>
    </section>
  );
}

function SoundSettings() {
  const [a, setA] = useState(getAudio);
  const set = (p: Parameters<typeof setAudio>[0]) => setA({ ...setAudio(p) });
  return (
    <section className="slab" style={{ display: 'grid', gap: 12 }} aria-label="Sound">
      <h2 className="row-ico"><Ico n={a.muted ? 'icon-sound-off' : 'icon-sound-on'} />Sound</h2>
      <label className="row">Music
        <input type="range" min={0} max={1} step={0.05} value={a.music} onChange={(e) => set({ music: +e.target.value })} style={{ flex: 1, minHeight: 0, padding: 0 }} />
      </label>
      <label className="row">Effects
        <input type="range" min={0} max={1} step={0.05} value={a.sfx} onChange={(e) => set({ sfx: +e.target.value })} style={{ flex: 1, minHeight: 0, padding: 0 }} />
      </label>
      <label className="row"><input type="checkbox" checked={a.muted} onChange={(e) => set({ muted: e.target.checked })} style={{ minHeight: 0 }} /> Mute everything (M in a fight)</label>
    </section>
  );
}
