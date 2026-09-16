const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("cargo no spec", () => {
  it("ida ao spec relê só quem entrou; não varre a sala", () => {
    const roomSrc = fs.readFileSync(path.join(__dirname, "../src/room/createRoom.js"), "utf8");
    const teamChange = roomSrc.split("room.onPlayerTeamChange")[1]?.split("room.onPlayerActivity")[0] || "";
    assert.ok(teamChange.includes("refreshEnteringSpec"), "relê o jogador que foi pro spec");
    assert.match(teamChange, /team === TEAM\.SPEC[\s\S]*refreshEnteringSpec/);
    assert.equal(
      /for\s*\(\s*const p of room\.getPlayerList/.test(teamChange),
      false,
      "não relê todo mundo"
    );
  });
});
