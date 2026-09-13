const MAX_REQUESTERS = 5;
const MAX_PENDING = 3;
const MIN_TIME_SEC = 2;
const MIN_WINDOW_GAP_SEC = 5;
const CLIP_SEC = 15;
const WINDOW_MS = 15_000;
const POST_MATCH_ACCEPT_MS = 20_000;
const PLAYER_CD_MS = 2 * 60 * 1000;
const ROOM_CD_MS = 3 * 60 * 1000;
const STAFF_GIF_LEVEL = 4;

function waitSec(lastAt, ms, now) {
  const left = ms - (now - (Number(lastAt) || 0));
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function createGifClip({
  room,
  now = () => Date.now(),
  canClip = () => true,
  roomLabel = "",
  submitReplay = async () => ({ ok: true }),
  schedule = (fn, ms) => setTimeout(fn, ms),
  clearSchedule = (id) => clearTimeout(id),
  announce = () => {},
} = {}) {
  /** @type {null | { requesters: Map<string, { id: number, name: string, auth: string|null }>, endTime: number }} */
  let vote = null;
  let timer = null;
  let lastRoomAt = 0;
  let lastLiveTime = 0;
  let heldRecording = null;
  /** @type {Map<string, number>} */
  const lastPlayerAt = new Map();
  /** @type {{ endTime: number, requesters: { id: number, name: string, auth: string|null }[] }[]} */
  const pending = [];
  let flushing = false;

  function playerKey(player, auth) {
    if (auth) return `a:${auth}`;
    return `i:${player?.id || 0}`;
  }

  function gameTime() {
    const scores = typeof room?.getScores === "function" ? room.getScores() : null;
    const time = Number(scores?.time);
    if (Number.isFinite(time) && time > 0) lastLiveTime = time;
    return lastLiveTime;
  }

  function liveOk() {
    return typeof canClip === "function" ? !!canClip() : true;
  }

  function hasHeldReplay() {
    return !!(heldRecording && lastLiveTime >= MIN_TIME_SEC);
  }

  function expireWindow() {
    if (!vote || flushing) return;
    if (timer) {
      clearSchedule(timer);
      timer = null;
    }
    vote = null;
    if (!pending.length) heldRecording = null;
    announce("🎬 GIF cancelado — precisa de 5 pessoas diferentes.", null, 0xf1c40f);
  }

  function mergeRequesters(left, right) {
    const seen = new Set();
    const out = [];
    for (const row of [...left, ...right]) {
      const key = playerKey({ id: row.id }, row.auth);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }

  function queueClip() {
    if (flushing || !vote) return;
    const requesters = [...vote.requesters.values()];
    const endTime = vote.endTime;
    if (timer) {
      clearSchedule(timer);
      timer = null;
    }
    vote = null;
    const ts = now();
    lastRoomAt = ts;
    for (const requester of requesters) {
      lastPlayerAt.set(playerKey({ id: requester.id }, requester.auth), ts);
    }
    const last = pending[pending.length - 1];
    if (last && endTime - last.endTime < MIN_WINDOW_GAP_SEC) {
      last.requesters = mergeRequesters(last.requesters, requesters);
      last.endTime = endTime;
    } else if (pending.length < MAX_PENDING) {
      pending.push({ endTime, requesters });
    }
    announce("🎬 GIF anotado — gera no fim da partida.", null, 0x2ecc71);
    if (heldRecording) flushHeld();
  }

  function collectWindows() {
    return pending.splice(0, pending.length);
  }

  function resetPending() {
    if (timer) {
      clearSchedule(timer);
      timer = null;
    }
    vote = null;
    pending.length = 0;
    heldRecording = null;
  }

  async function flushReplay(recording, windows) {
    const list = Array.isArray(windows) ? windows : collectWindows();
    if (!list.length) return { ok: true, skipped: true };
    if (!recording || !recording.length) {
      announce("Não deu pra gerar o GIF (sem replay).", null, 0xe74c3c);
      return { ok: false, reason: "no-recording" };
    }
    flushing = true;
    announce("🎬 Gerando o GIF do replay...", null, 0x2ecc71);
    try {
      const res = await submitReplay({
        recording,
        roomLabel,
        windows: list.map((row) => ({
          endTime: row.endTime,
          startTime: Math.max(0, row.endTime - CLIP_SEC),
          requesters: row.requesters,
        })),
      });
      if (res && res.ok === false && res.reason === "daily-cap") {
        announce("Acabou o GIF de hoje. Volta amanhã.", null, 0xf1c40f);
        return res;
      }
      if (res && res.ok === false) {
        announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
        return res;
      }
      announce("🎬 GIF a caminho do Discord.", null, 0x2ecc71);
      return res || { ok: true };
    } catch {
      announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
      return { ok: false, reason: "error" };
    } finally {
      flushing = false;
    }
  }

  function flushHeld() {
    if (!heldRecording || !pending.length) return Promise.resolve({ ok: true, skipped: true });
    const rec = heldRecording;
    const windows = collectWindows();
    heldRecording = null;
    return flushReplay(rec, windows);
  }

  function holdReplay(recording, { endTime } = {}) {
    const t = Number(endTime);
    if (Number.isFinite(t) && t > 0) lastLiveTime = Math.max(lastLiveTime, t);
    else gameTime();
    heldRecording = recording && recording.length ? recording : null;
    if (vote) {
      if (timer) clearSchedule(timer);
      timer = schedule(expireWindow, POST_MATCH_ACCEPT_MS);
      announce("🎬 Partida acabou — ainda dá pra entrar no GIF (!gif).", null, 0x3498db);
    }
    return flushHeld();
  }

  function request(player, { auth = null, staffLevel = 0 } = {}) {
    if (!player) return { ok: false, reason: "not-live" };
    const staff = (Number(staffLevel) || 0) >= STAFF_GIF_LEVEL;
    if (!vote) {
      if (liveOk()) {
        if (gameTime() < MIN_TIME_SEC) return { ok: false, reason: "empty" };
      } else if (!(staff && hasHeldReplay())) {
        return { ok: false, reason: "not-live" };
      }
    }

    const key = playerKey(player, auth);
    const ts = now();
    if (vote?.requesters.has(key)) return { ok: false, reason: "already" };
    if (lastPlayerAt.has(key)) {
      const playerWait = waitSec(lastPlayerAt.get(key), PLAYER_CD_MS, ts);
      if (playerWait > 0) return { ok: false, reason: "player-cd", wait: playerWait };
    }
    if (!vote) {
      const roomWait = waitSec(lastRoomAt, ROOM_CD_MS, ts);
      if (lastRoomAt && roomWait > 0) return { ok: false, reason: "room-cd", wait: roomWait };
      if (pending.length >= MAX_PENDING) return { ok: false, reason: "full" };
    }

    if (vote) {
      if (vote.requesters.size >= MAX_REQUESTERS) return { ok: false, reason: "full" };
      vote.requesters.set(key, { id: player.id, name: player.name, auth: auth || null });
      const joinedCount = vote.requesters.size;
      if (staff || joinedCount >= MAX_REQUESTERS) {
        queueClip();
        return { ok: true, joined: true, queued: true, staff, count: joinedCount };
      }
      return { ok: true, joined: true, count: joinedCount };
    }

    vote = {
      requesters: new Map([[key, { id: player.id, name: player.name, auth: auth || null }]]),
      endTime: gameTime(),
    };
    if (staff) {
      queueClip();
      return { ok: true, opened: true, queued: true, staff: true, count: 1 };
    }
    timer = schedule(expireWindow, WINDOW_MS);
    return { ok: true, opened: true, count: 1 };
  }

  function forget(playerId) {
    lastPlayerAt.delete(`i:${playerId}`);
  }

  return {
    sample: () => false,
    request,
    forget,
    finishWindow: expireWindow,
    collectWindows,
    resetPending,
    holdReplay,
    flushReplay,
    frameCount: () => 0,
    windowCount: () => vote?.requesters.size || 0,
    pendingCount: () => pending.length,
  };
}

module.exports = {
  createGifClip,
  MAX_REQUESTERS,
  MAX_PENDING,
  MIN_TIME_SEC,
  MIN_WINDOW_GAP_SEC,
  CLIP_SEC,
  WINDOW_MS,
  POST_MATCH_ACCEPT_MS,
  PLAYER_CD_MS,
  ROOM_CD_MS,
  STAFF_GIF_LEVEL,
};
