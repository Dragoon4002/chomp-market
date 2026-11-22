# Infra

Two boxes (terraform `instance_types`), AWS profile `near-games`, region `ap-southeast-2` (the account's SCP only allows EC2 there; free-tier plan limits instance types):

- **server** (t4g.small, arm64): `brawler-server` + `agents` + Caddy. `<server-ip>.sslip.io` → `brawler-server:8787` (WebSocket, `/history/*`, `/tape/*`). Match data in the `brawler_data` volume. Also `ribbon-server:8788` (`ribbon.<server-ip>.sslip.io`) and `keyfall-server:8789` (`keyfall.<server-ip>.sslip.io`).
- **clients** (m7i-flex.large, x86, 8G): game client (`games/brawler/client`, Next standalone) + market (`market/`, bun Next standalone) + Caddy. `<clients-ip>.sslip.io` → `brawler-client:3000`, `market.<clients-ip>.sslip.io` → `market:3000`.

Domains are `<eip with dashes>.sslip.io` (`terraform output domains`), so no DNS setup. `NEXT_PUBLIC_*` are baked at build time from those outputs (`make push-client` / `push-market`).

Server chain env (ansible defaults, override via env/secrets): `CONTRACT_ID=v3.brawler-platform-5c8e2b.testnet`, `MONSTERS_ID=v2.brawler-monsters-5c8e2b.testnet`, `REFEREE_ID=referee.v2.brawler-platform-5c8e2b.testnet`, `REFEREE_KEY` (required for gasless attestations).

Ribbon/keyfall clients (`games/{ribbon,keyfall}/client`): `NEXT_PUBLIC_SERVER_URL=wss://{ribbon,keyfall}.<server domain>`, `NEXT_PUBLIC_MARKET_URL=<market url>`. Market: `NEXT_PUBLIC_RIBBON_URL=<ribbon url>`.

## Deploy

Needs ssh access as `ubuntu`, docker buildx, `jq`. Ansible checks out `main` from GitHub, so push the infra changes first.

```sh
make deploy-infra                 # terraform (AWS_PROFILE defaults to near-games)
export REFEREE_KEY=$(jq -r .private_key ~/.near-credentials/testnet/referee.v2.brawler-platform-5c8e2b.testnet.json)
make deploy                       # ansible base pass, build+ship all 4 images, ansible compose up
# or piecewise:
make push-image push-agents       # server box
make push-client push-market      # clients box
make ansible                      # compose up on both
```

Images are built locally (per-box `--platform`) and loaded over ssh; the boxes never build (`compose up --no-build`).

Server: wss://52-64-167-184.sslip.io · Game: https://13-54-190-122.sslip.io · Market: https://market.13-54-190-122.sslip.io
