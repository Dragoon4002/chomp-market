"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { EFFECT_KINDS, KIND_DESC, KIND_LABEL, KINDS, RARITIES, toYocto, useAssets, type Kind, type Rarity } from "@/lib/assets";
import { act, Btn, Empty, Field, inputCls, Loading, Panel, SkillArt, useLoad } from "@/components/ui";

const Step = ({ n, title, sub, children }: { n: number; title: string; sub: string; children: ReactNode }) => (
  <Panel className="p-5 sm:p-6">
    <div className="mb-5 flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border-3 border-ink bg-gold font-display text-xl text-ink shadow-drop-sm">{n}</span>
      <div><h2 className="text-2xl">{title}</h2><p className="text-sm font-bold text-muted">{sub}</p></div>
    </div>
    {children}
  </Panel>
);
const form = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; };
const ms = (v: string) => (v ? new Date(v).getTime() : null);
const opt = (v: string) => (v.trim() ? Number(v) : null);

export default function Create() {
  const a = useAssets();
  const [d, reload] = useLoad(async () => {
    const [creator, cols, skills] = await Promise.all([a.isCreator(), a.collections(), a.skills()]);
    return { creator, cols: cols.filter((c) => c.creator === a.account), skills: skills.filter((s) => s.creator === a.account) };
  }, [a.account]);
  const [kind, setKind] = useState<Kind>("Power");
  const [rarity, setRarity] = useState<Rarity>("Common");
  const effect = (EFFECT_KINDS as readonly string[]).includes(kind);

  if (!a.account) return <Empty>Connect a wallet to create skills.</Empty>;
  if (!d) return <Loading />;
  if (!d.creator) return <Empty>Creating is invite-only for now. Ask the Brawler team to approve <b>{a.account}</b> as a creator.</Empty>;

  return (
    <>
      <h1 className="text-5xl drop-shadow-[0_4px_0_var(--color-ink)]">Creator studio</h1>
      <p className="mb-8 mt-2 font-bold text-muted">Make a collection, add skills to it, then open a presale.</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <Step n={1} title="Collection" sub="A themed set of skills">
          <form className="flex flex-col gap-4" onSubmit={(e) => { const f = form(e); act(() => a.createCollection({ name: f.name, description: f.description, media: f.media }), `Created ${f.name}.`, reload); }}>
            <Field label="Name"><input name="name" required maxLength={40} className={inputCls} placeholder="Ember Forge" /></Field>
            <Field label="Description"><textarea name="description" rows={3} maxLength={200} className={inputCls + " h-auto py-2"} placeholder="Hot-blooded techniques…" /></Field>
            <Field label="Image URL"><input name="media" type="url" className={inputCls} placeholder="https://…" /></Field>
            <Btn>Create collection</Btn>
          </form>
        </Step>

        <Step n={2} title="Skill" sub="A tradable skill type">
          {!d.cols.length ? <Empty>Create a collection first.</Empty> : (
            <form className="flex flex-col gap-4" onSubmit={(e) => {
              const f = form(e);
              act(() => a.createSkill({ collection: Number(f.collection), name: f.name, kind, mag: effect ? 1 : Number(f.mag), rarity, max_supply: opt(f.max_supply), royalty_bps: Math.round(Number(f.royalty) * 100), media: f.media ?? "" }), `Created ${f.name}.`, reload);
            }}>
              <div className="flex items-center gap-3 rounded-2xl bg-sky-0/60 p-3">
                <SkillArt kind={kind} rarity={rarity} size={52} />
                <p className="text-sm font-bold text-muted">{KIND_DESC[kind]}</p>
              </div>
              <Field label="Collection"><select name="collection" className={inputCls}>{d.cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Name"><input name="name" required maxLength={32} className={inputCls} placeholder="Ember Fang" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kind"><select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputCls}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
                <Field label="Rarity"><select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity)} className={inputCls}>{RARITIES.map((r) => <option key={r}>{r}</option>)}</select></Field>
                <Field label="Strength"><select name="mag" disabled={effect} className={inputCls}><option value="1">+1</option><option value="2">+2</option></select></Field>
                <Field label="Royalty %"><input name="royalty" type="number" min="0" max="10" step="0.5" defaultValue="5" className={inputCls} /></Field>
              </div>
              <Field label="Max supply (blank = unlimited)"><input name="max_supply" type="number" min="1" className={inputCls} placeholder="200" /></Field>
              <Btn>Create skill</Btn>
            </form>
          )}
        </Step>

        <Step n={3} title="Presale" sub="Sell fresh mints">
          {!d.skills.length ? <Empty>Create a skill first.</Empty> : (
            <form className="flex flex-col gap-4" onSubmit={(e) => {
              const f = form(e);
              const allow = f.allowlist.split(/[\s,]+/).filter(Boolean);
              act(() => a.createPresale({ skill: Number(f.skill), price: toYocto(f.price), start_ms: ms(f.start) ?? Date.now(), end_ms: ms(f.end), cap_total: opt(f.cap), per_wallet: opt(f.per_wallet), allowlist: allow.length ? allow : null }), "Presale created.", reload);
            }}>
              <Field label="Skill"><select name="skill" className={inputCls}>{d.skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (SOL)"><input name="price" type="number" min="0.001" step="0.001" required className={inputCls} placeholder="0.5" /></Field>
                <Field label="Per wallet"><input name="per_wallet" type="number" min="1" className={inputCls} placeholder="2" /></Field>
                <Field label="Starts"><input name="start" type="datetime-local" className={inputCls} /></Field>
                <Field label="Ends"><input name="end" type="datetime-local" className={inputCls} /></Field>
              </div>
              <Field label="Total cap"><input name="cap" type="number" min="1" className={inputCls} placeholder="200" /></Field>
              <Field label="Allowlist (accounts, optional)"><textarea name="allowlist" rows={2} className={inputCls + " h-auto py-2"} placeholder="alice.testnet, bob.testnet" /></Field>
              <Btn>Open presale</Btn>
            </form>
          )}
        </Step>
      </div>
    </>
  );
}
