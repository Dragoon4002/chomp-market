// Pet Den UI: DOM render + actions + chomp-sdk wiring. Sim rules live in sim.js, den features in features.js.
import { lookOf, rng, isSick, valueOf, scoreOf, NEED, TIERS, HABITATS, level, influence, ready, LEVEL_XP } from './sim.js?v=2';
import { createChain, MAX_PETS } from './chain.js?v=2';
import * as F from './features.js?v=2';

const $ = (id) => document.getElementById(id);
const chomp = (f, ...a) => { try { window.Chomp?.[f](...a); } catch (e) { console.warn(e); } };
const hash = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const now = () => Date.now(); // the only clock: chain.js maps it to whole ticks
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const ERR = { Dead: 'Your pet ran away…', Asleep: 'Shh, it is sleeping.', Tired: 'Too tired. Let it sleep.', NotReady: 'Not ready to evolve yet: raise readiness to 100%.', MaxTier: 'Already an Elder.', Sick: 'Too sick to evolve. Care for it first.', Cooldown: 'It needs a moment. Try again soon.', RosterFull: 'Roster full (8).' };

let chain = null, session = null, started = false, plays = 0, busy = false, view = 'habitat', toastT = 0, unread = 0;
const st = () => chain.st;
const cur = () => st().pets[st().sel];
const art = (p, part = 'body-') => `art/${part}${lookOf(p.dna).species}.png`;
const tint = (p) => `hue-rotate(${lookOf(p.dna).hue}deg)`;

function toast(t) {
  if (!t) return;
  const el = $('toast'); el.textContent = t; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600);
  st().log.unshift(t); st().log.length = Math.min(st().log.length, 30); unread++;
}

function moodOf(p) {
  const s = p.stats;
  if (!s.alive) return ['💨', 'Gone', 'Ran away… release it to free the slot.', '💨'];
  if (p.job) return ['💼', 'Working', `Out on a job. Back in ${p.job.end - st().t} ticks.`, '💼'];
  if (s.asleep) return ['😴', 'Sleeping', 'Zzz… recharging energy.', 'Zzz'];
  if (isSick(s)) return ['🤢', 'Sick', 'Feeling awful. Needs care now!', '🤢'];
  if (s.full < 35) return ['😋', 'Hungry', 'Tummy rumbling… feed me!', '🍖?'];
  if (s.energy < 35) return ['🥱', 'Tired', 'Getting sleepy…', '🥱'];
  if (s.hygiene < 35) return ['🫧', 'Grubby', 'Could really use a bath.', '🫧'];
  if (s.joy < 35) return ['😞', 'Bored', 'Wants some attention.', '🎾?'];
  if (s.joy >= 70 && s.energy >= 50) return ['😄', 'Happy', 'Feeling energetic! Wants to play!', '❤️'];
  return ['🙂', 'Content', 'Doing fine. Keep it up.', '🙂'];
}

const bar = (v) => `<span class="bar"><i class="${v < 20 ? 'low' : v < 50 ? 'mid' : ''}" style="width:${v}%"></i></span>`;

