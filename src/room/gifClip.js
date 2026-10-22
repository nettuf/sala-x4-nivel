const MAX_WINDOWS = 3;
const PLAYER_CD_MS = 2 * 60 * 1000;
const ROOM_CD_MS = 3 * 60 * 1000;
const STAFF_GIF_LEVEL = 4;
const CLIP_SEC = 15;
const MIN_LIVE_SEC = 2;
/** Janela após o apito em que ainda dá pra marcar !gif (mensagem do comando). */
const HOLD_AFTER_MS = 20 * 1000;

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
  onPosted = null,
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
  let holdTimer = null;

  function playerKey(player, auth) {
    if (auth) return `a:${auth}`;
    return `i:${player?.id || 0}`;
  }

  function liveOk() {
    return typeof canClip === "function" ? !!canClip() : true;
  }

  function clipTime() {
    // Depois do apito o corte é o fim da partida, não o relógio ao vivo (pode sumir/zerar).
    if (held && matchEndTime > 0) return round1(matchEndTime);
    const scores = typeof room?.getScores === "function" ? room.getScores() : null;
    const t = Number(scores?.time);
    if (Number.isFinite(t) && t > 0) return round1(t);
    if (matchEndTime > 0) return round1(matchEndTime);
    return 0;
  }

  function clearHoldTimer() {
    if (holdTimer != null) {
      clearSchedule(holdTimer);
      holdTimer = null;
    }
  }

  function clearHoldState() {
    clearHoldTimer();
    held = false;
    recording = null;
    matchEndTime = 0;
  }

  function armHoldTimer() {
    clearHoldTimer();
    holdTimer = schedule(() => {
      holdTimer = null;
      endHold();
    }, HOLD_AFTER_MS);
  }

  /** Fecha a janela pós-apito: envia o que sobrou e solta o replay. */
  function endHold() {
    if (flushing) {
      holdTimer = schedule(() => {
        holdTimer = null;
        endHold();
      }, 50);
      return;
    }
    held = false;
    clearHoldTimer();
    if (pending.length) {
      flushSoon();
      return;
    }
    recording = null;
    matchEndTime = 0;
  }

  function markClip(player, auth, paid) {
    const endTime = clipTime();
    pending.push({
      endTime,
      startTime: Math.max(0, endTime - CLIP_SEC),
      requesters: [
        {
          id: player.id,
          name: player.name,
          auth: auth || null,
          paid: !!paid,
        },
      ],
    });
    const ts = now();
    lastRoomAt = ts;
    lastPlayerAt.set(playerKey(player, auth), ts);
    if (held) flushSoon();
  }

  function flushSoon() {
    const run = () => {
      if (flushing) return;
      if (!pending.length) {
        if (!held) {
          recording = null;
          matchEndTime = 0;
        }
        return;
      }
      if (!recording || !recording.length) {
        pending.length = 0;
        if (!held) clearHoldState();
        announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
        return;
      }
      flushing = true;
      const windows = pending.splice(0, pending.length);
      const file = recording;
      if (!held) {
        recording = null;
      }
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
          announce("🎬 GIF enviado.", null, 0x2ecc71);
          if (typeof onPosted === "function") {
            Promise.resolve(onPosted(windows)).catch((err) => {
              console.warn("[gif] consume", err?.message || err);
            });
          }
        })
        .catch((err) => {
          console.warn("[gif] post erro", err?.message || err);
          announce("Não deu pra gerar o GIF agora.", null, 0xe74c3c);
        })
        .finally(() => {
          flushing = false;
          if (pending.length) {
            flushSoon();
            return;
          }
          if (!held) {
            recording = null;
            matchEndTime = 0;
          }
        });
    };
    if (typeof setImmediate === "function") setImmediate(run);
    else schedule(run, 0);
  }

  function resetPending() {
    if (flushing || held) return;
    clearHoldTimer();
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
    armHoldTimer();
    if (pending.length) flushSoon();
  }

  function request(player, { auth = null, staffLevel = 0, paidCredit = false } = {}) {
    if (!player) return { ok: false, reason: "not-live" };
    const staff = (Number(staffLevel) || 0) >= STAFF_GIF_LEVEL;
    const paid = !staff && paidCredit === true;
    if (!staff && !paid) {
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

    markClip(player, auth, paid);
    return { ok: true, queued: true, staff, paid, count: 1 };
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
  HOLD_AFTER_MS,
};
