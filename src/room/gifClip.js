const TICKS_PER_SAMPLE = 6;
const MAX_FRAMES = 150;
const MIN_FRAMES = 20;
const MAX_DISCS = 30;
const MAX_REQUESTERS = 5;
const WINDOW_MS = 15_000;
const PLAYER_CD_MS = 2 * 60 * 1000;
const ROOM_CD_MS = 3 * 60 * 1000;

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function waitSec(lastAt, ms, now) {
  const left = ms - (now - (Number(lastAt) || 0));
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function createGifClip({
  room,
  now = () => Date.now(),
  canClip = () => true,
  bounds = () => ({ w: 700, h: 320 }),
  roomLabel = "",
  postClip = async () => ({ ok: true }),
  schedule = (fn, ms) => setTimeout(fn, ms),
  clearSchedule = (id) => clearTimeout(id),
  announce = () => {},
} = {}) {
  const frames = new Array(MAX_FRAMES);
  let write = 0;
  let count = 0;
  let tick = 0;
  /** @type {null | { requesters: Map<string, { id: number, name: string, auth: string|null }> }} */
  let window = null;
  let timer = null;
  let lastRoomAt = 0;
  /** @type {Map<string, number>} */
  const lastPlayerAt = new Map();
  let flushing = false;

  function playerKey(player, auth) {
    if (auth) return `a:${auth}`;
    return `i:${player?.id || 0}`;
  }

  function snapshotFrames() {
    const out = [];
    const start = count < MAX_FRAMES ? 0 : write;
    for (let i = 0; i < count; i++) {
      const frame = frames[(start + i) % MAX_FRAMES];
      if (frame) out.push(frame);
    }
    return out;
  }

  function sample() {
    tick += 1;
    if (tick % TICKS_PER_SAMPLE !== 0) return false;
    const scores = typeof room?.getScores === "function" ? room.getScores() : null;
    if (!scores) return false;
    const list = typeof room?.getPlayerList === "function" ? room.getPlayerList() : [];
    const discs = [];
    for (const raw of list) {
      if (!raw || raw.id === 0 || raw.team === 0) continue;
      let disc = null;
      try {
        disc = room.getPlayerDiscProperties(raw.id);
      } catch {
        disc = null;
      }
      if (!disc || !Number.isFinite(disc.x) || !Number.isFinite(disc.y)) continue;
      discs.push([raw.id, raw.team, round1(disc.x), round1(disc.y)]);
      if (discs.length >= MAX_DISCS) break;
    }
    if (discs.length === 0) return false;
    const ball = typeof room.getBallPosition === "function" ? room.getBallPosition() : { x: 0, y: 0 };
    frames[write] = {
      t: round1(scores.time || 0),
      bx: round1(ball?.x || 0),
      by: round1(ball?.y || 0),
      p: discs,
    };
    write = (write + 1) % MAX_FRAMES;
    if (count < MAX_FRAMES) count += 1;
    return true;
  }

  function buildPayload(requesters) {
    const scores = typeof room?.getScores === "function" ? room.getScores() : null;
    const list = typeof room?.getPlayerList === "function" ? room.getPlayerList() : [];
    const players = [];
    for (const raw of list) {
      if (!raw || raw.id === 0 || raw.team === 0) continue;
      players.push({ id: raw.id, name: raw.name, team: raw.team });
    }
    return {
      roomLabel,
      bounds: bounds() || { w: 700, h: 320 },
      score: { red: scores?.red || 0, blue: scores?.blue || 0, time: round1(scores?.time || 0) },
      requesters,
      players,
      frames: snapshotFrames(),
    };
  }

  function finishWindow() {
    if (!window || flushing) return;
    flushing = true;
    if (timer) {
      clearSchedule(timer);
      timer = null;
    }
    const requesters = [...window.requesters.values()];
    window = null;
    lastRoomAt = now();
    const payload = buildPayload(requesters);
    const run = () => {
      Promise.resolve()
        .then(() => postClip(payload))
        .then((res) => {
          if (res && res.ok === false && res.reason === "daily-cap") {
            announce("Acabou o GIF de hoje. Volta amanhã.", null, 0xf1c40f);
            return;
          }
          if (res && res.ok === false) {
            announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
            return;
          }
          announce("🎬 GIF a caminho do Discord.", null, 0x2ecc71);
        })
        .catch(() => {
          announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
        })
        .finally(() => {
          flushing = false;
        });
    };
    if (typeof setImmediate === "function") setImmediate(run);
    else setTimeout(run, 0);
  }

  function request(player, { auth = null } = {}) {
    if (!player) return { ok: false, reason: "not-live" };
    if (typeof canClip === "function" ? !canClip() : false) {
      return { ok: false, reason: "not-live" };
    }
    if (count < MIN_FRAMES) return { ok: false, reason: "empty" };

    const key = playerKey(player, auth);
    const ts = now();
    if (window?.requesters.has(key)) return { ok: false, reason: "already" };
    if (lastPlayerAt.has(key)) {
      const playerWait = waitSec(lastPlayerAt.get(key), PLAYER_CD_MS, ts);
      if (playerWait > 0) return { ok: false, reason: "player-cd", wait: playerWait };
    }
    if (!window) {
      const roomWait = waitSec(lastRoomAt, ROOM_CD_MS, ts);
      if (lastRoomAt && roomWait > 0) return { ok: false, reason: "room-cd", wait: roomWait };
    }

    if (window) {
      if (window.requesters.size >= MAX_REQUESTERS) return { ok: false, reason: "full" };
      window.requesters.set(key, { id: player.id, name: player.name, auth: auth || null });
      lastPlayerAt.set(key, ts);
      const joinedCount = window.requesters.size;
      if (joinedCount >= MAX_REQUESTERS) finishWindow();
      return { ok: true, joined: true, count: joinedCount };
    }

    window = {
      requesters: new Map([[key, { id: player.id, name: player.name, auth: auth || null }]]),
    };
    lastPlayerAt.set(key, ts);
    timer = schedule(finishWindow, WINDOW_MS);
    return { ok: true, opened: true, count: 1 };
  }

  function forget(playerId) {
    lastPlayerAt.delete(`i:${playerId}`);
  }

  return {
    sample,
    request,
    forget,
    finishWindow,
    frameCount: () => count,
    windowCount: () => window?.requesters.size || 0,
  };
}

module.exports = {
  createGifClip,
  TICKS_PER_SAMPLE,
  MAX_FRAMES,
  MIN_FRAMES,
  MAX_REQUESTERS,
  WINDOW_MS,
  PLAYER_CD_MS,
  ROOM_CD_MS,
};