function render() {
  if (!chain) return;
  const S = st(), p = cur();
  $('coins').textContent = S.coins.toLocaleString(); $('gems').textContent = S.gems.toLocaleString();
  $('belldot').classList.toggle('on', unread > 0);
  $('count').textContent = `🐾 ${S.pets.length + S.eggs.length} / ${MAX_PETS} Pets`;
  // rail
  $('rail').innerHTML = S.pets.map((q, i) => {
    const s = q.stats, need = s.alive && (isSick(s) || Math.min(s.full, s.joy, s.energy, s.hygiene) < 35);
    return `<button class="slot ${i === S.sel ? 'on' : ''} ${s.alive ? '' : 'dead'}" data-sel="${i}" title="${esc(F.name(q))}"><img src="${art(q, '')}" style="filter:${tint(q)}" alt=""><i class="${q.job ? 'busy' : need || !s.alive ? 'bad' : ''}"></i></button>`;
  }).join('') + S.eggs.map((_, i) => `<button class="slot" data-hatch="${i}" title="Hatch egg"><span class="egg"></span></button>`).join('')
    + (S.pets.length + S.eggs.length < MAX_PETS ? `<button class="slot add" id="addegg" title="Buy an egg (${F.EGG_COINS} coins)">+</button>` : '');
  if (!p) return;
  const s = p.stats, look = lookOf(p.dna), sick = isSick(s), lv = level(s), rd = ready(s);
  if (!$('name').querySelector('input')) $('name').textContent = F.name(p);
  $('kin').textContent = `🌙 ${look.kin}`;
  $('rarity').textContent = look.rarity; $('rarity').className = `pill rar ${look.rarity}`;
  $('lv').textContent = `Lv. ${lv}`; $('xp').textContent = `XP ${s.xp} / ${lv * LEVEL_XP}`; $('xpbar').style.width = `${(s.xp % LEVEL_XP) * 10}%`;
  $('core').innerHTML = [['🍴', 'Hunger', s.full], ['😊', 'Happiness', s.joy], ['⚡', 'Energy', s.energy], ['🫧', 'Hygiene', s.hygiene], ['❤️', 'Health', s.health]]
    .map(([ic, k, v]) => `<div class="row"><span class="ic">${ic}</span><span>${k}</span>${bar(v)}<span class="num">${v}/100</span></div>`).join('');
  $('growth').innerHTML = [['🧠', 'Intelligence', `<b>${s.int}</b>`], ['💪', 'Strength', `<b>${s.str}</b>`], ['⭐', 'Personality', `<span class="pill rar">${look.personality}</span>`], ['⏳', 'Age', `${s.age} ticks (${TIERS[s.tier]})`], ['🔥', 'Care streak', `${s.streak} (best ${s.best_streak}) · ×${valueOf(s)}`]]
    .map(([ic, k, v]) => `<div class="row grow"><span class="ic">${ic}</span><span>${k}</span><span>${v}</span></div>`).join('');
  // evolution track: the egg is always behind us
  $('track').innerHTML = ['🥚 Egg', '🐣 Baby', '🦎 Junior', '🐉 Adult', '👑 Elder'].map((t, i) => {
    const [ic, lbl] = t.split(' '), cls = i - 1 < s.tier ? 'done' : i - 1 === s.tier ? 'on' : '';
    return `${i ? '<hr>' : ''}<div class="step ${cls}"><span>${ic}</span>${lbl}</div>`;
  }).join('');
  // pet
  const img = $('pet'), src = art(p);
  if (img.getAttribute('src') !== src) img.src = src;
  img.style.height = `${66 + s.tier * 11}%`;
  img.style.filter = tint(p) + (sick ? ' sepia(.5) hue-rotate(60deg)' : '') + ' drop-shadow(0 0 18px #a855f788)';
  $('pen').className = `pen ${!s.alive ? 'dead' : p.job ? 'busy' : s.asleep ? 'asleep' : sick ? 'sick' : ''}`;
  const [me, ml, line, bub] = moodOf(p);
  $('bubble').textContent = bub; $('memoji').textContent = me; $('mlabel').textContent = ml; $('mline').textContent = line;
  $('portrait').src = art(p, ''); $('portrait').style.filter = tint(p);
  // evolution card
  $('inf').innerHTML = influence(s).map(([k, v]) => `<span>✦ ${k}</span><b>+${v}%</b>`).join('');
  $('gauge').style.setProperty('--p', rd); $('ready').textContent = `${rd}%`;
  const h = HABITATS[s.habitat];
  $('hname').textContent = h.name; $('hthumb').className = `thumb h${s.habitat}`; $('scene').className = `scene h${s.habitat}`;
  $('htags').innerHTML = h.tags.map((t) => `<span class="pill">${t}</span>`).join('');
  // dock
  const off = !s.alive || !!p.job;
  document.querySelectorAll('[data-act]').forEach((b) => {
    const k = b.dataset.act;
    b.disabled = off || (s.asleep && k !== 'sleep');
    b.querySelector('.dot').classList.toggle('on', !b.disabled && ((k === 'feed' && s.full < 50) || (k === 'clean' && s.hygiene < 50) || (k === 'sleep' && s.energy < 30) || (k === 'play' && s.joy < 50) || (k === 'interact' && s.age >= s.calm_until && s.joy < 70)));
    const em = b.querySelector('em'), item = { feed: 'treat', play: 'toy', clean: 'soap' }[k];
    if (em) { em.hidden = !S.inv[item]; em.textContent = `×${S.inv[item]}`; }
  });
  $('sleeplbl').textContent = s.asleep ? 'Wake' : 'Sleep';
  // evolve
  const ev = $('evolve'), max = s.tier >= NEED.length;
  ev.className = `evolve ${!s.alive ? 'release' : rd < 100 || max || sick ? 'wait' : ''}`;
  $('evlbl').textContent = !s.alive ? 'Release' : max ? 'Elder' : 'Evolve';
  $('evsub').textContent = !s.alive ? 'Free the roster slot' : max ? 'Max tier reached' : rd < 100 ? `Readiness ${rd}% · commit to chain` : `→ ${TIERS[s.tier + 1]} · Commit to Chain ↗`;
  // menu dots
  const dot = (tab, on) => document.querySelector(`.mbtn[data-tab=${tab}] .dot`).classList.toggle('on', on);
  dot('quests', F.quests(S).some((q) => !q.claimed && q.prog >= q.need));
  dot('ach', F.achs(S).some((a) => a.done && !a.claimed));
  dot('shop', !S.inv.treat && S.coins >= 20);
  dot('inv', S.eggs.length > 0);
  dot('games', s.alive && !s.asleep && s.energy >= 10 && s.joy < 50);
  if (view !== 'habitat') sheet();
}

