const config = require("../../src/config");
const { createAfkTracker, TICK_HZ, BUMP_EPS } = require("../../src/room/afk");

function mockAfkRoom(playerCount = 4) {
  const players = [];
  for (let i = 1; i <= playerCount; i++) {
    players.push({ id: i, name: `P${i}`, team: i <= 2 ? i : 0, auth: `a${i}` });
  }
  const announcements = [];
  const room = {
    announcements,
    getPlayerList: () => players,
    sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    kickPlayer: () => {},
    setPlayerTeam: (id, team) => {
      const p = players.find((x) => x.id === id);
      if (p) p.team = team;
    },
    getScores: () => ({ red: 0, blue: 0, time: 10 }),
    pauseGame: () => {},
    getPlayerDiscProperties: () => null,
  };
  return { room, players, announcements };
}

/** Simula ticks de física com discos controlados. */
function runPhysicsTicks(afk, discs, { t0, ticks, msPerTick = 1000 / TICK_HZ, onTick }) {
  for (let i = 0; i < ticks; i++) {
    const wall = t0 + Math.floor(i * msPerTick);
    onTick?.(i, wall);
    afk.noteGameTick(wall);
  }
}

function withAfkTimes(fn) {
  const prev = { warn: config.afkWarnMs, act: config.afkActionMs };
  config.afkWarnMs = 12000;
  config.afkActionMs = 16000;
  try {
    return fn();
  } finally {
    config.afkWarnMs = prev.warn;
    config.afkActionMs = prev.act;
  }
}

module.exports = {
  mockAfkRoom,
  runPhysicsTicks,
  withAfkTimes,
  TICK_HZ,
  BUMP_EPS,
};
