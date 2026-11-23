# Market handoff (2026-11-24)

Market v2 = hosted "Shop" look + Fractal/Ronin patterns. Plan + review: `tasks/todo.md` → "Market v2". Lessons: `tasks/lessons.md`.

## Run
- Market: `cd market && bun dev` → :3100 (a dev server may already be on :3110; reuse it). Open with `?demo` — chain is a stub (`TODO(solana)`), so without demo pages are empty.
- Games detached: `npm run games` → :3200 (`/g/<slug>/`). `market/.env.local` has `NEXT_PUBLIC_GAMES_ORIGIN=http://localhost:3200` so `/play/<slug>` embeds from there.
- Check: `cd market && bunx tsc --noEmit -p . && bun run build`.

## Map
| what | where |
|---|---|
| theme tokens, fonts, keyframes | `market/app/globals.css` (Lilita One + Nunito in `app/layout.tsx`) |
| shell/header/cart drawer + all shared UI (Btn, Panel, Tabs, Row, Star, Pager, Pill, Progress, SkillArt, MonsterArt…) | `market/components/ui.tsx` |
| data API (Api interface, lamports, explorer/short/ago) | `market/lib/assets.ts` |
| mock data | `market/lib/demo.ts` |
| stats from price history (volume, sales, trends, presaleState) | `market/lib/stats.ts` |
| watchlist + cart (localStorage) | `market/lib/local.ts` |
| presale card / launchpad drop card | `market/components/presale-card.tsx`, `market/app/launchpad/drop-card.tsx` |
| pages | `market/app/{page,search,collections,collection,item,launchpad,launch,spin,activity,me,create,play,economy}` |
| game portal | `market/lib/games.ts`, `market/app/play/[slug]`, `market/app/g/[slug]/[...path]/route.ts`, `scripts/serve-games.ts` |
| inspiration screenshots | `market/inspirations/ronin/*.png` |

## Rules
- Style: 3px ink borders, hard `shadow-drop`, rounded-3xl, Lilita headings. Reuse `ui.tsx` pieces; no new deps.
- Custom hooks must be named `useXxx` (React Compiler broke on a store method named `use`).
- Every page must work with `?demo`, and at 390px with no horizontal scroll.
- Verify with headless Chrome screenshots: `google-chrome --headless=new --window-size=1440,2000 --virtual-time-budget=15000 --screenshot=out.png "http://localhost:3110/<route>?demo"`.

## Open gaps (need Solana program / indexer)
Buyer/seller in activity, per-monster sale history, tx links on sales, offers/trait bids, cart as one tx (`CartDrawer`), spin via MagicBlock VRF (`a.spin`). All marked `TODO(solana)`.
