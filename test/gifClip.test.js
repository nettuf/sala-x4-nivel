const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
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

function voteFive(clip) {
  assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
  clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
  clip.request({ id: 3, name: "C" }, { auth: "a3" });
  clip.request({ id: 4, name: "D" }, { auth: "a4" });
  return clip.request({ id: 5, name: "E" }, { auth: "a5" });
}

const FILE = new Uint8Array([72, 66, 82, 50]);

describe("gifClip", () => {
  it("só marca no 5º pedido e só envia no apito", async () => {
    const posts = [];
    let scheduled = null;
    const clip = createGifClip({
      room: mockRoom(),
      now: () => 1_000,
      canClip: () => true,
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
      schedule: (fn) => {
        scheduled = fn;
        return 1;
      },
      clearSchedule: () => {},
      announce: () => {},
    });
    const a = clip.request({ id: 1, name: "Red" }, { auth: "a1" });
    assert.equal(a.opened, true);
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "already");
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    assert.equal(clip.request({ id: 4, name: "D" }, { auth: "a4" }).count, 4);
    await waitFlush();
    assert.equal(posts.length, 0);
    const fifth = clip.request({ id: 5, name: "E" }, { auth: "a5" });
    assert.equal(fifth.queued, true);
    assert.equal(clip.pendingCount(), 1);
    await waitFlush();
    assert.equal(posts.length, 0);
    clip.holdReplay(FILE, { endTime: 42 });
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows.length, 1);
    assert.equal(posts[0].windows[0].endTime, 42);
    assert.equal(posts[0].windows[0].startTime, 27);
    assert.equal(posts[0].windows[0].requesters.length, 5);
    assert.equal(posts[0].recording, FILE);
    if (scheduled) scheduled();
    await waitFlush();
    assert.equal(posts.length, 1);
  });

  it("congela o tempo do primeiro !gif, não o que vem depois", async () => {
    const room = mockRoom(40);
    let time = 40;
    room.getScores = () => ({ red: 1, blue: 0, time });
    const posts = [];
    const clip = createGifClip({
      room,
      now: () => 1_000,
      canClip: () => true,
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
    });
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
    time = 99;
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    clip.request({ id: 5, name: "E" }, { auth: "a5" });
    clip.holdReplay(FILE, { endTime: 99 });
    await waitFlush();
    assert.equal(posts[0].windows[0].endTime, 40);
  });

  it("cancela sem marcar se a janela acaba sem 5 pessoas", async () => {
    const posts = [];
    const announces = [];
    let scheduled = null;
    const clip = createGifClip({
      room: mockRoom(),
      now: () => 1_000,
      canClip: () => true,
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
      schedule: (fn) => {
        scheduled = fn;
        return 1;
      },
      clearSchedule: () => {},
      announce: (msg) => announces.push(msg),
    });
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    scheduled();
    await waitFlush();
    assert.equal(posts.length, 0);
    assert.equal(clip.pendingCount(), 0);
    assert.ok(announces.some((m) => /cancelado/i.test(m)));
    clip.holdReplay(FILE, { endTime: 42 });
    await waitFlush();
    assert.equal(posts.length, 0);
  });

  it("respeita cooldown de 2 min por pessoa e 3 min da sala só depois de marcar", async () => {
    let t = 5_000;
    const clip = createGifClip({
      room: mockRoom(),
      now: () => t,
      canClip: () => true,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
      postClip: async () => ({ ok: true }),
    });
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
    t += 1_000;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "already");
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    assert.equal(clip.request({ id: 5, name: "E" }, { auth: "a5" }).count, 5);
    t += 1_000;
    assert.equal(clip.request({ id: 6, name: "F" }, { auth: "a6" }).reason, "room-cd");
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "player-cd");
    t += PLAYER_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "room-cd");
    t += ROOM_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
  });

  it("recusa treino e jogada curta", () => {
    const clip = createGifClip({ room: mockRoom(), canClip: () => false });
    assert.equal(clip.request({ id: 1, name: "Red" }).reason, "not-live");
    const live = createGifClip({ room: mockRoom(MIN_LIVE_SEC - 1), canClip: () => true });
    assert.equal(live.request({ id: 1, name: "Red" }).reason, "empty");
  });

  it("Chefe (nv.4) marca o GIF sozinho e só envia no apito", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => true,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    const res = clip.request({ id: 1, name: "Chefe" }, { auth: "c1", staffLevel: 4 });
    assert.equal(res.queued, true);
    assert.equal(res.staff, true);
    await waitFlush();
    assert.equal(posts.length, 0);
    clip.holdReplay(FILE, { endTime: 42 });
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].requesters.length, 1);
  });

  it("Gerente (nv.3) não fecha sozinho", () => {
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => true,
      schedule: () => 1,
      clearSchedule: () => {},
    });
    const res = clip.request({ id: 2, name: "Gerente" }, { auth: "m1", staffLevel: 3 });
    assert.equal(res.opened, true);
    assert.equal(!!res.queued, false);
    assert.equal(clip.windowCount(), 1);
  });

  it("depois do apito o voto aberto ainda aceita e envia o arquivo", async () => {
    let live = true;
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => live,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    clip.request({ id: 1, name: "A" }, { auth: "a1" });
    live = false;
    clip.request({ id: 2, name: "B" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    clip.holdReplay(FILE, { endTime: 42 });
    const last = clip.request({ id: 5, name: "E" }, { auth: "a5" });
    assert.equal(last.queued, true);
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].requesters.length, 5);
  });

  it("depois do apito sem voto, só o Chefe abre", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => false,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    clip.holdReplay(FILE, { endTime: 42 });
    assert.equal(clip.request({ id: 1, name: "A" }, { auth: "a1" }).reason, "not-live");
    const staff = clip.request({ id: 2, name: "Chefe" }, { auth: "c1", staffLevel: 4 });
    assert.equal(staff.queued, true);
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].endTime, 42);
  });

  it("aceita no máximo 3 cortes por partida", async () => {
    let t = 1_000;
    const clip = createGifClip({
      room: mockRoom(),
      now: () => t,
      canClip: () => true,
      schedule: () => 1,
      clearSchedule: () => {},
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
    const stats = "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats";
    assert.equal(
      gifClipUrlFromStats(stats),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/gif-clip"
    );
    assert.equal(
      gifClipUploadUrlFromStats(stats),
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
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats",
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
    assert.equal(calls[1].url, "https://stor.test/put");
    assert.equal(calls[2].method, "POST");
    assert.equal(JSON.parse(calls[2].body).key, "replays/comunax4/a.hbr2");
    assert.equal(JSON.parse(calls[2].body).windows[0].endTime, 40);
  });
});
