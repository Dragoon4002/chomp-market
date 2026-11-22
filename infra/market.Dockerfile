# ctx = repo root
FROM oven/bun:1.3 AS build
WORKDIR /repo/market
COPY market/package.json market/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY market ./
# chain mode; --build-arg NEXT_PUBLIC_DEMO=1 for demo data
ARG NEXT_PUBLIC_DEMO
ARG NEXT_PUBLIC_ASSETS_ID
ARG NEXT_PUBLIC_BRAWLER_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY agents/pricing.ts /repo/agents/pricing.ts
# portal: next.config reads games/*/game.json; route /g/* serves games/*/build at runtime
COPY games /repo/games
RUN bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo/market/.next/standalone ./
COPY --from=build /repo/market/.next/static market/.next/static
COPY --from=build /repo/games games
USER node
EXPOSE 3000
CMD ["node", "market/server.js"]
