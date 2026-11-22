const SCREENS: [string, string, string][] = [
  ['Title', '/', 'Menu with your monsters'],
  ['Play, create', '/play', 'Stake, visibility, spectator bets'],
  ['Play, join', '/play/join', 'Room code box + open rooms with stakes'],
  ['Lobby', '/lobby', 'Live fights, open seats, watch-only private room'],
  ['Collection', '/collection', 'Your monsters'],
  ['Monster detail', '/collection', 'Click any card'],
  ['Breed', '/breed', 'Pick two, hatch an egg'],
  ['Account', '/account', 'Wallet, balance, claims, stuck stakes, sound'],
  ['Room lobby, host', '/fight/waiting', 'Both fighters, monster + arena pickers, chat, Start'],
  ['Room lobby, challenger', '/fight/challenger', 'Guest view: waiting for the host to start'],
  ['Fight', '/fight/fight', 'Two bots fighting, HUD'],
  ['Victory', '/fight/victory', 'Result with claim'],
  ['Defeat', '/fight/defeat', 'Result for the loser'],
  ['Match void', '/fight/void', 'Refund result'],
  ['Watch and bet', '/watch/LIVE', 'Live market over the fight: bots trade, you go Long/Short, the result settles it'],
  ['Market simulation', '/sim', 'Whole market run with the contract math: ledger, payouts, house books'],
  ['Watch, private room', '/watch/GROV', 'Watch-only private fight'],
  ['Watch, free room', '/watch/FREE', 'No market: chat only'],
];

export function DemoIndex() {
  return (
    <>
      <div><h1>Screen demos</h1><p className="sub">Every screen with fake data. No wallet, server or opponent needed. Wallet actions only show a notice.</p></div>
      <div className="grid">
        {SCREENS.map(([name, href, note]) => (
          <a key={name + href} className="tile" href={`${href}?demo`}><h3>{name}</h3><span className="tile-meta">{note}</span></a>
        ))}
      </div>
    </>
  );
}
