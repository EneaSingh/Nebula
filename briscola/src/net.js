// Online rooms over WebRTC (PeerJS, vendored in ../vendor/peerjs).
// The host's browser opens a room and gets a link; whoever opens the link
// connects straight to the host's browser and takes seat two. PeerJS's free
// public broker only introduces the two browsers; game traffic is
// peer-to-peer. Both sides run the same seeded game, so only moves travel.
//
// Self-hosted broker: add ?peer=host:port to the URL (kept in shared links).

const PREFIX = 'briscola-v1-';
const HEARTBEAT_EVERY = 2000;
const HEARTBEAT_TIMEOUT = 25000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function peerOptions() {
  const p = new URLSearchParams(location.search).get('peer');
  if (!p) return { debug: 1 };
  const [host, port] = p.split(':');
  const local = host === 'localhost' || host === '127.0.0.1';
  const opts = { host, port: Number(port) || 443, path: '/', secure: !local, debug: 1 };
  // A broker on this machine means both players are local too: skip the
  // public STUN/TURN servers so offline testing connects instantly.
  if (local) opts.config = { iceServers: [] };
  return opts;
}

export function roomLink(code) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  const peer = new URLSearchParams(location.search).get('peer');
  if (peer) url.searchParams.set('peer', peer);
  url.searchParams.set('room', code);
  return url.toString();
}

const PeerCtor = () => window.peerjs?.Peer ?? window.Peer;

export class Room {
  constructor(handlers) {
    this.h = handlers; // { onOpen(code), onJoin(), onMessage(msg), onLeave(), onError(kind, err) }
    this.peer = null;
    this.conn = null;
    this.role = null;
    this.code = null;
    this.closed = false;
  }

  get connected() {
    return !!this.conn?.open;
  }

  host(code = newRoomCode()) {
    const Peer = PeerCtor();
    if (!Peer) return this.h.onError?.('unsupported');
    this.role = 'host';
    this.code = code;
    this.peer = new Peer(PREFIX + code, peerOptions());
    this.peer.on('open', () => this.h.onOpen?.(code));
    this.peer.on('connection', (conn) => {
      if (this.connected) {
        // Table is full: tell the newcomer and hang up.
        conn.on('open', () => {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }
      this._attach(conn);
    });
    this.peer.on('disconnected', () => {
      // Lost the broker (not the opponent): keep the room reachable.
      if (!this.closed) this.peer.reconnect();
    });
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        this.peer.destroy();
        return this.host(); // code collision: pick another
      }
      this.h.onError?.(err.type, err);
    });
  }

  join(code) {
    const Peer = PeerCtor();
    if (!Peer) return this.h.onError?.('unsupported');
    this.role = 'guest';
    this.code = code;
    this.peer = new Peer(undefined, peerOptions());
    this.peer.on('open', () => this._attach(this.peer.connect(PREFIX + code, { reliable: true })));
    this.peer.on('error', (err) => this.h.onError?.(err.type, err));
  }

  _attach(conn) {
    this.conn = conn;
    // WebRTC can take a minute to notice a vanished peer (closed laptop,
    // dropped Wi-Fi), so both sides ping and give up after a silence.
    let lastSeen = Date.now();
    let beat = 0;
    conn.on('open', () => {
      lastSeen = Date.now();
      beat = setInterval(() => {
        if (Date.now() - lastSeen > HEARTBEAT_TIMEOUT) {
          gone();
          conn.close();
        } else if (conn.open) conn.send({ t: 'ping' });
      }, HEARTBEAT_EVERY);
      this.h.onJoin?.();
    });
    conn.on('data', (msg) => {
      lastSeen = Date.now();
      if (msg && typeof msg === 'object' && typeof msg.t === 'string' && msg.t !== 'ping') this.h.onMessage?.(msg);
    });
    const gone = () => {
      clearInterval(beat);
      if (this.conn !== conn) return;
      this.conn = null;
      if (!this.closed) this.h.onLeave?.();
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  send(msg) {
    if (this.connected) this.conn.send(msg);
  }

  close() {
    this.closed = true;
    try {
      this.conn?.send({ t: 'bye' });
    } catch {}
    setTimeout(() => this.peer?.destroy(), 100);
  }
}
