// Runnable check: every scene's input script must actually produce its move (and land its hits) for both heroes.
// npm run check
import { HEROES, SCENES, simulate, type HeroId } from './scenes.ts';

let bad = 0;
for (const hero of Object.keys(HEROES) as HeroId[]) {
  SCENES.forEach((sc, i) => {
    const frames = simulate(hero, i), seen = new Set<string>();
    let wasDead = false, hits = 0;
    for (const { fighters: [f], events } of frames) {
      seen.add(f.state);
      if (f.move) seen.add(f.move);
      if (f.fastFall) seen.add('fastFall');
      if (f.dropT > 0) seen.add('drop');
      if (f.airDodged) seen.add('airDodge');
      if (f.airJumps === 0) seen.add('airJump2');
      if (f.state === 'hitstun') seen.add(Math.hypot(f.vx, f.vy) > 10 ? 'tumble' : 'hurt');
      if (f.state === 'dead') wasDead = true;
      else if (wasDead && f.invuln > 0) seen.add('respawn');
      hits += events.filter((e) => e.kind === 'hit').length;
    }
    const miss = sc.expect.filter((e) => !seen.has(e));
    const short = (sc.hits ?? 0) > hits;
    if (miss.length || short) bad++;
    console.log(`${miss.length || short ? 'FAIL' : 'ok  '} ${hero.padEnd(9)} ${sc.title.padEnd(24)} ${frames.length - 1}f hits=${hits}${miss.length ? ' missing=' + miss : ''}`);
  });
}
if (bad) { console.error(`${bad} scene(s) failed`); process.exit(1); }
