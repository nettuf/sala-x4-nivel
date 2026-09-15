const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createMatchController } = require("../src/room/match");
const {
  createGifClip,
  MIN_LIVE_SEC,
  MAX_WINDOWS,
  PLAYER_CD_MS,
  ROOM_CD_MS,
} = require("../src/room/gifClip");
const {
  gifClipUrlFromStats,
  gifClipUploadUrlFromStats,
  postGifReplay,
} = require("../src/haxbook/gifClipWebhook");

function mockRoom(time = 42) {
  return {
    getScores: () => ({ red: 1, blue: 0, time }),
    getBallPosition: () => ({ x: 10, y: -4 }),
    getPlayerList: () => [
      { id: 1, name: "Red", team: 1 },
      { id: 2, name: "Blue", team: 2 },
    ],
  };
}

function waitFlush() {
  return new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));
}

function markChief(clip, over = {}) {
  return clip.request(
    { id: 1, name: "Chefe", ...over },
    { auth: over.auth || "c1", staffLevel: 4 }
  );
}

const FILE = new Uint8Array([72, 66, 82, 50]);
const STATS = "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats";

describe("gifClip", () => {
  it("jogador e Gerente não marcam; só Chefe e só envia no apito", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => true,
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
      announce: () => {},
    });
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "staff-only");
    assert.equal(clip.request({ id: 2, name: "Gerente" }, { auth: "m1", staffLevel: 3 }).reason, "staff-only");
    const res = markChief(clip);
    assert.equal(res.queued, true);
    assert.equal(clip.pendingCount(), 1);
    await waitFlush();
    assert.equal(posts.length, 0);
    clip.holdReplay(FILE, { endTime: 99 });
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].endTime, 42);
    assert.equal(posts[0].windows[0].startTime, 27);
    assert.equal(posts[0].windows[0].requesters.length, 1);
    assert.equal(posts[0].recording, FILE);
  });

  it("congela o tempo do !gif do Chefe, não o apito", async () => {
    const room = mockRoom(40);
    let time = 40;
    room.getScores = () => ({ red: 1, blue: 0, time });
    const posts = [];
    const clip = createGifClip({
      room,
      canClip: () => true,
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
      announce: () => {},
    });
    assert.equal(markChief(clip).queued, true);
    time = 99;
    clip.holdReplay(FILE, { endTime: 99 });
    await waitFlush();
    assert.equal(posts[0].windows[0].endTime, 40);
  });

  it("respeita cooldown de 2 min por pessoa e 3 min da sala depois de marcar", async () => {
    let t = 5_000;
    const clip = createGifClip({
      room: mockRoom(),
      now: () => t,
      canClip: () => true,
      announce: () => {},
      postClip: async () => ({ ok: true }),
    });
    assert.equal(markChief(clip).queued, true);
    t += 1_000;
    assert.equal(markChief(clip).reason, "player-cd");
    assert.equal(clip.request({ id: 9, name: "Outro" }, { auth: "c2", staffLevel: 4 }).reason, "room-cd");
    t += PLAYER_CD_MS;
    assert.equal(markChief(clip).reason, "room-cd");
    t += ROOM_CD_MS;
    assert.equal(markChief(clip).queued, true);
  });

  it("recusa treino e jogada curta mesmo sendo Chefe", () => {
    const clip = createGifClip({ room: mockRoom(), canClip: () => false });
    assert.equal(markChief(clip).reason, "not-live");
    const live = createGifClip({ room: mockRoom(MIN_LIVE_SEC - 1), canClip: () => true });
    assert.equal(markChief(live).reason, "empty");
  });

  it("depois do apito o Chefe ainda marca e envia", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => false,
      announce: () => {},
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    clip.holdReplay(FILE, { endTime: 42 });
    assert.equal(clip.request({ id: 1, name: "A" }, { auth: "a1" }).reason, "staff-only");
    const staff = clip.request({ id: 2, name: "Chefe" }, { auth: "c1", staffLevel: 4 });
    assert.equal(staff.queued, true);
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].endTime, 42);
  });

  it("reset do winner stays depois do apito não apaga o GIF marcado", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => true,
      announce: () => {},
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    markChief(clip);
    clip.holdReplay(FILE, { endTime: 90 });
    clip.resetPending();
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].endTime, 42, "corta os 15s do !gif, não o apito");
  });

  it("aceita no máximo 3 cortes por partida", async () => {
    let t = 1_000;
    const clip = createGifClip({
      room: mockRoom(),
      now: () => t,
      canClip: () => true,
      announce: () => {},
      postClip: async () => ({ ok: true }),
    });
    for (let i = 0; i < MAX_WINDOWS; i++) {
      clip.request({ id: 10 + i, name: "Chefe" }, { auth: `c${i}`, staffLevel: 4 });
      t += ROOM_CD_MS + 1;
    }
    assert.equal(clip.pendingCount(), 3);
    assert.equal(clip.request({ id: 99, name: "Chefe" }, { auth: "c9", staffLevel: 4 }).reason, "match-full");
  });
});

