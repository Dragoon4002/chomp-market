# arena

Brawler Arena contract: staked 1v1 duels, gasless signed results, spectator order book, optional monster NFTs, 4/8-player tournaments.
Full flow and calls: [`../README.md`](../README.md).

```sh
cargo test                              # unit tests
cargo near build non-reproducible-wasm  # -> target/near/arena.wasm
node ../../scripts/deploy-platform-v3.mjs --preflight   # then without --preflight: create + deploy + new + wire
```
