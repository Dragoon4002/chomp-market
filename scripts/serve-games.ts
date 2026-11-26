// Standalone server for html5/godot/unity game builds, so games keep running while the market dev server reloads.
// Run: node scripts/serve-games.ts   (or bun)   → http://localhost:3200/g/<slug>/
// URL layout mirrors the market (/g/<slug>/…, /chomp-sdk.js) because builds use absolute paths.
// Market embeds from here when NEXT_PUBLIC_GAMES_ORIGIN=http://localhost:3200 is set.
// Same rules as market/app/g/[slug]/[...path]/route.ts (MIME, .gz/.br, CORS, no escaping games/<slug>/build).
import { createServer, request, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "games");
const SDK = path.resolve(import.meta.dirname, "..", "market", "public", "chomp-sdk.js");
const PORT = Number(process.env.GAMES_PORT || 3200);
// /g/<slug>-ws/* → that game's server (WS + HTTP), mirrors the rewrites in market/next.config.ts. <SLUG>_SERVER overrides.
const SERVERS: Record<string, number> = { brawler: 8787, ribbon: 8788, keyfall: 8789, "monster-siege": 8790, coinflip: 8791 };
const WS_RE = /^\/g\/([a-z0-9-]+)-ws(\/.*|$)/;
const route = (u = "") => {
  const m = WS_RE.exec(u);
  if (!m || !(m[1] in SERVERS)) return null;
  return { up: new URL(process.env[`${m[1].toUpperCase().replace(/-/g, "_")}_SERVER`] || `http://127.0.0.1:${SERVERS[m[1]]}`), path: m[2] || "/" };
};
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain",
};

// games with a web build (dirs starting "_" skipped)
const built = async () => {
  const dirs = (await readdir(ROOT)).filter((d) => !d.startsWith("_"));
  const ok = await Promise.all(dirs.map((d) => stat(path.join(ROOT, d, "build")).then((s) => s.isDirectory(), () => false)));
  return dirs.filter((_, i) => ok[i]);
};

async function handle(req: IncomingMessage, res: ServerResponse) {
  const ws = route(req.url);
  if (ws) {
    const up = request({ host: ws.up.hostname, port: ws.up.port, path: ws.path, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("game server down"); });
    req.pipe(up);
    return;
  }
  const url = new URL(req.url ?? "/", "http://x");
  const segs = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  if (segs[0] === "chomp-sdk.js") { res.writeHead(200, { "Content-Type": MIME[".js"], "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" }).end(await readFile(SDK)); return; }
  if (!segs.length) {
    const list = (await built()).map((s) => `<li><a href="/g/${s}/">${s}</a></li>`).join("");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><title>Chomp games</title><h1>Games</h1><ul>${list}</ul>`);
    return;
  }
  if (segs[0] !== "g") { res.writeHead(301, { Location: `/g/${segs.join("/")}/` }).end(); return; } // "/2048" shortcut
  const [, slug = "", ...parts] = segs;
  // "/g/2048" → "/g/2048/" so relative asset paths resolve
  if (!parts.length && !url.pathname.endsWith("/")) { res.writeHead(301, { Location: `/g/${slug}/` }).end(); return; }
  const base = path.join(ROOT, slug, "build");
  let file = path.resolve(base, ...parts);
  // trust boundary: no escaping games/<slug>/build
  if (!/^[a-z0-9-]+$/.test(slug) || (file !== base && !file.startsWith(base + path.sep))) { res.writeHead(404).end("not found"); return; }
  if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
  const body = await readFile(file).catch(() => null);
  if (!body) { res.writeHead(404).end("not found"); return; }
  const enc = file.endsWith(".br") ? "br" : file.endsWith(".gz") ? "gzip" : "";
  const name = enc ? file.slice(0, -3) : file;
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache", // dev server: always pick up rebuilt game files
    ...(enc && { "Content-Encoding": enc }),
  }).end(body);
}

// one bad request (malformed %-escape, read error) must not take the server down mid-game
createServer((req, res) => handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(400); res.end("bad request"); }))
  .on("upgrade", (req, sock, head) => {
    const ws = route(req.url);
    if (!ws) return sock.destroy();
    // replay the handshake to the game server, then splice the sockets
    const up = connect(Number(ws.up.port), ws.up.hostname, () => {
      const lines = [`${req.method} ${ws.path} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(lines.join("\r\n") + "\r\n\r\n");
      up.write(head);
      up.pipe(sock).pipe(up);
    });
    up.on("error", () => sock.destroy());
    sock.on("error", () => up.destroy());
  })
  .listen(PORT, () => console.log(`games → http://localhost:${PORT}/`));