// ---- sheets: one overlay, content per tab ----
const TITLES = { pets: '🐾 My Pets', breed: '🧬 Breeding', city: '🏙️ City · Jobs Board', board: '🏆 Leaderboard', inv: '🎒 Inventory', shop: '🏪 Shop', quests: '📜 Quests', games: '🕹️ Mini Games', ach: '🏅 Achievements' };
const petImg = (q) => `<img src="${art(q)}" style="filter:${tint(q)}" alt="">`;
const reward = (x) => [x.coins && `🪙 ${x.coins}`, x.gems && `💎 ${x.gems}`].filter(Boolean).join(' ');
let pickA = null, pickB = null;

function sheet() {
  const S = st(), p = cur(), b = $('sbody');
  $('stitle').textContent = TITLES[view];
  const keep = b.scrollTop;
  if (view === 'pets') {
    b.innerHTML = `<div class="grid">${S.pets.map((q, i) => {
      const s = q.stats;
      return `<div class="item ${i === S.sel ? 'sel' : ''}">${petImg(q)}<div><b>${esc(F.name(q))}</b><p>${lookOf(q.dna).kin} · ${s.alive ? TIERS[s.tier] : 'ran away'} · Lv. ${level(s)}</p><p>value ×${valueOf(s)}${q.job ? ' · 💼 working' : ''}</p></div>${s.alive ? `<button class="btn" data-sel="${i}">${i === S.sel ? 'Selected' : 'Select'}</button>` : `<button class="btn" data-release="${i}">Release</button>`}</div>`;
    }).join('')}${S.eggs.map((_, i) => `<div class="item"><span class="big"><span class="egg" style="display:inline-block"></span></span><div><b>Egg</b><p>Ready to hatch</p></div><button class="btn gold" data-hatch="${i}">Hatch</button></div>`).join('')}</div>`;
  } else if (view === 'breed') {
    const ok = S.pets.map((q, i) => [q, i]).filter(([q]) => F.canBreed(S, q));
    if (!ok.some(([, i]) => i === pickA)) pickA = ok[0]?.[1] ?? null;
    if (!ok.some(([, i]) => i === pickB) || pickB === pickA) pickB = ok.find(([, i]) => i !== pickA)?.[1] ?? null;
    b.innerHTML = `<p class="note">Pick two Adult+ pets. The egg mixes their DNA (species, hue, strength and intelligence genes; 20% mutation). Cost ${F.BREED_COST} 🪙, then each parent rests ${F.BREED_CD} ticks.</p>`
      + (ok.length < 2 ? `<p>You need two Adult+ pets that are free and rested. Eligible now: ${ok.length}.</p>` : `<div class="grid">${ok.map(([q, i]) => `<div class="item ${i === pickA || i === pickB ? 'sel' : ''}">${petImg(q)}<div><b>${esc(F.name(q))}</b><p>${TIERS[q.stats.tier]} · str ${q.stats.str} · int ${q.stats.int}</p></div><button class="btn" data-pick="${i}">${i === pickA ? 'Parent A' : i === pickB ? 'Parent B' : 'Pick'}</button></div>`).join('')}</div><p><button class="btn gold" id="dobreed">💞 Breed (${F.BREED_COST} 🪙)</button></p>`)
      + `<p class="note">Resting: ${S.pets.filter((q) => q.stats.tier >= 2 && S.t < q.breedAt).map((q) => `${esc(F.name(q))} (${q.breedAt - S.t} ticks)`).join(', ') || 'none'}</p>`;
  } else if (view === 'city') {
    const s = p.stats;
    b.innerHTML = `<p class="note">Send <b>${esc(F.name(p))}</b> (str ${s.str}, int ${s.int}) to work. It's busy for the whole job and its needs keep dropping, so feed it first. Pay lands on return.</p><div class="grid">${F.JOBS.map((j, i) => {
      const gate = (j.int && s.int < j.int) || (j.str && s.str < j.str);
      return `<div class="item"><span class="big">${j.icon}</span><div><b>${j.name}</b><p>${j.ticks} ticks · 🪙 ${j.pay}${j.int ? ` · needs int ${j.int}` : ''}${j.str ? ` · needs str ${j.str}` : ''}</p></div><button class="btn" data-job="${i}" ${gate || p.job || !s.alive || s.asleep ? 'disabled' : ''}>Send</button></div>`;
    }).join('')}</div><h3 style="margin-top:14px">On the job</h3><p class="note">${S.pets.filter((q) => q.job).map((q) => `${esc(F.name(q))}: ${F.JOBS[q.job.j].name}, back in ${q.job.end - S.t} ticks`).join('<br>') || 'Nobody yet.'}</p><p class="note">Earned in the City so far: 🪙 ${S.n.earned}</p>`;
  } else if (view === 'board') {
    b.innerHTML = `<table><tr><th>#</th><th>Pet</th><th>Owner</th><th>Lv</th><th>Value</th></tr>${F.leaderboard(S).map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td><img src="art/${lookOf(r.dna).species}.png" style="filter:hue-rotate(${lookOf(r.dna).hue}deg)" alt=""> ${esc(r.name)}</td><td>${r.owner}</td><td>${r.lv}</td><td>×${r.value}</td></tr>`).join('')}</table>`;
  } else if (view === 'inv') {
    b.innerHTML = `<p class="note">Items are used automatically: Feed eats a treat, Play brings a toy, Clean uses soap.</p><div class="grid">${F.SHOP.filter((x) => x.id !== 'egg').map((x) => `<div class="item"><span class="big">${x.icon}</span><div><b>${x.name} ×${S.inv[x.id] || 0}</b><p>${x.info}</p></div></div>`).join('')}<div class="item"><span class="big">🥚</span><div><b>Eggs ×${S.eggs.length}</b><p>Hatch them from the roster rail.</p></div></div></div>`;
  } else if (view === 'shop') {
    b.innerHTML = `<p class="note">Coins come from City jobs, quests and achievements. Gems are premium rewards. No real money.</p><div class="grid">${F.SHOP.map((x) => `<div class="item"><span class="big">${x.icon}</span><div><b>${x.name}</b><p>${x.info}</p></div><button class="btn ${x.gems ? '' : 'gold'}" data-buy="${x.id}">${x.gems ? '💎' : '🪙'} ${x.price}</button></div>`).join('')}</div>`;
  } else if (view === 'quests') {
    b.innerHTML = `<div class="grid">${F.quests(S).map((q) => `<div class="item"><span class="big">📜</span><div><b>${q.label}</b><p>${q.prog}/${q.need} · ${reward(q)}</p><div class="prog"><i style="width:${(100 * q.prog) / q.need}%"></i></div></div><button class="btn gold" data-quest="${q.i}" ${q.claimed || q.prog < q.need ? 'disabled' : ''}>${q.claimed ? 'Done' : 'Claim'}</button></div>`).join('')}</div><p class="note">Claim all three to roll a new set.</p>`;
  } else if (view === 'games') {
    b.innerHTML = `<p class="note">Each game uses ${esc(F.name(p))}'s Play: −10 energy, score 0-10 → joy, intelligence and xp. 6+ counts as a win.</p><div class="grid"><div class="item"><span class="big">🍬</span><div><b>Candy Tap</b><p>Tap the candy 10× in 5 s.</p></div><button class="btn gold" data-game="candy">Play</button></div><div class="item"><span class="big">⚡</span><div><b>Reaction Rush</b><p>5 rounds: tap the moment it turns green.</p></div><button class="btn gold" data-game="react">Play</button></div></div>`;
  } else if (view === 'ach') {
    b.innerHTML = `<div class="grid">${F.achs(S).map((a) => `<div class="item"><span class="big">${a.icon}</span><div><b>${a.label}</b><p>${reward(a)}</p></div><button class="btn gold" data-ach="${a.id}" ${!a.done || a.claimed ? 'disabled' : ''}>${a.claimed ? 'Claimed' : a.done ? 'Claim' : 'Locked'}</button></div>`).join('')}</div>`;
  }
  b.scrollTop = keep;
}

