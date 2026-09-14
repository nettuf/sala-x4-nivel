const MAX_REQUESTERS = 5;
const MAX_WINDOWS = 3;
const WINDOW_MS = 15_000;
const POST_MATCH_ACCEPT_MS = 20_000;
const PLAYER_CD_MS = 2 * 60 * 1000;
const ROOM_CD_MS = 3 * 60 * 1000;
const STAFF_GIF_LEVEL = 4;
const CLIP_SEC = 15;
const MIN_LIVE_SEC = 2;

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
  roomLabel = "",
  postClip = async () => ({ ok: true }),
  schedule = (fn, ms) => setTimeout(fn, ms),
  clearSchedule = (id) => clearTimeout(id),
  announce = () => {},
} = {}) {
  /** @type {null | { requesters: Map<string, { id: number, name: string, auth: string|null }>, endTime: number }} */
  let window = null;
  let timer = null;
  let lastRoomAt = 0;
  /** @type {Map<string, number>} */
  const lastPlayerAt = new Map();
  let flushing = false;
  /** @type {{ endTime: number, startTime: number, requesters: object[] }[]} */
  const pending = [];
  let recording = null;
  let matchEndTime = 0;
  let held = false;

  function playerKey(player, auth) {
    if (auth) return `a:${auth}`;
    return `i:${player?.id || 0}`;
  }

  function liveOk() {
    return typeof canClip === "function" ? !!canClip() : true;
  }

  function clipTime() {
    const scores = typeof room?.getScores === "function" ? room.getScores() : null;
    const t = Number(scores?.time);
    if (Number.isFinite(t) && t > 0) return round1(t);
    if (matchEndTime > 0) return round1(matchEndTime);
    return 0;
  }

  function clearTimer() {
    if (!timer) return;
    clearSchedule(timer);
    timer = null;
  }

  function expireWindow() {
    if (flushing) return;
    const had = !!window;
    window = null;
    clearTimer();
    if (had) announce("🎬 GIF cancelado — precisa de 5 pessoas diferentes.", null, 0xf1c40f);
    if (held) flushSoon();
  }

  function commitWindow() {
    if (!window) return;
    const requesters = [...window.requesters.values()];
    const endTime = Number(window.endTime) || 0;
    pending.push({
      endTime,
      startTime: Math.max(0, endTime - CLIP_SEC),
      requesters: requesters.map((row) => ({
        id: row.id,
        name: row.name,
        auth: row.auth,
      })),
    });
    const ts = now();
    lastRoomAt = ts;
    for (const requester of requesters) {
      lastPlayerAt.set(playerKey({ id: requester.id }, requester.auth), ts);
    }
    clearTimer();
    window = null;
    announce(
      `🎬 GIF marcado (${pending.length}/${MAX_WINDOWS}) — vai no Discord depois do apito.`,
      null,
      0x2ecc71
    );
    if (held) flushSoon();
  }

  function flushSoon() {
    const run = () => {
      if (flushing || window) return;
      if (!pending.length) {
        held = false;
        recording = null;
        return;
      }
      if (!recording || !recording.length) {
        pending.length = 0;
        held = false;
        recording = null;
        announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
        return;
      }
      flushing = true;
      const windows = pending.splice(0, pending.length);
      const file = recording;
      recording = null;
      held = false;
      Promise.resolve()
        .then(() => postClip({ recording: file, roomLabel, windows }))
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

  function resetPending() {
    clearTimer();
    window = null;
    pending.length = 0;
    recording = null;
    matchEndTime = 0;
    held = false;
  }

  function holdReplay(file, opts = {}) {
    recording = file && file.length ? file : null;
    const end = Number(opts.endTime);
    matchEndTime = Number.isFinite(end) && end > 0 ? round1(end) : clipTime();
    held = true;
    if (window) {
      clearTimer();
      timer = schedule(expireWindow, POST_MATCH_ACCEPT_MS);
      announce("🎬 Partida acabou — ainda dá pra entrar no GIF (!gif).", null, 0x3498db);
      return;
    }
    flushSoon();
  }

  function request(player, { auth = null, staffLevel = 0 } = {}) {
    if (!player) return { ok: false, reason: "not-live" };
    const staff = (Number(staffLevel) || 0) >= STAFF_GIF_LEVEL;
    if (!window) {
      if (pending.length >= MAX_WINDOWS) return { ok: false, reason: "match-full" };
      if (liveOk()) {
        if (clipTime() < MIN_LIVE_SEC) return { ok: false, reason: "empty" };
      } else if (!(staff && (held || clipTime() >= MIN_LIVE_SEC))) {
        return { ok: false, reason: "not-live" };
      }
    }

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
      const joinedCount = window.requesters.size;
      if (staff || joinedCount >= MAX_REQUESTERS) {
        commitWindow();
        return { ok: true, joined: true, queued: true, staff, count: joinedCount };
      }
      return { ok: true, joined: true, count: joinedCount };
    }

    window = {
      requesters: new Map([[key, { id: player.id, name: player.name, auth: auth || null }]]),
      endTime: clipTime(),
    };
    if (staff) {
      commitWindow();
      return { ok: true, opened: true, queued: true, staff: true, count: 1 };
    }
    timer = schedule(expireWindow, WINDOW_MS);
    return { ok: true, opened: true, count: 1 };
  }

  function forget(playerId) {
    lastPlayerAt.delete(`i:${playerId}`);
  }

  return {
    sample() {
      return false;
    },
    request,
    forget,
    finishWindow: expireWindow,
    resetPending,
    resetFrames() {},
    holdReplay,
    frameCount: () => pending.length,
    windowCount: () => window?.requesters.size || 0,
    pendingCount: () => pending.length,
  };
}

module.exports = {
  createGifClip,
  MAX_REQUESTERS,
  MAX_WINDOWS,
  WINDOW_MS,
  POST_MATCH_ACCEPT_MS,
  PLAYER_CD_MS,
  ROOM_CD_MS,
  STAFF_GIF_LEVEL,
  CLIP_SEC,
  MIN_LIVE_SEC,
};
