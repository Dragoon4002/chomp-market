import { useRef, useState } from 'react';
import { archetype, type Monster } from '@/lib/genes.ts';
import { usePlayable } from '@/hooks/useMons.ts';
import { RoomList } from '@/components/rooms/Lobby.tsx';
import { CreateRoom, JoinByCode } from '@/components/rooms/OnlineStart.tsx';
import { Ico, Portrait, SkillChips } from '@/components/ui.tsx';
import { practice } from '@/components/Arena.tsx';

function Fighter({ mon, groups, onPick }: { mon: Monster; groups: [string, Monster[]][]; onPick: (id: string) => void }) {
  return (
    <aside className="play-mon" aria-label="Your monster">
      <Portrait dna={mon.dna} size={150} />
      <b>{mon.name}</b>
      <span className="tile-meta">{archetype(mon.dna)}</span>
      {'owner' in mon && (
        <div className="play-skills">
          <SkillChips skills={mon.skills} />
          <a className="link row-ico" href={`/customize/${mon.id}`}><Ico n="/skills/Power.svg" />{mon.skills?.length ? 'Customize' : 'Equip skills'}</a>
        </div>
      )}
      <button type="button" className="btn ghost" onClick={() => practice(mon)}><span><Ico n="ko" />Practice vs bot</span></button>
      {groups.map(([title, list]) => list.length > 0 && (
        <div key={title} className="roster">
          <p className="roster-title">{title}</p>
          <div className="roster-grid">
            {list.map((m) => (
              <button key={m.id} type="button" className="roster-pick" aria-pressed={m.id === mon.id} title={`${m.name} · ${archetype(m.dna)}`} onClick={() => onPick(m.id)}>
                <Portrait dna={m.dna} size={56} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}

const TABS = [['create', 'Create', 'icon-room-public'], ['join', 'Join', 'icon-lobby']] as const;
type Tab = (typeof TABS)[number][0];

export function Play({ initial = 'create', invite }: { initial?: Tab; invite?: string }) {
  const { free, local, all } = usePlayable();
  const groups: [string, Monster[]][] = [['On-chain · stakeable', free], ['Browser · casual only', local]];
  const [p1, setP1] = useState('');
  const [tab, setTab] = useState<Tab>(initial);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const a = all.find((m) => m.id === p1) ?? all[0];
  const onKey = (e: React.KeyboardEvent) => { // tablist pattern: arrows/Home/End move focus and select
    const i = TABS.findIndex(([id]) => id === tab), n = TABS.length;
    const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); setTab(TABS[j][0]); tabs.current[j]?.focus();
  };
  return (
    <>
      <div><h1 className="row-ico"><Ico n="icon-play" className="ico h" />Fight</h1><p className="sub">Host a room or join one. You can swap monster and arena in the room before the fight.</p></div>
      <div className="tabs" role="tablist" aria-label="Play mode" onKeyDown={onKey}>
        {TABS.map(([id, label, icon], i) => (
          <button key={id} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`}
            aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className="tab" onClick={() => setTab(id)}>
            <Ico n={icon} />{label}
          </button>
        ))}
      </div>
      <section className="slab tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {!a ? <p className="note">No monsters available.</p> : (
          <div className="play-body">
            <Fighter mon={a} groups={groups} onPick={setP1} />
            {tab === 'create' ? <CreateRoom mon={a} /> : (
              <div className="play-join">
                <h3 className="row-ico"><Ico n="icon-room-private" />Have a code?</h3>
                <JoinByCode mon={a} invite={invite} />
                <p className="note">Staked rooms ask your wallet to match the host's stake before you enter.</p>
                <RoomList mon={a} />
              </div>
            )}
          </div>
        )}
      </section>
      <p className="play-keys">WASD move · Space/W jump · J light · K heavy · L block · C dodge · mouse: right light, left heavy</p>
    </>
  );
}
