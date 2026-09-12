const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createGifClip, TICKS_PER_SAMPLE, MIN_FRAMES, PLAYER_CD_MS, ROOM_CD_MS } = require("../src/room/gifClip");
const { gifClipUrlFromStats } = require("../src/haxbook/gifClipWebhook");

function fillFrames(clip, n = MIN_FRAMES) {
  for (let i = 0; i < n * TICKS_PER_SAMPLE; i++) clip.sample();
}

function mockRoom() {
  return {
    getScores: () => ({ red: 1, blue: 0, time: 42 }),
    getBallPosition: () => ({ x: 10, y: -4 }),
    getPlayerList: () => [
      { id: 1, name: "Red", team: 1, avatar: "><" },
      { id: 2, name: "Blue", team: 2, avatar: "B" },
    ],
    getPlayerDiscProperties: (id) => ({ x: id * 20, y: 8 }),
  };
}

function waitFlush() {
  return new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));
}

describe("gifClip", () => {
  it("amostra 10 Hz e guarda anel de 15s sem crescer", () => {
    const clip = createGifClip({ room: mockRoom(), canClip: () => true });
    for (let i = 0; i < 5; i++) assert.equal(clip.sample(), false);
    assert.equal(clip.sample(), true);
    assert.equal(clip.frameCount(), 1);
    fillFrames(clip, 200);
    assert.equal(clip.frameCount(), 150);
  });

  it("só gera no 5º pedido de pessoas diferentes", async () => {
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
    fillFrames(clip);
    const a = clip.request({ id: 1, name: "Red" }, { auth: "a1" });
    assert.equal(a.opened, true);
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "already");
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    const fourth = clip.request({ id: 4, name: "D" }, { auth: "a4" });
    assert.equal(fourth.count, 4);
    await waitFlush();
    assert.equal(posts.length, 0);
    const fifth = clip.request({ id: 5, name: "E" }, { auth: "a5" });
    assert.equal(fifth.ok, true);
    assert.equal(fifth.count, 5);
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].requesters.length, 5);
    assert.ok(posts[0].frames.length >= MIN_FRAMES);
    assert.equal(posts[0].frames.at(-1).bx, 10);
    if (scheduled) scheduled();
    await waitFlush();
    assert.equal(posts.length, 1);
  });

  it("congela os 15s anteriores no primeiro !gif, não o que vem depois", async () => {
    const room = mockRoom();
    let ballX = 10;
    room.getBallPosition = () => ({ x: ballX, y: -4 });
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
    fillFrames(clip, 40);
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
    ballX = 999;
    fillFrames(clip, 40);
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    clip.request({ id: 5, name: "E" }, { auth: "a5" });
    await waitFlush();
    assert.equal(posts.length, 1);
    assert.ok(posts[0].frames.every((frame) => frame.bx === 10));
    assert.equal(posts[0].score.time, 42);
    assert.equal(posts[0].stadium, "x4");
    assert.deepEqual(posts[0].kits.red.colors, [0xe56e56]);
    assert.equal(posts[0].players[0].avatar, "><");
    assert.equal(posts[0].players[1].avatar, "B");
  });

  it("cancela sem gerar se a janela acaba sem 5 pessoas", async () => {
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
    fillFrames(clip);
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    assert.equal(clip.windowCount(), 2);
    scheduled();
    await waitFlush();
    assert.equal(posts.length, 0);
    assert.equal(clip.windowCount(), 0);
    assert.ok(announces.some((m) => /cancelado/i.test(m)));
    const again = clip.request({ id: 1, name: "Red" }, { auth: "a1" });
    assert.equal(again.opened, true);
    assert.equal(again.reason, undefined);
  });

  it("respeita cooldown de 2 min por pessoa e 3 min da sala só depois de gerar", async () => {
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
    fillFrames(clip);
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
    t += 1_000;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "already");
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    assert.equal(clip.request({ id: 5, name: "E" }, { auth: "a5" }).count, 5);
    await waitFlush();
    t += 1_000;
    assert.equal(clip.request({ id: 6, name: "F" }, { auth: "a6" }).reason, "room-cd");
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "player-cd");
    t += PLAYER_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "room-cd");
    t += ROOM_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
  });

  it("aceita stadium e kits custom no freeze", async () => {
    const posts = [];
    const clip = createGifClip({
      room: mockRoom(),
      now: () => 1_000,
      canClip: () => true,
      stadium: () => "futrua",
      kits: () => ({
        red: { angle: 60, text: 0xffffff, colors: [0x000000], emoji: "🐋" },
        blue: { angle: 0, text: 0x000000, colors: [0xffffff] },
      }),
      postClip: async (payload) => {
        posts.push(payload);
        return { ok: true };
      },
      schedule: () => 1,
      clearSchedule: () => {},
      announce: () => {},
    });
    fillFrames(clip);
    clip.request({ id: 1, name: "Red" }, { auth: "a1" });
    clip.request({ id: 2, name: "Blue" }, { auth: "a2" });
    clip.request({ id: 3, name: "C" }, { auth: "a3" });
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    clip.request({ id: 5, name: "E" }, { auth: "a5" });
    await waitFlush();
    assert.equal(posts[0].stadium, "futrua");
    assert.equal(posts[0].kits.red.emoji, "🐋");
    assert.deepEqual(posts[0].kits.blue.colors, [0xffffff]);
  });

  it("recusa treino e clip curto", () => {
    const clip = createGifClip({ room: mockRoom(), canClip: () => false });
    fillFrames(clip);
    assert.equal(clip.request({ id: 1, name: "Red" }).reason, "not-live");
    const live = createGifClip({ room: mockRoom(), canClip: () => true });
    assert.equal(live.request({ id: 1, name: "Red" }).reason, "empty");
  });
});

describe("gifClipWebhook", () => {
  it("troca /stats por /gif-clip", () => {
    assert.equal(
      gifClipUrlFromStats("https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/stats"),
      "https://api.haxbook.com.br/api/webhooks/servers/COMUNISMO/rooms/comunax4/gif-clip"
    );
  });
});
