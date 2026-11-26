# ctx = repo root
FROM rust:1.91-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates crates
# cargo needs every workspace member present
COPY games/brawler/sim games/brawler/sim
COPY games/brawler/server games/brawler/server
COPY games/ribbon/sim games/ribbon/sim
COPY games/ribbon/server games/ribbon/server
COPY games/keyfall/server games/keyfall/server
COPY games/coinflip/server games/coinflip/server
COPY games/monster-siege/server games/monster-siege/server
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p ribbon-server && cp target/release/ribbon-server /ribbon-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=build /ribbon-server /usr/local/bin/
RUN mkdir /data && chown nobody /data
ENV PORT=8788 TAPE_DIR=/data/tapes
EXPOSE 8788
USER nobody
CMD ["ribbon-server"]
