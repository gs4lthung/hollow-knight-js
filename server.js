// LAN co-op server: serves the static game files and relays messages
// between up to MAX_PLAYERS browsers over a WebSocket at /ws.
// The first player to connect is the host and simulates all enemies.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const MAX_PLAYERS = 4;
const BLOCKED = ["node_modules", ".git", "server.js", "package.json", "package-lock.json"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.join(ROOT, pathname);
  const relative = path.relative(ROOT, filePath);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    BLOCKED.includes(relative.split(path.sep)[0])
  ) {
    res.writeHead(403).end();
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const headers = {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    };

    // Range support so audio/video can seek (sound effects rewind to 0)
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range) {
      const start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...headers, "Content-Length": stat.size });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: "/ws" });

const clients = new Map(); // id -> { ws, slot }
let nextId = 1;
let hostId = null;

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(msg);
}

function broadcast(msg, exceptId) {
  const data = typeof msg === "string" ? msg : JSON.stringify(msg);
  clients.forEach((client, id) => {
    if (id !== exceptId) send(client.ws, data);
  });
}

function freeSlot() {
  const used = new Set([...clients.values()].map((c) => c.slot));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

wss.on("connection", (ws) => {
  const slot = freeSlot();
  if (slot === -1) {
    send(ws, JSON.stringify({ t: "full" }));
    ws.close();
    return;
  }

  const id = nextId++;
  clients.set(id, { ws, slot });
  if (hostId === null) hostId = id;
  send(ws, JSON.stringify({ t: "welcome", id, slot, host: hostId === id }));
  console.log(`Player ${slot + 1} joined${hostId === id ? " (host)" : ""} - ${clients.size}/${MAX_PLAYERS}`);

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    msg.from = id;
    const out = JSON.stringify(msg);
    if (msg.to === "host") {
      const host = clients.get(hostId);
      if (host && hostId !== id) send(host.ws, out);
    } else {
      broadcast(out, id);
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcast({ t: "leave", id });
    if (hostId === id) {
      hostId = clients.size ? clients.keys().next().value : null;
      if (hostId !== null) broadcast({ t: "host", id: hostId });
    }
    console.log(`Player ${slot + 1} left - ${clients.size}/${MAX_PLAYERS}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nWCL Knights LAN server running.\n`);
  console.log(`  On this computer:  http://localhost:${PORT}/game.html`);
  Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net && net.family === "IPv4" && !net.internal)
    .forEach((net) => console.log(`  On your LAN:       http://${net.address}:${PORT}/game.html`));
  console.log(`\nUp to ${MAX_PLAYERS} players. The first to join is the host.\n`);
});