function open(tab) {
  view = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  $('sheet').classList.toggle('on', tab !== 'habitat');
  render();
}

// ---- actions ----
async function run(f) {
  if (busy) return; busy = true;
  try {
    if (!started) { started = true; chomp('start'); }
    const alive = st().pets.map((q) => q.stats.alive);
    toast(await f());
    st().pets.forEach((q, i) => { if (alive[i] && !q.stats.alive) finish(q, 'ranaway'); });
    chain.save();
  } catch (e) { toast(ERR[e.message] || e.message); }
  busy = false; render();
}

function finish(p, reason) {
  const s = p.stats;
  chomp('result', { winner: s.alive ? 'you' : 'none', score: scoreOf(s), tier: s.tier, reason });
  started = false;
}

const ITEM = { feed: 'treat', play: 'toy', clean: 'soap' };
async function care(kind, score = 0) {
  const S = st(), p = cur();
  if (p.job) throw new Error('Busy at work in the City.');
  const item = ITEM[kind], boost = item && S.inv[item] > 0 ? 1 : 0;
  await chain.care(S.sel, kind, score, boost, now());
  if (boost) S.inv[item]--;
  if (S.n[kind] !== undefined) S.n[kind]++;
  return boost ? `Used a ${F.SHOP.find((x) => x.id === item).name}!` : '';
}

