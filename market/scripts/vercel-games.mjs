// Vercel only: serverless functions can't read ../games at runtime, so copy every games/<slug>/build into
// public/g/<slug>/ (served as static files; public wins over the /g/[slug] route). CSP sandbox header: next.config.ts.
import fs from "node:fs";
import path from "node:path";

if (process.env.VERCEL) {
  const games = path.resolve("..", "games");
  for (const slug of fs.readdirSync(games)) {
    const build = path.join(games, slug, "build");
    if (slug.startsWith("_") || !fs.existsSync(build)) continue;
    fs.cpSync(build, path.join("public", "g", slug), { recursive: true });
  }
  console.log("vercel-games: copied builds into public/g");
}
