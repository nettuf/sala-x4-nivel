process.env.HAXBALL_TOKEN = process.env.HAXBALL_TOKEN || "thr-test";

const config = require("../../src/config");
const { createRoom } = require("../../src/room/createRoom");
const { TEAM } = require("../../src/room/choose");

/**
 * Sala real (createRoom) rodando sobre um Haxball de mentira.
 *
 * Só as ações feitas pelo teste (admin/jogador) disparam eventos — movimentos
 * internos do bot apenas mudam o estado, como no headless, evitando recursão.
 */
function bootRoom() {
  const players = [];
  const announcements = [];
  const kicks = [];
  const pauses = [];
  let scores = null;
  let nextId = 1;

  const snapshot = (p) => ({ ...p });

  const room = {
    getPlayerList: () => players.map(snapshot),
    getScores: () => scores,
    getBallPosition: () => ({ x: 0, y: 0 }),
    getDiscProperties: () => ({ xspeed: 0, yspeed: 0 }),
    getPlayerDiscProperties: (id) => discs.get(id) || null,
    setPlayerTeam: (id, team) => {
      const p = players.find((x) => x.id === id);
      if (p) p.team = team;
    },
    setPlayerAdmin: () => {},
    sendAnnouncement: (msg, to, color) => announcements.push({ msg, to, color }),
    kickPlayer: (id, reason) => {
      kicks.push({ id, reason });
      const i = players.findIndex((p) => p.id === id);
      if (i >= 0) players.splice(i, 1);
    },
    clearBan: () => {},
    setCustomStadium: () => {},
    setDefaultStadium: () => {},
    setTeamColors: () => {},
    setScoreLimit: () => {},
    setTimeLimit: () => {},
    setTeamsLock: () => {},
    setKickRateLimit: () => {},
    startRecording: () => {},
    stopRecording: () => new Uint8Array([1]),
    startGame: () => {
      scores = { red: 0, blue: 0, time: 0, scoreLimit: config.scoreLimit, timeLimit: config.timeLimit * 60 };
    },
    stopGame: () => {
      scores = null;
    },
    pauseGame: (on) => {
      pauses.push(!!on);
      if (on) room.onGamePause?.();
      else room.onGameUnpause?.();
    },
  };

  /** @type {Map<number, {x:number,y:number}>} */
  const discs = new Map();
  const handles = createRoom(() => room);

  function addPlayer(team = TEAM.SPEC, name) {
    const id = nextId++;
    const player = { id, name: name || `P${id}`, team, auth: `auth${id}`, conn: `conn${id}` };
    players.push(player);
    discs.set(id, { x: id * 10, y: 0 });
    return player;
  }

  function startMatch({ competitive = true } = {}) {
    handles.match.start({ competitive });
  }

  const host = {
    room,
    handles,
    players,
    announcements,
    kicks,
    pauses,
    discs,
    addPlayer,
    startMatch,
    live: () => scores,
    find: (id) => players.find((p) => p.id === id),
    /** Admin arrastou alguém para outro time pelo painel do Haxball. */
    adminMove(target, team, admin) {
      const p = players.find((x) => x.id === target.id);
      p.team = team;
      room.onPlayerTeamChange(snapshot(p), snapshot(admin));
    },
    adminPause(on) {
      pauses.push(!!on);
      if (on) room.onGamePause();
      else room.onGameUnpause();
    },
    adminKick(target, admin) {
      const i = players.findIndex((p) => p.id === target.id);
      const gone = players[i];
      if (i >= 0) players.splice(i, 1);
      room.onPlayerLeave(snapshot(gone));
      room.onPlayerKicked(snapshot(gone), "expulso", false, snapshot(admin));
    },
    /** Jogador fechou o navegador (sem admin envolvido). */
    quit(target) {
      const i = players.findIndex((p) => p.id === target.id);
      if (i < 0) return null;
      const gone = players[i];
      players.splice(i, 1);
      room.onPlayerLeave(snapshot(gone));
      return gone;
    },
    chat(target, message) {
      const live = players.find((p) => p.id === target.id) || target;
      return room.onPlayerChat(snapshot(live), message);
    },
    /**
     * Deixa os jogadores parados há `idleMs` e mexe o boneco de `moving`,
     * do jeito que o headless faria pelos ticks. Pode ser chamado várias
     * vezes: o boneco de quem mexe sempre avança de posição.
     */
    idle(all, { moving = [], idleMs = config.afkActionMs + 1000 } = {}) {
      const past = Date.now() - idleMs;
      for (const p of all) handles.afk.touch(p.id, past);
      handles.afk.sampleMovement(past);
      for (const p of moving) {
        const at = discs.get(p.id) || { x: p.id * 10, y: 0 };
        discs.set(p.id, { x: at.x + 80, y: at.y });
      }
      handles.afk.sampleMovement(Date.now());
    },
    lastSpecList() {
      return [...announcements].reverse().find((a) => /^Specs:/.test(a.msg));
    },
    lastPause() {
      return pauses[pauses.length - 1];
    },
    said(re, to) {
      return announcements.some((a) => re.test(a.msg) && (to === undefined || a.to === to));
    },
    teamCount(team) {
      return players.filter((p) => p.team === team).length;
    },
    cleanup() {
      handles.afk.stop();
      handles.chatLog?.stop();
      handles.health?.stop();
      handles.choose.deactivate();
    },
  };

  return host;
}

function fill4v4(host) {
  const team = [];
  for (let i = 0; i < 4; i++) team.push(host.addPlayer(TEAM.RED));
  for (let i = 0; i < 4; i++) team.push(host.addPlayer(TEAM.BLUE));
  return team;
}

/**
 * Choose ligado com um jogador sobrando: assim a sala continua com gente
 * suficiente para o 4v4 mesmo que alguém fique AFK ou saia no meio.
 */
function startChoose(host) {
  const all = [];
  for (let i = 0; i < 4; i++) all.push(host.addPlayer(TEAM.RED));
  all.push(host.addPlayer(TEAM.BLUE));
  for (let i = 0; i < 5; i++) all.push(host.addPlayer(TEAM.SPEC));
  host.handles.choose.continueFromField();
  return all;
}

const settle = () => new Promise((r) => setTimeout(r, 150));

module.exports = { bootRoom, fill4v4, startChoose, settle, TEAM, config };
