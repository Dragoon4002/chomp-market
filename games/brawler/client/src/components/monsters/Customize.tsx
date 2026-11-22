import { useState } from 'react';
import { applySkills, archetype, sanitizeSkills, statsOf, SKILL_FX_MAX, SKILL_SLOTS, type Skill } from '@/lib/genes.ts';
import { useWallet } from '@/lib/chain.ts';
import { MARKET_URL, useMonsters, type NftMonster, type SkillType } from '@/lib/nft.ts';
import { when } from '@/lib/format.ts';
import { useAct, useLoad } from '@/hooks/async.ts';
import { Ico, Portrait, Stats } from '@/components/ui.tsx';
import { practice } from '@/components/Arena.tsx';
import { isEffect, skillLabel, SKILL_TEXT } from './text.ts';

const asSkill = (t: SkillType): Skill => ({ kind: t.kind, mag: t.mag });

// Why this monster's loadout can't change right now (null = it can).
function frozen(m: NftMonster, me: string) {
  const now = Date.now();
  if (!me) return 'Connect your wallet to equip skills.';
  if (m.owner !== me) return 'Rented: only the owner can change its skills.';
  if (m.rental && m.rental.untilMs > now) return `Rented out until ${when(m.rental.untilMs)}: skills are frozen.`;
  if (m.lockedUntil > now) return 'In a match: the loadout is frozen until it ends.';
  return null;
}

// Why `t` can't go into `slots` (null = it can).
function blocked(slots: SkillType[], t: SkillType, left: number) {
  if (slots.some((s) => s.id === t.id)) return 'Already equipped';
  if (left <= 0) return 'None free';
  if (slots.length >= SKILL_SLOTS) return 'All 3 slots used';
  const next = [...slots, t].map(asSkill);
  if (sanitizeSkills(next).length === next.length) return null;
  return isEffect(asSkill(t)) ? (slots.some((s) => s.kind === t.kind) ? 'One of each effect' : `Max ${SKILL_FX_MAX} effect skills`) : 'Stat cap: +2 per stat, +3 total';
}

