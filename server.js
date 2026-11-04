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
const BLOCKED = ["node_modules", ".git", "server.js", "package.json", "package-lock.json", "web.config", "logs", "tools"];
// Behind IIS the server listens on a private port; these say what friends should open instead
const SHARE_PORT = Number(process.env.SHARE_PORT) || PORT;
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");

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
// permessage-deflate: snapshots are repetitive JSON and shrink a lot. Only messages
// over 1 KB (snapshots) are compressed, at the fastest level, so small position
// updates go out as they are and the server's CPU cost stays tiny.
const wss = new WebSocketServer({
  server,
  path: "/ws",
  perMessageDeflate: {
    threshold: 1024,
    zlibDeflateOptions: { level: 1 },
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
  },
});

// Links friends on the LAN can open (sent to players so the host can show them)
const lanUrls = Object.values(os.networkInterfaces())
  .flat()
  .filter((net) => net && net.family === "IPv4" && !net.internal)
  // Home routers usually use 192.168.x.x; list those first (172.x is often a virtual adapter)
  .sort((a, b) => b.address.startsWith("192.168.") - a.address.startsWith("192.168."))
  .map((net) => `http://${net.address}${SHARE_PORT === 80 ? "" : ":" + SHARE_PORT}/game.html`);
if (PUBLIC_URL) lanUrls.unshift(`${PUBLIC_URL}/game.html`);

const clients = new Map(); // id -> { ws, slot }
let nextId = 1;
let hostId = null;
// A game is running while anyone is playing it; later joiners drop straight in.
// Players who went back to the menu (or never left the lobby) don't count, so once
// the last player leaves the game the next group gathers in the lobby again.
function inGame() {
  return [...clients.values()].some((c) => c.playing);
}

// Rejoin: a player who drops out of a running game keeps their slot for a while
const REJOIN_MS = 60000;
const reserved = new Map(); // rejoin token -> { slot, until }

function purgeReservations() {
  const now = Date.now();
  reserved.forEach((r, token) => {
    if (r.until < now) reserved.delete(token);
  });
  // The game world lives in the players' browsers: once everyone has left there's
  // nothing to rejoin, so the next group starts fresh in the lobby
  if (!inGame()) reserved.clear();
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(msg);
}

// Positions and enemy snapshots: each one replaces the last, so a client whose
// connection is behind skips them instead of getting an ever-growing backlog (lag)
const REALTIME = new Set(["p", "snap"]);
const MAX_BUFFERED = 256 * 1024;

function broadcast(msg, exceptId, realtime = false) {
  const data = typeof msg === "string" ? msg : JSON.stringify(msg);
  clients.forEach((client, id) => {
    if (id === exceptId) return;
    if (realtime && client.ws.bufferedAmount > MAX_BUFFERED) return;
    send(client.ws, data);
  });
}

// Lobby: who's here, which hero they picked and whether they're ready
function broadcastLobby() {
  const players = [...clients.entries()]
    .map(([id, c]) => ({ id, slot: c.slot, name: c.name, hero: c.hero, ready: c.ready, host: id === hostId }))
    .sort((a, b) => a.slot - b.slot);
  broadcast({ t: "lobby", players, inGame: inGame() });
}

function freeSlot() {
  const used = new Set([...clients.values()].map((c) => c.slot));
  reserved.forEach((r) => used.add(r.slot));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

wss.on("connection", (ws, req) => {
  purgeReservations();
  const token = (new URL(req.url, "http://x").searchParams.get("token") || "").slice(0, 40);
  const reservation = token && reserved.get(token);
  const rejoined = !!reservation;
  if (rejoined) reserved.delete(token);
  const slot = rejoined ? reservation.slot : freeSlot();
  if (slot === -1) {
    send(ws, JSON.stringify({ t: "full" }));
    ws.close();
    return;
  }

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  const id = nextId++;
  const running = inGame();
  // Joining a running game drops you straight in (see main.js)
  clients.set(id, { ws, slot, token, hero: "knight", ready: false, playing: running });
  if (hostId === null) hostId = id;
  send(ws, JSON.stringify({ t: "welcome", id, slot, host: hostId === id, urls: lanUrls, inGame: running, rejoined }));
  broadcastLobby();
  console.log(`Player ${slot + 1} joined${hostId === id ? " (host)" : ""} - ${clients.size}/${MAX_PLAYERS}`);

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    msg.from = id;

    if (msg.t === "ping") {
      // Answered here, not relayed: the round trip to the server is the player's ping
      send(ws, JSON.stringify({ t: "pong", c: msg.c }));
      return;
    }
    if (msg.t === "lobby") {
      const client = clients.get(id);
      if (typeof msg.hero === "string") client.hero = msg.hero.slice(0, 20);
      if (typeof msg.name === "string") client.name = msg.name.slice(0, 12);
      client.ready = !!msg.ready;
      broadcastLobby();
      return;
    }
    if (msg.t === "start") {
      // Checked here, not just on the host's screen: someone may have un-readied
      // or joined while the host's lobby list was on its way
      const everyone = [...clients.values()];
      if (id === hostId && !inGame() && everyone.every((c) => c.ready)) {
        everyone.forEach((c) => (c.playing = true));
        broadcast({ t: "start" });
        broadcastLobby();
        console.log("Game started");
      }
      return;
    }
    if (msg.t === "menu") {
      // Left the game on purpose (exit / credits): no slot to keep for a rejoin
      const client = clients.get(id);
      client.playing = false;
      client.ready = false;
      client.token = "";
      purgeReservations();
      broadcastLobby();
      return;
    }

    const out = JSON.stringify(msg);
    if (typeof msg.to === "number") {
      const target = clients.get(msg.to);
      if (target) send(target.ws, out);
    } else if (msg.to === "host") {
      const host = clients.get(hostId);
      if (host && hostId !== id) send(host.ws, out);
    } else {
      broadcast(out, id, REALTIME.has(msg.t));
    }
  });

  ws.on("close", () => {
    const client = clients.get(id);
    clients.delete(id);
    if (client.playing && client.token) reserved.set(client.token, { slot, until: Date.now() + REJOIN_MS });
    broadcast({ t: "leave", id });
    if (hostId === id) {
      hostId = clients.size ? clients.keys().next().value : null;
      if (hostId !== null) broadcast({ t: "host", id: hostId });
    }
    purgeReservations();
    broadcastLobby();
    console.log(`Player ${slot + 1} left - ${clients.size}/${MAX_PLAYERS}`);
  });
});

// Heartbeat: a laptop that went to sleep leaves a socket that never closes on its
// own, and would keep its player "playing" forever. Browsers answer pings for us.
const HEARTBEAT_MS = 10000;
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate(); // fires "close" like a normal leave
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nWCL Knights LAN server running.\n`);
  console.log(`  On this computer:  http://localhost:${PORT}/game.html`);
  lanUrls.forEach((url) => console.log(`  On your LAN:       ${url}`));
  console.log(`\nUp to ${MAX_PLAYERS} players. The first to join is the host.\n`);
});
