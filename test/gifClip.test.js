const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGifClip, MIN_TIME_SEC, PLAYER_CD_MS, ROOM_CD_MS } = require("../src/room/gifClip");
const {
  gifClipUrlFromStats,
  replayUploadUrlFromStats,
  replayCompleteUrlFromStats,
  uploadReplayAndEnqueue,
} = require("../src/haxbook/gifClipWebhook");

function mockRoom(time = 42) {
  return {
    getScores: () => ({ red: 1, blue: 0, time }),
    getPlayerList: () => [
      { id: 1, name: "Red", team: 1 },
      { id: 2, name: "Blue", team: 2 },
    ],
  };
}

function voteFive(clip) {
  assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
  clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
  clip.request({ id: 3, name: "C" }, { auth: "a3" });
  clip.request({ id: 4, name: "D" }, { auth: "a4" });
  return clip.request({ id: 5, name: "E" }, { auth: "a5" });
}

describe("gifClip", () => {
  it("não amostra posição e só anota o tempo no 5º pedido", () => {
    const clip = createGifClip({ room: mockRoom(), canClip: () => true, schedule: () => 1, clearSchedule: () => {} });
    assert.equal(clip.sample(), false);
    assert.equal(clip.frameCount(), 0);
    const fifth = voteFive(clip);
    assert.equal(fifth.queued, true);
    assert.equal(clip.pendingCount(), 1);
    assert.equal(clip.collectWindows()[0].endTime, 42);
    assert.equal(clip.pendingCount(), 0);
  });

  it("congela o segundo do primeiro !gif", () => {
    let time = 30;
    const room = { getScores: () => ({ time }), getPlayerList: () => [] };
    const clip = createGifClip({ room, canClip: () => true, schedule: () => 1, clearSchedule: () => {} });
    clip.request({ id: 1, name: "Red" }, { auth: "a1" });
    time = 99;
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    clip.request({ id: 5, name: "E" }, { auth: "a5" });
    assert.equal(clip.collectWindows()[0].endTime, 30);
  });

  it("no apito manda o rec inteiro e só os recortes", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => true,
      roomLabel: "x4",
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
      submitReplay: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    voteFive(clip);
    const windows = clip.collectWindows();
    const rec = new Uint8Array([1, 2, 3]);
    await clip.flushReplay(rec, windows);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].recording, rec);
    assert.equal(posts[0].windows.length, 1);
    assert.equal(posts[0].windows[0].endTime, 42);
    assert.equal(posts[0].windows[0].startTime, 27);
    assert.equal(posts[0].windows[0].requesters.length, 5);
  });

  it("junta pedidos quase iguais e guarda o segundo recorte", () => {
    let time = 40;
    let t = 1_000;
    const clip = createGifClip({
      room: { getScores: () => ({ time }), getPlayerList: () => [] },
      now: () => t,
      canClip: () => true,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
    });
    voteFive(clip);
    t += ROOM_CD_MS;
    time = 42;
    voteFive(clip);
    t += ROOM_CD_MS;
    time = 80;
    voteFive(clip);
    const windows = clip.collectWindows();
    assert.equal(windows.length, 2);
    assert.equal(windows[0].endTime, 42);
    assert.equal(windows[1].endTime, 80);
  });

  it("cancela sem gerar se a janela acaba sem 5 pessoas", () => {
    const announces = [];
    let scheduled = null;
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => true,
      schedule: (fn) => {
        scheduled = fn;
        return 1;
      },
      clearSchedule: () => {},
      announce: (msg) => announces.push(msg),
    });
    clip.request({ id: 1, name: "Red" }, { auth: "a1" });
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    scheduled();
    assert.equal(clip.windowCount(), 0);
    assert.equal(clip.pendingCount(), 0);
    assert.ok(announces.some((m) => /cancelado/i.test(m)));
  });

  it("respeita cooldown só depois de anotar o GIF", () => {
    let t = 5_000;
    const clip = createGifClip({
      room: mockRoom(),
      now: () => t,
      canClip: () => true,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
    });
    voteFive(clip);
    t += 1_000;
    assert.equal(clip.request({ id: 6, name: "F" }, { auth: "a6" }).reason, "room-cd");
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "player-cd");
    t += PLAYER_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "room-cd");
    t += ROOM_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
  });

  it("recusa treino e clip no começo do jogo", () => {
    const dead = createGifClip({ room: mockRoom(), canClip: () => false });
    assert.equal(dead.request({ id: 1, name: "Red" }).reason, "not-live");
    const early = createGifClip({
      room: mockRoom(MIN_TIME_SEC - 0.5),
      canClip: () => true,
    });
    assert.equal(early.request({ id: 1, name: "Red" }).reason, "empty");
  });

  it("depois do apito o voto aberto ainda aceita os outros", async () => {
    let live = true;
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(90),
      canClip: () => live,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
      submitReplay: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    clip.request({ id: 1, name: "A" }, { auth: "a1" });
    live = false;
    clip.request({ id: 2, name: "B" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    const held = clip.holdReplay(new Uint8Array([1, 2]), { endTime: 90 });
    const last = clip.request({ id: 5, name: "E" }, { auth: "a5" });
    assert.equal(last.queued, true);
    await held;
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].endTime, 90);
    assert.equal(posts[0].windows[0].requesters.length, 5);
  });

  it("Chefe (nv.4) fecha o GIF sozinho", () => {
    const clip = createGifClip({
      room: mockRoom(),
      canClip: () => true,
      schedule: () => 1,
      clearSchedule: () => {},
    });
    const res = clip.request({ id: 1, name: "Chefe" }, { auth: "c1", staffLevel: 4 });
    assert.equal(res.queued, true);
    assert.equal(res.staff, true);
    assert.equal(clip.pendingCount(), 1);
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
    assert.equal(clip.pendingCount(), 0);
    assert.equal(clip.windowCount(), 1);
  });

  it("depois do apito sem voto, só o Chefe abre", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(80),
      canClip: () => false,
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
      submitReplay: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
    });
    await clip.holdReplay(new Uint8Array([1]), { endTime: 80 });
    assert.equal(clip.request({ id: 1, name: "A" }, { auth: "a1" }).reason, "not-live");
    const staff = clip.request({ id: 2, name: "Chefe" }, { auth: "c1", staffLevel: 4 });
    assert.equal(staff.queued, true);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].windows[0].endTime, 80);
  });
});

