# ctx = repo root
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY games/brawler/client/package.json games/brawler/client/
COPY packages/platform/package.json packages/platform/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY packages/platform packages/platform
COPY games/brawler/client games/brawler/client
# NEXT_PUBLIC_* are inlined at build time
ARG NEXT_PUBLIC_SERVER_URL
ARG NEXT_PUBLIC_MARKET_URL
ARG NEXT_PUBLIC_FASTAUTH=off
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @xyz/brawler

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/games/brawler/client/.next/standalone ./
COPY --from=build /app/games/brawler/client/.next/static games/brawler/client/.next/static
COPY --from=build /app/games/brawler/client/public games/brawler/client/public
USER node
EXPOSE 3000
CMD ["node", "games/brawler/client/server.js"]
