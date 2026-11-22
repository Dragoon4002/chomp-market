import { useEffect, useRef, useState } from 'react';
import type { ChatLine } from '@/lib/session.ts';

const time = (ts: number) => new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function Chat({ lines, onSend, note }: { lines: ChatLine[]; onSend: (text: string) => void; note?: string }) {
  const [text, setText] = useState('');
  const log = useRef<HTMLOListElement>(null);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [lines]);
  return (
    <section className="chat slab" aria-label="Chat">
      <h3>Chat</h3>
      <ol ref={log} className="chat-log" role="log" aria-live="polite" tabIndex={0} aria-label="Messages">
        {lines.length === 0 && <li className="chat-empty">{note ?? 'No messages yet. Say hi!'}</li>}
        {lines.map((l, i) => (
          <li key={i}>
            <time>{time(l.ts)}</time>
            <b className={l.seat === 0 ? 's0' : l.seat === 1 ? 's1' : 'spec'}>{l.from}</b>
            <span>{l.text}</span>
          </li>
        ))}
      </ol>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) { onSend(t); setText(''); } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Type a message…" aria-label="Chat message" enterKeyHint="send" />
        <button className="btn alt" disabled={!text.trim()}><span>Send</span></button>
      </form>
    </section>
  );
}