describe("gifClipWebhook", () => {
  it("troca /stats por /gif-clip e pelos atalhos de replay", () => {
    const stats = "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats";
    assert.equal(
      gifClipUrlFromStats(stats),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/gif-clip"
    );
    assert.equal(
      replayUploadUrlFromStats(stats),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/gif-clip/replay-upload"
    );
    assert.equal(
      replayCompleteUrlFromStats(stats),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/gif-clip/replay"
    );
  });

  it("sobe o rec e só depois confirma as janelas", async () => {
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body });
      if (String(url).endsWith("/replay-upload")) {
        return { ok: true, status: 200, json: async () => ({ uploadUrl: "https://s3/put", key: "replays/x4/a.hbr2" }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const rec = new Uint8Array([9, 8]);
    const res = await uploadReplayAndEnqueue(
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats",
      "k",
      { recording: rec, roomLabel: "x4", windows: [{ endTime: 40, requesters: [{ id: 1, name: "A" }] }] },
      { fetchFn }
    );
    assert.equal(res.ok, true);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[1].method, "PUT");
    assert.equal(calls[1].body, rec);
    assert.equal(calls[2].method, "POST");
    assert.equal(JSON.parse(calls[2].body).key, "replays/x4/a.hbr2");
    assert.equal(JSON.parse(calls[2].body).windows[0].endTime, 40);
  });
});
