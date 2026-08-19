process.env.HAXBALL_TOKEN = process.env.HAXBALL_TOKEN || "thr-test";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");
const { createRoom } = require("../src/room/createRoom");
const { TEAM } = require("../src/room/choose");

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

  return {
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
    lastSpecList() {
      return [...announcements].reverse().find((a) => /^Specs:/.test(a.msg));
    },
    cleanup() {
      handles.afk.stop();
    },
  };
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

describe("AFK do jogador parado", () => {
  it("parado em campo cai pro spec e fica AFK; quem mexe continua jogando", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const parado = all[0];
    host.startMatch();

    // Todos parados há 21s; em seguida só os outros movem o boneco.
    const past = Date.now() - config.afkActionMs - 1000;
    for (const p of all) host.handles.afk.touch(p.id, past);
    host.handles.afk.sampleMovement(past);
    for (const p of all.slice(1)) host.discs.set(p.id, { x: p.id * 10 + 60, y: 0 });
    host.handles.afk.sampleMovement(Date.now());

    host.handles.afk.tick(Date.now());

    assert.equal(host.find(parado.id).team, TEAM.SPEC, "parado devia ir pro spec");
    assert.equal(host.handles.afk.isAfk(parado.id), true);
    assert.equal(host.handles.afk.isAfk(all[1].id), false, "quem mexeu continua ativo");
    assert.equal(host.kicks.length, 0, "sala com vaga não kicka por AFK");
    assert.ok(host.announcements.some((a) => /parado/i.test(a.msg)));
    host.cleanup();
  });

  it("sem reserva no spec, o 4v3 vira 3v3 e o jogo segue", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();

    host.handles.afk.setAfk(all[0], true);

    const red = host.players.filter((p) => p.team === TEAM.RED).length;
    const blue = host.players.filter((p) => p.team === TEAM.BLUE).length;
    assert.equal(red, 3);
    assert.equal(blue, 3, "o time maior devolve um jogador em vez de jogar 3v4");
    assert.ok(host.live(), "o jogo não é interrompido");
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("AFK some da lista do capitão sozinho e o número passa para o próximo", async () => {
    const host = bootRoom();
    const all = startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const specs = host.handles.choose.list().specReady;
    assert.match(host.lastSpecList().msg, new RegExp(`${specs[0].name}\\[1\\]`));

    host.handles.afk.setAfk(host.find(specs[0].id), true);
    await settle();

    const msg = host.lastSpecList().msg;
    assert.ok(!msg.includes(`${specs[0].name}[`), "AFK não pode aparecer na lista");
    assert.match(msg, new RegExp(`${specs[1].name}\\[1\\]`), "o próximo herda o número 1");
    assert.equal(host.lastSpecList().to, cap.id, "lista vai só para o capitão");
    assert.equal(all.length, 10);
    host.cleanup();
  });

  it("capitão não consegue escolher quem está AFK", async () => {
    const host = bootRoom();
    startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const specs = host.handles.choose.list().specReady;
    const afkOne = specs[0];
    const proximo = specs[1];

    host.handles.afk.setAfk(host.find(afkOne.id), true);
    await settle();
    host.handles.choose.handleCaptainChat(cap, "1");

    assert.equal(host.find(afkOne.id).team, TEAM.SPEC, "AFK não entra por pick");
    assert.equal(host.find(proximo.id).team, cap.team, "o número 1 é o primeiro não-AFK");
    host.cleanup();
  });

  it("!afk tira o AFK e ele volta para a fila do pick", async () => {
    const host = bootRoom();
    startChoose(host);
    const jogador = host.find(host.handles.choose.list().specReady[0].id);

    host.handles.afk.setAfk(jogador, true);
    await settle();
    assert.equal(host.handles.afk.isAfk(jogador.id), true);
    assert.ok(!host.lastSpecList().msg.includes(`${jogador.name}[`));

    await host.room.onPlayerChat(host.find(jogador.id), "!afk");
    await settle();

    assert.equal(host.handles.afk.isAfk(jogador.id), false);
    assert.ok(host.lastSpecList().msg.includes(`${jogador.name}[`), "volta para a lista");
    host.cleanup();
  });
});

describe("ações de admin", () => {
  it("admin pausa: ninguém vira AFK nem toma kick enquanto está pausado", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    const now = Date.now();
    for (const p of all) host.handles.afk.touch(p.id, now);

    host.adminPause(true);
    host.handles.afk.tick(now + config.afkActionMs * 3);

    assert.ok(all.every((p) => host.find(p.id).team !== TEAM.SPEC), "pausado não gera AFK");
    assert.equal(host.kicks.length, 0);
    host.cleanup();
  });

  it("bot não desfaz a pausa do admin ao mandar um AFK para o spec", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    host.startMatch();
    host.adminPause(true);
    const pausesBefore = host.pauses.length;

    host.handles.afk.setAfk(all[0], true);

    assert.equal(host.find(all[0].id).team, TEAM.SPEC);
    assert.equal(host.pauses.length, pausesBefore, "não pode pausar/despausar por cima do admin");
    host.cleanup();
  });

  it("admin puxando AFK para o time: o bot devolve e avisa o admin", () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const admin = host.addPlayer();
    host.handles.match.start({ competitive: true });
    const afkOne = host.addPlayer();
    host.handles.afk.setAfk(afkOne, true);

    host.adminMove(afkOne, TEAM.RED, admin);

    assert.equal(host.find(afkOne.id).team, TEAM.SPEC, "AFK não vai pra partida");
    assert.ok(
      host.announcements.some((a) => a.to === admin.id && /AFK/.test(a.msg)),
      "admin recebe o aviso"
    );
    assert.equal(host.kicks.length, 0);
    assert.equal(all.length, 8);
    host.cleanup();
  });

  it("admin tirando jogador do time no 4v4 não vira ragequit nem kick", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const admin = host.addPlayer();
    host.startMatch();

    host.adminMove(all[0], TEAM.SPEC, admin);
    await new Promise((r) => setTimeout(r, 150));

    assert.equal(host.kicks.length, 0);
    assert.ok(!host.announcements.some((a) => /abandon/i.test(a.msg)), "sem acusação de ragequit");
    host.cleanup();
  });

  it("admin expulsando jogador não conta ragequit", async () => {
    const host = bootRoom();
    const all = fill4v4(host);
    const admin = host.addPlayer();
    host.startMatch();

    host.adminKick(all[0], admin);
    await new Promise((r) => setTimeout(r, 150));

    assert.ok(!host.announcements.some((a) => /abandonou|ragequit/i.test(a.msg)));
    host.cleanup();
  });

  it("saída de spec durante o choose só atualiza a lista do capitão", async () => {
    const host = bootRoom();
    startChoose(host);
    const cap = host.handles.choose.currentCaptain();
    const specs = host.handles.choose.list().specReady;
    const saiu = specs[0];
    const i = host.players.findIndex((p) => p.id === saiu.id);
    host.players.splice(i, 1);
    host.room.onPlayerLeave({ ...saiu });
    await new Promise((r) => setTimeout(r, 120));

    const msg = host.lastSpecList().msg;
    assert.ok(!msg.includes(`${saiu.name}[`), "quem saiu some da lista");
    assert.match(msg, new RegExp(`${specs[1].name}\\[1\\]`));
    assert.equal(host.lastSpecList().to, cap.id);
    host.cleanup();
  });
});