async function playGame(kind) {
  const p = cur(), s = p.stats;
  if (p.job) throw new Error('Busy at work in the City.');
  if (!s.alive) throw new Error('Dead');
  if (s.asleep) throw new Error('Asleep');
  if (s.energy < 10) throw new Error('Tired');
  const score = await (kind === 'react' ? reactGame() : candyGame());
  const extra = await care('play', score);
  st().n.games++; if (score >= 6) st().n.win++;
  return `Scored ${score}/10 → +${score} xp, +int. ${extra}`;
}

// Tap the candy: 5 s, max 10. Positions from the session seed.
function candyGame() {
  return new Promise((done) => {
    const r = rng(session.seedU ^ Math.imul(++plays, 0x9e3779b9)), ball = $('ball');
    let hits = 0;
    const move = () => { ball.style.left = `${10 + r() * 80}%`; ball.style.top = `${20 + r() * 65}%`; };
    const end = performance.now() + 5000;
    ball.hidden = false; $('game').className = 'on'; move();
    ball.onpointerdown = (e) => { e.preventDefault(); if (++hits >= 10) stop(); else move(); };
    const t = setInterval(() => { const left = Math.ceil((end - performance.now()) / 1000); $('ghud').textContent = `Tap the candy! ${hits}/10 · ${left}s`; if (left <= 0) stop(); }, 100);
    function stop() { clearInterval(t); ball.onpointerdown = null; ball.hidden = true; $('game').className = ''; done(hits); }
  });
}

// Reaction Rush: 5 rounds, seeded delays. <350 ms = 2 pts, <600 ms = 1, early tap = 0.
function reactGame() {
  return new Promise((done) => {
    const r = rng(session.seedU ^ Math.imul(++plays, 0x9e3779b9)), pad = $('react');
    let round = 0, pts = 0, goAt = 0, t = 0;
    $('game').className = 'on'; $('ball').hidden = true;
    const next = () => {
      if (round++ >= 5) { pad.className = ''; $('game').className = ''; pad.onpointerdown = null; return done(Math.min(10, pts)); }
      pad.className = 'wait'; pad.textContent = 'Wait for green…'; goAt = 0;
      $('ghud').textContent = `Reaction Rush · round ${round}/5 · ${pts} pts`;
      t = setTimeout(() => { pad.className = 'go'; pad.textContent = 'TAP!'; goAt = performance.now(); }, 700 + r() * 1500);
    };
    pad.onpointerdown = (e) => {
      e.preventDefault(); clearTimeout(t);
      const ms = goAt ? performance.now() - goAt : Infinity;
      pts += ms < 350 ? 2 : ms < 600 ? 1 : 0;
      next();
    };
    next();
  });
}

async function hatch(i) {
  const S = st(), [dna] = S.eggs.splice(i, 1);
  await chain.createPet(dna); await chain.delegate(S.pets.length - 1);
  S.sel = S.pets.length - 1; S.n.hatch++;
  return `${F.name(cur())} hatched!`;
}

