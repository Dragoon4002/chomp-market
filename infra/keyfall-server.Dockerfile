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
# word list is include_str!'d from the client's public dir
COPY games/keyfall/client/public/words.txt games/keyfall/client/public/words.txt
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p keyfall-server && cp target/release/keyfall-server /keyfall-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=build /keyfall-server /usr/local/bin/
ENV PORT=8789
EXPOSE 8789
USER nobody
CMD ["keyfall-server"]
