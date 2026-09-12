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
      { id: 1, name: "Red", team: 1 },
      { id: 2, name: "Blue", team: 2 },
    ],
    getPlayerDiscProperties: (id) => ({ x: id * 20, y: 8 }),
  };
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

  it("abre janela, junta até 5 e dispara um clip", async () => {
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
    clip.request({ id: 4, name: "D" }, { auth: "a4" });
    const fifth = clip.request({ id: 5, name: "E" }, { auth: "a5" });
    assert.equal(fifth.ok, true);
    assert.equal(fifth.count, 5);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].requesters.length, 5);
    assert.ok(posts[0].frames.length >= MIN_FRAMES);
    if (scheduled) scheduled();
  });

  it("respeita cooldown de 2 min por pessoa e 3 min da sala", () => {
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
    clip.finishWindow();
    t += 1_000;
    assert.equal(clip.request({ id: 2, name: "Blue" }, { auth: "a2" }).reason, "room-cd");
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "player-cd");
    t += PLAYER_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).reason, "room-cd");
    t += ROOM_CD_MS;
    assert.equal(clip.request({ id: 1, name: "Red" }, { auth: "a1" }).opened, true);
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
