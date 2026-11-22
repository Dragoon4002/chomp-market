import { useEffect, useState } from 'react';
import { SERVER } from './session.ts';
import type { Dna } from './genes.ts';
import type { StageId } from './stages.ts';
import { DEMO, DEMO_ROOMS } from './demo.ts';

export interface LobbyRoom {
  code: string; pub: boolean; status: 'waiting' | 'live' | 'done'; stage: StageId; bettable: boolean; matchId: number | null;
  stake: string; winner: number | null; watchers: number; players: { name: string; dna: Dna; account: string }[];
}

export function useLobby() {
  const [rooms, setRooms] = useState<LobbyRoom[] | null>(DEMO ? (DEMO_ROOMS as unknown as LobbyRoom[]) : null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (DEMO) return;
    let ws: WebSocket, dead = false, tries = 0;
    const open = () => {
      ws = new WebSocket(SERVER);
      ws.onopen = () => { tries = 0; setErr(''); ws.send('{"t":"lobby"}'); };
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'lobby') setRooms(m.rooms); if (m.t === 'ping') ws.send('{"t":"pong"}'); };
      ws.onclose = () => { if (dead) return; setErr(tries ? 'Waking up server…' : ''); setTimeout(open, Math.min(5000, 1000 * ++tries)); };
    };
    open();
    return () => { dead = true; ws.close(); };
  }, []);
  return { rooms, err };
}

export function peekRoom(code: string) {
  if (DEMO) return Promise.resolve((DEMO_ROOMS.find((r) => r.code === code) ?? DEMO_ROOMS[2]) as unknown as LobbyRoom);
  return new Promise<LobbyRoom | null>((done, fail) => {
    const ws = new WebSocket(SERVER);
    const t = setTimeout(() => { ws.close(); fail(new Error('Server did not answer')); }, 60_000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'peek', code }));
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'peek') { clearTimeout(t); ws.close(); done(m.room); } };
    ws.onerror = () => { clearTimeout(t); fail(new Error(`Can't reach server ${SERVER}`)); };
  });
}