export function Customize({ id }: { id?: string }) {
  const api = useMonsters();
  const me = useWallet().signedAccountId ?? '';
  const [mons, reloadMons] = useLoad(() => api.mine(), [me]);
  const [inv, reloadInv] = useLoad(() => Promise.all([api.skillTypes(), api.skills()]), [me]);
  const [pick, setPick] = useState(id);
  const m = mons?.find((x) => x.id === pick) ?? mons?.find((x) => x.owner === me) ?? mons?.[0];
  const [edit, setEdit] = useState<{ mon: string; ids: number[] } | null>(null);
  const act = useAct(() => { setEdit(null); reloadMons(); reloadInv(); });
  if (!mons || !inv) return <p>Loading your skills…</p>;
  const [types, owned] = inv;
  const ids = edit && edit.mon === m?.id ? edit.ids : m?.skillIds ?? [];
  const slots = ids.map((i) => types.find((t) => t.id === i)).filter((t): t is SkillType => !!t);
  const free = (t: SkillType) => (owned.find((o) => o.id === t.id)?.free ?? 0) + (m?.skillIds.includes(t.id) ? 1 : 0);
  const shelf = types.filter((t) => free(t) > 0);
  const why = m && frozen(m, me);
  const changed = !!m && ids.join() !== m.skillIds.join();
  const preview = m && applySkills(statsOf(m.dna), slots.map(asSkill));
  const set = (next: number[]) => m && setEdit({ mon: m.id, ids: next });
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1 className="row-ico"><Ico n="/skills/Power.svg" className="ico h" />Customize</h1><p className="sub">Equip up to 3 skills. Stat skills add at most +2 to one stat and +3 in total; up to 2 effect skills.</p></div>
        <a className="btn alt" href={MARKET_URL} target="_blank" rel="noopener"><span><Ico n="coin-stack" />Get skills</span></a>
      </div>
      {!m ? <section className="slab"><h3>No on-chain monsters yet</h3><p className="sub">Claim your starters in <a href="/collection">Monsters</a> first.</p></section> : (
        <div className="custom"><div className="play-body">
          <aside className="play-mon" aria-label="Monster">
            <Portrait dna={m.dna} size={150} />
            <b>{m.name}</b>
            <span className="tile-meta">{archetype(m.dna)}</span>
            <div className="roster">
              <p className="roster-title">Your monsters</p>
              <div className="roster-grid">
                {mons.map((x) => (
                  <button key={x.id} type="button" className="roster-pick" aria-pressed={x.id === m.id} title={x.name} onClick={() => setPick(x.id)}>
                    <Portrait dna={x.dna} size={56} />
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
            <section className="slab" style={{ display: 'grid', gap: 14 }} aria-label="Loadout">
              <h2 className="row-ico"><Ico n="icon-play" />Loadout</h2>
              <div className="slots">
                {Array.from({ length: SKILL_SLOTS }, (_, i) => {
                  const t = slots[i];
                  return t ? (
                    <button key={i} type="button" className={`skill-slot ${t.rarity}`} disabled={!!why} title="Remove" onClick={() => set(ids.filter((x) => x !== t.id))}>
                      <img src={`/skills/${t.kind}.svg`} alt="" /><b>{t.name}</b><small>{skillLabel(t)}</small>
                    </button>
                  ) : <div key={i} className="skill-slot empty"><span>Empty slot</span></div>;
                })}
              </div>
              <Stats dna={m.dna} boosted={preview!} />
              {slots.some((t) => isEffect(t)) && (
                <ul className="fx-list">{slots.filter((t) => isEffect(t)).map((t) => <li key={t.id} className="row-ico"><Ico n={`/skills/${t.kind}.svg`} /><b>{skillLabel(t)}</b> {SKILL_TEXT[t.kind]}</li>)}</ul>
              )}
              <div className="row">
                <button className="btn" disabled={act.busy || !!why || !changed} onClick={() => act.run(() => api.equip(m.id, ids), 'Skills equipped.')}><span><Ico n="icon-check" />Save loadout</span></button>
                {changed && <button className="btn ghost" disabled={act.busy} onClick={() => setEdit(null)}><span><Ico n="icon-refresh" />Reset</span></button>}
                <button className="btn ghost" onClick={() => practice({ ...m, skills: slots.map(asSkill) })}><span><Ico n="ko" />Try in practice</span></button>
              </div>
              {(why || act.msg) && <p className="note" role="status">{act.msg || why}</p>}
            </section>
            <section className="slab" style={{ display: 'grid', gap: 14 }} aria-label="Your skills">
              <h2 className="row-ico"><Ico n="coin-stack" />Your skills</h2>
              {!shelf.length ? <p className="sub">No skills yet. <a href={MARKET_URL} target="_blank" rel="noopener">Get some in the market</a>.</p> : (
                <div className="inv">
                  {shelf.map((t) => {
                    const left = free(t) - (ids.includes(t.id) ? 1 : 0), no = why ?? blocked(slots, t, left);
                    return (
                      <button key={t.id} type="button" className={`skill-card ${t.rarity}`} disabled={!!no} title={no ?? 'Equip'} onClick={() => set([...ids, t.id])}>
                        <img src={`/skills/${t.kind}.svg`} alt="" />
                        <b>{t.name}</b>
                        <small>{isEffect(t) ? SKILL_TEXT[t.kind] : skillLabel(t)}</small>
                        <span className="row" style={{ gap: 6, justifyContent: 'center' }}><span className={`chip rar ${t.rarity}`}>{t.rarity}</span><span className="chip">{left} free</span></span>
                        {no && no !== why && <small className="note">{no}</small>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div></div>
      )}
    </>
  );
}
