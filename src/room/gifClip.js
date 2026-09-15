const MAX_WINDOWS = 3;
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

  function markClip(player, auth) {
    const endTime = clipTime();
    pending.push({
      endTime,
      startTime: Math.max(0, endTime - CLIP_SEC),
      requesters: [
        {
          id: player.id,
          name: player.name,
          auth: auth || null,
        },
      ],
    });
    const ts = now();
    lastRoomAt = ts;
    lastPlayerAt.set(playerKey(player, auth), ts);
    announce(
      `🎬 GIF marcado (${pending.length}/${MAX_WINDOWS}) — vai no Discord depois do apito.`,
      null,
      0x2ecc71
    );
    if (held) flushSoon();
  }

  function flushSoon() {
    const run = () => {
      if (flushing) return;
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
      console.log("[gif] enviando", windows.length, "corte(s)", file.length, "bytes");
      Promise.resolve()
        .then(() => postClip({ recording: file, roomLabel, windows }))
        .then((res) => {
          if (res && res.ok === false && res.reason === "daily-cap") {
            console.warn("[gif] cota diária");
            announce("Acabou o GIF de hoje. Volta amanhã.", null, 0xf1c40f);
            return;
          }
          if (res && res.ok === false) {
            console.warn("[gif] post falhou", res.reason || "", res.status || "");
            announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
            return;
          }
          console.log("[gif] aceito pelo site");
          announce("🎬 GIF a caminho do Discord.", null, 0x2ecc71);
        })
        .catch((err) => {
          console.warn("[gif] post erro", err?.message || err);
          announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
        })
        .finally(() => {
          flushing = false;
        });
    };
    if (typeof setImmediate === "function") setImmediate(run);
    else schedule(run, 0);
  }

  function resetPending() {
    if (flushing || held) return;
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
    flushSoon();
  }

  function request(player, { auth = null, staffLevel = 0 } = {}) {
    if (!player) return { ok: false, reason: "not-live" };
    if ((Number(staffLevel) || 0) < STAFF_GIF_LEVEL) {
      return { ok: false, reason: "staff-only" };
    }
    if (pending.length >= MAX_WINDOWS) return { ok: false, reason: "match-full" };
    if (!liveOk() && !held) return { ok: false, reason: "not-live" };
    if (clipTime() < MIN_LIVE_SEC && !held) return { ok: false, reason: "empty" };

    const key = playerKey(player, auth);
    const ts = now();
    if (lastPlayerAt.has(key)) {
      const playerWait = waitSec(lastPlayerAt.get(key), PLAYER_CD_MS, ts);
      if (playerWait > 0) return { ok: false, reason: "player-cd", wait: playerWait };
    }
    if (lastRoomAt) {
      const roomWait = waitSec(lastRoomAt, ROOM_CD_MS, ts);
      if (roomWait > 0) return { ok: false, reason: "room-cd", wait: roomWait };
    }

    markClip(player, auth);
    return { ok: true, queued: true, staff: true, count: 1 };
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
    finishWindow() {},
    resetPending,
    resetFrames() {},
    holdReplay,
    frameCount: () => pending.length,
    windowCount: () => 0,
    pendingCount: () => pending.length,
  };
}

module.exports = {
  createGifClip,
  MAX_WINDOWS,
  PLAYER_CD_MS,
  ROOM_CD_MS,
  STAFF_GIF_LEVEL,
  CLIP_SEC,
  MIN_LIVE_SEC,
};
