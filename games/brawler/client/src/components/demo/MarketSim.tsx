import { useMemo, useState } from 'react';
import { DEMO_ROOMS } from '@/lib/demo.ts';
import { simulate, type Entry } from '@/lib/market.ts';
import { fmt } from '@/lib/near.ts';
import { signed } from '@/lib/format.ts';
import { PriceChart } from '@/components/rooms/PriceChart.tsx';
import { Ico } from '@/components/ui.tsx';

const FIGHTERS = DEMO_ROOMS[0].players.map((p) => p.name);
const ACTION: Record<Entry['kind'], string> = { order: 'places order', cancel: 'cancels', fee: 'fee', payout: 'winnings', refund: 'refund' };

export function MarketSim() {
  const [traders, setTraders] = useState(8);
  const [orders, setOrders] = useState(60);
  const [outcome, setOutcome] = useState<'auto' | '0' | '1' | 'void'>('auto');
  const [run, setRun] = useState(1);
  const { market: m, names, audit: a } = useMemo(
    () => simulate({ traders, orders, run, winner: outcome === 'auto' ? 'auto' : outcome === 'void' ? null : Number(outcome) }),
    [traders, orders, outcome, run],
  );

  const rows = names.map((who) => {
    let paid = 0n, settled = 0n;
    for (const e of m.ledger) if (e.who === who) {
      if (e.kind === 'order') paid += e.near;
      else if (e.kind === 'cancel') paid -= e.near;
      else if (e.kind === 'payout' || e.kind === 'refund') settled += e.near;
    }
    return { who, paid, settled, pnl: settled - paid };
  }).filter((r) => r.paid > 0n).sort((x, y) => (y.pnl > x.pnl ? 1 : -1));
  const traderNet = rows.reduce((s, r) => s + r.pnl, 0n);
  const result = m.winner === null ? 'Match void: everyone gets back exactly what they paid' : `${FIGHTERS[m.winner]} wins: each ${FIGHTERS[m.winner]} share pays 0.01 NEAR`;
  const select = (label: string, value: string | number, set: (v: string) => void, opts: [string | number, string][]) => (
    <label className="row">{label}<select value={value} onChange={(e) => set(e.target.value)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
  );

  return (
    <>
      <div>
        <h1>Market simulation</h1>
        <p className="sub">A full spectator order book run in your browser with the same math as the arena contract. Fake traders quote around the fight's momentum; every trade needs a real counterparty, so there is no house money at risk. Then the match settles and everyone claims. Nothing touches the chain.</p>
      </div>

      <section className="slab sim-controls">
        {select('Traders', traders, (v) => setTraders(Number(v)), [[4, '4'], [8, '8'], [16, '16']])}
        {select('Orders', orders, (v) => setOrders(Number(v)), [[30, '30'], [60, '60'], [120, '120']])}
        {select('Result', outcome, (v) => setOutcome(v as typeof outcome), [['auto', 'Follow the fight'], ['0', `${FIGHTERS[0]} wins`], ['1', `${FIGHTERS[1]} wins`], ['void', 'Void (refund)']])}
        <button className="btn" onClick={() => setRun(run + 1)}><span><Ico n="icon-refresh" />Run again (#{run})</span></button>
      </section>

      <div className="split">
        <section className="slab sim-block">
          <h2>{FIGHTERS[0]} price</h2>
          <PriceChart pts={m.history.map(([, b]) => b / 1e4)} />
          <p className="note">Ends at {Math.round(m.price / 100)}%. {result}.</p>
          <p className="note">A {FIGHTERS[0]} bid at p% and a {FIGHTERS[1]} bid at q% trade when p + q ≥ 100%: together they fund one 0.01 NEAR share of each, the resting order's price sets the trade. Fee {Number(m.feeBps) / 100}% of winnings.</p>
        </section>
        <section className="slab sim-block">
          <h2>The books</h2>
          <dl className="kv">
            <dt>Paid in (orders − cancels)</dt><dd>{fmt(a.in)} NEAR</dd>
            <dt>Paid at settlement</dt><dd>{fmt(a.payouts)} NEAR</dd>
            <dt>Fees to treasury</dt><dd>{fmt(a.fees)} NEAR</dd>
            <dt>Traders net</dt><dd><b className={traderNet >= 0n ? 'pnl-up' : 'pnl-down'}>{signed(traderNet)} NEAR</b></dd>
            <dt>Difference</dt><dd>{a.dust.toString()} yocto</dd>
          </dl>
          <p className={a.dust === 0n ? 'pnl-up' : 'pnl-down'} role="status">
            {a.dust === 0n ? '✓ Balanced to the yocto: every NEAR in was paid out or taken as fees.' : '✗ Books do not balance.'}
          </p>
        </section>
      </div>

      <section className="slab sim-block">
        <h2>Traders</h2>
        <div className="sim-scroll">
          <table className="sim-table">
            <thead><tr><th>Account</th><th>Paid in</th><th>Settlement</th><th>Net</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.who}><td>{r.who}</td><td>{fmt(r.paid)}</td><td>{fmt(r.settled)}</td><td className={r.pnl >= 0n ? 'pnl-up' : 'pnl-down'}>{signed(r.pnl)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="slab sim-block">
        <h2>Every payment ({m.ledger.length})</h2>
        <div className="sim-scroll tall">
          <table className="sim-table">
            <thead><tr><th>#</th><th>Who</th><th>Action</th><th>NEAR</th></tr></thead>
            <tbody>
              {m.ledger.map((e, k) => (
                <tr key={k} className={e.kind === 'fee' ? 'muted' : ''}>
                  <td>{k + 1}</td><td>{e.who}</td><td>{ACTION[e.kind]}</td><td>{fmt(e.near)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
