import { useMemo, useState } from 'react';
import { DEMO } from '@/lib/demo.ts';
import { fmt, useUnifiedBalance, useWallet } from '@/lib/near.ts';
import { monsters } from '@/lib/store.ts';
import { Ico, Logo, TitleArt } from '@/components/ui.tsx';
import { FundsDialog } from '@/components/account/Funds.tsx';
import { short } from '@/lib/format.ts';

function HubBtn({ href, label, icon, badge, active }: { href: string; label: string; icon: string; badge?: number; active?: boolean }) {
  return (
    <div className="hub-slot">
      <a className="hub-btn" href={href} aria-current={active ? 'page' : undefined}>
        <Ico n={icon} className="hub-btn-ico" />
        <span>{label}</span>
        {badge ? <b className="hub-badge">{badge}</b> : null}
      </a>
    </div>
  );
}

const PANEL_FROM: Record<string, 'left' | 'right' | 'bottom'> = { collection: 'left', customize: 'left', breed: 'left', market: 'left', account: 'left', lobby: 'right', tournaments: 'right', leaderboard: 'right', play: 'bottom' };

export function Title({ page, children }: { page?: string; children?: React.ReactNode }) {
  const list = useMemo(monsters, []);
  const { signedAccountId } = useWallet();
  const { balance } = useUnifiedBalance();
  const [pop, setPop] = useState<'funds' | null>(null);
  const wins = list.reduce((s, x) => s + x.record.w, 0), kos = list.reduce((s, x) => s + x.record.ko, 0);
  return (
    <div className={`hub ${children ? 'open' : ''}`}>
      <TitleArt className="hub-bg" />
      <header className="hub-top">
        <a href="/" aria-label="Home"><Logo className="hub-logo" /></a>
        <div className="hub-counters">
          <span className="hub-count" title="Total wins"><Ico n="trophy" /><i>Wins</i>{wins}</span>
          <span className="hub-count" title="Total knockouts"><Ico n="ko" /><i>KOs</i>{kos}</span>
          {signedAccountId && <button type="button" className="hub-count" onClick={() => setPop('funds')} title="Unified balance, deposit / withdraw"><Ico n="coin" /><i>Balance</i>{balance === null ? '…' : `${fmt(balance)} NEAR`}</button>}
          <a className="hub-count wallet" href="/account"><Ico n="icon-wallet" />{signedAccountId ? short(signedAccountId) : 'Connect wallet'}</a>
          {DEMO && <a className="hub-count demo" href="/" target="_self">Demo mode · exit</a>}
        </div>
      </header>

      <nav className="hub-side left" aria-label="Monsters">
        <HubBtn href="/collection" label="Monsters" icon="icon-monster" badge={list.length} active={page === 'collection'} />
        <HubBtn href="/customize" label="Skills" icon="/skills/Power.svg" active={page === 'customize'} />
        <HubBtn href="/account" label="Account" icon="icon-wallet" active={page === 'account'} />
        <HubBtn href="/breed" label="Breed" icon="icon-breed" active={page === 'breed'} />
        <HubBtn href="/market" label="Market" icon="coin-stack" active={page === 'market'} />
      </nav>

      <nav className="hub-side right" aria-label="Online">
        <HubBtn href="/lobby" label="Lobby" icon="icon-lobby" active={page === 'lobby'} />
        <HubBtn href="/tournaments" label="Cups" icon="trophy" active={page === 'tournaments'} />
        <HubBtn href="/leaderboard" label="Ranks" icon="icon-history" active={page === 'leaderboard'} />
      </nav>

      {children && (
        <main key={page} className={`hub-panel from-${PANEL_FROM[page ?? ''] ?? 'bottom'}`}>
          <a className="hub-close panel-x" href="/" aria-label="Close"><Ico n="icon-close" /></a>
          <div className="page">{children}</div>
        </main>
      )}

      <footer className="hub-bottom" inert={!!children}>
        <a className="btn alt hub-practice" href="/practice"><span><Ico n="ko" />Practice vs bot</span></a>
        <a className="hub-play" href="/play"><span><Ico n="icon-play" />Play</span></a>
      </footer>

      {pop === 'funds' && <FundsDialog onClose={() => setPop(null)} />}
    </div>
  );
}
