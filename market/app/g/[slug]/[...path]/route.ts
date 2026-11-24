import { readFile } from "node:fs/promises";
import path from "node:path";

// Serves games/<slug>/build/* for every engine's web export. Standalone server chdirs to market/, so ../games works in dev and prod.
const ROOT = path.resolve(process.cwd(), "..", "games");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain",
};

export async function GET(_: Request, { params }: { params: Promise<{ slug: string; path: string[] }> }) {
  const { slug, path: parts } = await params;
  const base = path.join(ROOT, slug, "build");
  const file = path.resolve(base, ...parts);
  // trust boundary: no escaping games/<slug>/build
  if (!/^[a-z0-9-]+$/.test(slug) || !file.startsWith(base + path.sep)) return new Response("not found", { status: 404 });
  const body = await readFile(file).catch(() => null);
  if (!body) return new Response("not found", { status: 404 });
  // Unity WebGL ships .gz/.br; serve as the inner type with Content-Encoding
  const enc = file.endsWith(".br") ? "br" : file.endsWith(".gz") ? "gzip" : "";
  const name = enc ? file.slice(0, -3) : file;
  const h = new Headers({
    "Content-Type": MIME[path.extname(name).toLowerCase()] ?? "application/octet-stream", // .pck/.data/.unityweb
    "Access-Control-Allow-Origin": "*", // sandboxed iframe has origin "null"; fetch()/module scripts need CORS
    "Cache-Control": "public, max-age=300",
    // opaque origin even when opened top-level (or framed without our sandbox attr): game code can't read portal storage (chomp:burner)
    "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-pointer-lock allow-downloads",
  });
  if (enc) h.set("Content-Encoding", enc);
  // ponytail: no COOP/COEP, so Godot builds must export with Thread Support off. Add headers + isolate portal if a threaded build is needed.
  return new Response(body, { headers: h });
}