describe("gifClipWebhook", () => {
  it("troca /stats por /gif-clip e /gif-clip/upload", () => {
    assert.equal(
      gifClipUrlFromStats(STATS),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/gif-clip"
    );
    assert.equal(
      gifClipUploadUrlFromStats(STATS),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/gif-clip/upload"
    );
  });

  it("sobe o hbr2 e posta os cortes", async () => {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body, headers: opts.headers });
      if (String(url).endsWith("/upload")) {
        return { ok: true, status: 200, json: async () => ({ uploadUrl: "https://stor.test/put", key: "replays/comunax4/a.hbr2" }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const res = await postGifReplay(
      STATS,
      "k",
      {
        roomLabel: "x4",
        recording: FILE,
        windows: [{ endTime: 40, startTime: 25, requesters: [{ id: 1, name: "A" }] }],
      },
      { fetchFn }
    );
    assert.equal(res.ok, true);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].url, /\/gif-clip\/upload$/);
    assert.equal(calls[1].method, "PUT");
    assert.equal(JSON.parse(calls[2].body).key, "replays/comunax4/a.hbr2");
  });

  it("presign 521 devolve erro", async () => {
    const res = await postGifReplay(
      STATS,
      "k",
      {
        roomLabel: "x4",
        recording: FILE,
        windows: [{ endTime: 40, startTime: 25, requesters: [{ id: 1, name: "A" }] }],
      },
      { fetchFn: async () => ({ ok: false, status: 521, json: async () => ({}) }) }
    );
    assert.equal(res.ok, false);
    assert.equal(res.status, 521);
  });
});

describe("gif hold no fim da partida", () => {
  function matchWithHold(file) {
    const held = [];
    let cancelled = 0;
    const room = {
      getPlayerList: () => [
        { id: 1, name: "R", auth: "r", team: 1 },
        { id: 2, name: "B", auth: "b", team: 2 },
      ],
      getScores: () => ({ red: 0, blue: 0, time: 20, scoreLimit: 3, timeLimit: 240 }),
      startRecording: () => {},
      stopRecording: () => file,
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room, {
      onReplayHold: (rec, opts) => held.push({ rec, opts }),
      onReplayCancel: () => {
        cancelled += 1;
      },
    });
    return { match, held, get cancelled() { return cancelled; } };
  }

  it("partida inválida ainda segura o replay se tem arquivo", async () => {
    const file = new Uint8Array([1, 2, 3]);
    const host = matchWithHold(file);
    host.match.start({ competitive: false });
    const result = await host.match.finish(
      { red: 0, blue: 0, time: 20, scoreLimit: 3, timeLimit: 240 },
      { persist: false }
    );
    assert.equal(result.valid, false);
    assert.equal(host.held.length, 1);
    assert.equal(host.held[0].rec, file);
    assert.equal(host.cancelled, 0);
  });

  it("RR/stop de admin segura o arquivo em vez de apagar o GIF", () => {
    const file = new Uint8Array([9, 8, 7]);
    const host = matchWithHold(file);
    host.match.start({ competitive: true });
    host.match.cancelRecordingOnly();
    assert.equal(host.held.length, 1);
    assert.equal(host.held[0].rec, file);
    assert.equal(host.cancelled, 0);
  });

  it("sem arquivo cancela o GIF pendente", () => {
    const host = matchWithHold(new Uint8Array());
    host.match.start({ competitive: true });
    host.match.cancelRecordingOnly();
    assert.equal(host.held.length, 0);
    assert.equal(host.cancelled, 1);
  });
});
