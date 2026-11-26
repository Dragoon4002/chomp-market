# ctx = repo root. Any Rust game server: BIN = brawler-server | keyfall-server | ribbon-server | coinflip-server | monster-siege-server
# (Render passes service env vars as build args.)
FROM rust:1.91-bookworm AS build
ARG BIN
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
# cargo needs every workspace member present
COPY games/brawler/sim games/brawler/sim
COPY games/brawler/server games/brawler/server
COPY games/ribbon/sim games/ribbon/sim
COPY games/ribbon/server games/ribbon/server
COPY games/keyfall/server games/keyfall/server
COPY games/keyfall/client/public/words.txt games/keyfall/client/public/words.txt
COPY games/coinflip/server games/coinflip/server
COPY games/monster-siege/server games/monster-siege/server
RUN cargo build --release --locked -p "$BIN" && cp "target/release/$BIN" /server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && apt-get clean
COPY --from=build /server /usr/local/bin/server
RUN mkdir /data && chown nobody /data
USER nobody
CMD ["server"]
