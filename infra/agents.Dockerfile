# ctx = repo root. Agents import the client sim + netplay (pure TS).
FROM node:22-slim
WORKDIR /app/agents
COPY agents ./
COPY games/brawler/client/src/lib/sim /app/games/brawler/client/src/lib/sim
COPY games/brawler/client/src/lib/genes.ts games/brawler/client/src/lib/stages.ts games/brawler/client/src/lib/net.ts games/brawler/client/src/lib/bot.ts /app/games/brawler/client/src/lib/
USER node
CMD ["node", "--experimental-strip-types", "--no-warnings", "main.ts"]