// ---- events (one delegated listener) ----
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset, S = chain && st(); if (!S) return;
  if (d.tab) return open(view === d.tab && d.tab !== 'habitat' ? 'habitat' : d.tab);
  if (d.sel) { S.sel = +d.sel; chain.save(); return render(); }
  if (d.act) {
    if (d.act === 'play') return run(() => playGame('candy'));
    return run(() => care(d.act));
  }
  if (d.hatch) return run(() => hatch(+d.hatch));
  if (d.release) return run(() => release(+d.release));
  if (d.pick) { const i = +d.pick; if (i === pickA) pickA = null; else if (i === pickB) pickB = null; else if (pickA === null) pickA = i; else pickB = i; return render(); }
  if (d.job) return run(() => F.startJob(S, S.sel, +d.job));
  if (d.buy) return run(() => F.buy(S, d.buy));
  if (d.quest) return run(() => F.claimQuest(S, +d.quest));
  if (d.ach) return run(() => F.claimAch(S, d.ach));
  if (d.game) return run(() => playGame(d.game));
  if (t.id === 'addegg') return run(() => F.buyEgg(S));
  if (t.id === 'dobreed') return run(() => F.breedPets(S, pickA, pickB));
  if (t.id === 'sclose') return open('habitat');
  if (t.id === 'hgear') return run(async () => { await chain.care(S.sel, 'habitat', (cur().stats.habitat + 1) % HABITATS.length, 0, now()); return `Moved to ${HABITATS[cur().stats.habitat].name}.`; });
  if (t.id === 'evolve') return run(evolveOrRelease);
  if (t.id === 'rename') return rename();
  if (t.id === 'bell') { unread = 0; $('logbox').innerHTML = S.log.map((l) => `<div>${esc(l)}</div>`).join('') || '<div>No news yet.</div>'; $('logbox').classList.toggle('on'); return render(); }
});

async function release(i) {
  const S = st();
  S.pets.splice(i, 1); S.sel = Math.min(S.sel, Math.max(0, S.pets.length - 1));
  if (!S.pets.length && !S.eggs.length) F.addEgg(S, F.eggDna(S));
  if (!S.pets.length) await hatch(0);
  return 'Released. The slot is free again.';
}

async function evolveOrRelease() {
  const S = st(), p = cur();
  if (!p.stats.alive) return release(S.sel);
  if (p.job) throw new Error('Busy at work in the City.');
  await chain.evolve(S.sel, now());
  S.n.evolve++;
  finish(p, 'evolve');
  await chain.delegate(S.sel); // back into the PER to keep caring
  return `Evolved into ${TIERS[p.stats.tier]}! Tier committed to base.`;
}

function rename() {
  const box = $('name'), p = cur();
  if (box.querySelector('input')) return;
  box.innerHTML = `<input maxlength="14" value="${esc(F.name(p))}" aria-label="Pet name">`;
  const inp = box.querySelector('input'); inp.focus(); inp.select();
  const done = () => { const v = inp.value.trim().slice(0, 14); if (v) p.name = v; box.textContent = F.name(p); chain.save(); render(); }; // TODO(solana): Core NFT name attribute
  inp.onblur = done; inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
}

// ---- boot + edge loop ----
async function boot(s) {
  if (session) return;
  session = { mode: 'free', ...s, seedU: /^\d+$/.test(String(s.seed)) ? Number(s.seed) >>> 0 : hash(s.seed) };
  const wallet = session.wallet || 'local';
  chain = createChain(wallet, now());
  st().seedU = session.seedU;
  if (!st().pets.length) {
    await chain.createPet(F.eggDna(st())); await chain.delegate(0); // TODO(solana): VRF hatch + Core NFT mint
    F.addEgg(st(), F.eggDna(st()));
  }
  $('avatar').textContent = wallet.slice(0, 2).toUpperCase(); $('avatar').title = wallet;
  await chain.tick(now());
  render();
  setInterval(async () => {
    if (busy) return;
    const alive = st().pets.map((q) => q.stats.alive);
    if (!(await chain.tick(now()))) return;
    F.settleJobs(st()).forEach(toast);
    st().pets.forEach((q, i) => { if (alive[i] && !q.stats.alive) { finish(q, 'ranaway'); toast(`${F.name(q)} ran away…`); } });
    chain.save(); render();
  }, 500);
}

window.petden = { get chain() { return chain; }, open }; // headless checks
window.Chomp?.onSession(boot);
chomp('ready');
const qs = new URLSearchParams(location.search);
setTimeout(() => boot({ mode: 'free', seed: qs.get('seed') ?? String((Math.random() * 2 ** 32) >>> 0) }), 300);
