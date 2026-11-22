import { useEffect, useState } from 'react';
import { errText } from '@/lib/format.ts';

// Async load with manual reload; keeps the old value while reloading.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): [T | null, () => void, string] {
  const [v, setV] = useState<T | null>(null), [err, setErr] = useState(''), [n, setN] = useState(0);
  useEffect(() => {
    let dead = false;
    fn().then((x) => { if (!dead) { setV(x); setErr(''); } }).catch((e) => { if (!dead) setErr(errText(e)); });
    return () => { dead = true; };
  }, [...deps, n]);
  return [v, () => setN((x) => x + 1), err];
}

export function useAct(after?: () => void) {
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>, ok = 'Done.') => {
    setBusy(true); setMsg('');
    try { await f(); setMsg(ok); after?.(); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  return { msg, busy, run };
}
