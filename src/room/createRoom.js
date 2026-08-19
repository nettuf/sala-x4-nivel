const config = require("../config");
const { connToIp } = require("../utils");
const { upsertPlayer, getAdmin } = require("../db/players");
const { findActiveBan } = require("../db/bans");
const { notifyJoin } = require("../discord/webhook");
const { applyStadium } = require("./maps");
const { createAfkTracker } = require("./afk");
const { warmupBalanceAndStart } = require("./balance");
const { createChooseController, TEAM } = require("./choose");
const { createMatchController } = require("./match");
const { handleInGameLeave } = require("./leaveFlow");
const { applyJoinGuards } = require("./joinGuards");
const { createUniformManager } = require("./uniforms");
const { createStreakTracker, applyWinnerStays, shouldUseWinnerStays } = require("./streak");
const { createCommandHandler } = require("../commands");

function createRoom(HBInit) {
  const token = config.readToken();
  if (!token) {
    throw new Error("HAXBALL_TOKEN ausente. Envie via POST /token ou .env");
  }

  const room = HBInit({
    roomName: config.roomName,
    maxPlayers: config.maxPlayers,
    public: config.public,
    password: config.password || undefined,
    noPlayer: true,
    token,
    geo: { code: config.geo, lat: config.geoLat, lon: config.geoLon },
  });

  room.setScoreLimit(config.scoreLimit);
  room.setTimeLimit(config.timeLimit);
  room.setTeamsLock(true);
  try {
    room.setKickRateLimit(6, 0, 0);
  } catch {
    /* API antiga */
  }

  const ctx = {
    admins: new Map(),
    mutes: new Map(),
    titles: new Map(),
    afk: null,
    streak: null,
    uniforms: null,
  };

  const afk = createAfkTracker(room);
  ctx.afk = afk;
  const streak = createStreakTracker();
  ctx.streak = streak;
  const uniforms = createUniformManager(room);
  ctx.uniforms = uniforms;
  const match = createMatchController(room);
  const commands = createCommandHandler(room, ctx);

  const choose = createChooseController(room, {
    isExcluded: (p) => afk.isVoluntary(p.id),
    getStreakLabel: () => (streak.get() > 0 ? streak.label() : ""),
    onReadyToStart() {
      room.sendAnnouncement("4v4 pronto — iniciando!", null, 0x2ecc71, "bold", 2);
      applyStadium(room, config.teamSize * 2);
      match.start();
    },
  });

  function refreshLobby() {
    const count = room.getPlayerList().filter((p) => p.id !== 0).length;
    applyStadium(room, count);

    // Partida em andamento: quem entra fica no spec até o fim
    if (room.getScores() || match.isRunning()) return;

    if (count >= config.teamSize * 2) {
      if (choose.isActive()) {
        choose.onPlayerJoin();
        return;
      }
      choose.tryStartChoose();
    } else {
      choose.deactivate();
      warmupBalanceAndStart(room, match);
    }
  }

  room.onRoomLink = (link) => {
    console.log("[sala-x4] link:", link);
  };

  room.onPlayerJoin = async (player) => {
    afk.touch(player.id);

    const auth = player.auth || null;
    const conn = player.conn || null;
    const ip = connToIp(conn);

    const ban = await findActiveBan({ auth, conn });
    if (ban) {
      const until = ban.ends_at ? ` até ${ban.ends_at}` : " (permanente)";
      room.kickPlayer(player.id, `Banido${until}: ${ban.reason || ""}`.trim(), false);
      return;
    }

    // Ghost kick (auth duplicada) e limite por conexão
    const guard = applyJoinGuards(room, player);
    if (guard === "conn-limit") return;

    await upsertPlayer({ auth, nick: player.name, conn, ip });

    const admin = auth ? await getAdmin(auth) : null;
    if (admin) {
      ctx.admins.set(player.id, admin);
      commands.applyAdminLook(player, admin);
    }

    const title = await commands.loadTitleForPlayer(player);
    room.sendAnnouncement(
      `Bem-vindo, ${title.emblem} ${player.name}! !help · !cargos`,
      player.id,
      title.color,
      "normal",
      1
    );

    notifyJoin({
      playerId: player.id,
      nick: player.name,
      auth,
      conn,
      ip,
      admin,
      title,
    }).catch(() => {});

    refreshLobby();
  };

  room.onPlayerLeave = (player) => {
    afk.remove(player.id);
    ctx.admins.delete(player.id);
    ctx.mutes.delete(player.id);
    ctx.titles.delete(player.id);

    const inGame = !!(room.getScores() || match.isRunning());
    if (inGame && !choose.isActive()) {
      const result = handleInGameLeave(room, match, {
        isExcluded: (p) => afk.isVoluntary(p.id),
      });
      // warmup-reset / ended: onGameStop → refreshLobby; ragequit também
      if (result === "warmup-reset" || result === "ended") {
        setTimeout(refreshLobby, 300);
      }
      return;
    }

    choose.onPlayerLeave();
    setTimeout(refreshLobby, 200);
  };

  room.onPlayerActivity = (player) => {
    afk.touch(player.id);
  };

  room.onPlayerKicked = (kickedPlayer, reason, ban, byPlayer) => {
    afk.remove(kickedPlayer.id);
    if (byPlayer) afk.touch(byPlayer.id);

    // Kick nativo por admin sem cargo: desfaz o ban da sala (ban real é via !ban)
    if (ban && byPlayer) {
      const admin = ctx.admins.get(byPlayer.id);
      if (!admin) {
        try {
          room.clearBan(kickedPlayer.id);
        } catch {
          /* ignore */
        }
      }
    }
  };

  room.onGamePause = () => {
    afk.setPaused(true);
  };

  room.onGameUnpause = () => {
    afk.setPaused(false);
  };

  room.onPlayerTeamChange = (changedPlayer, byPlayer) => {
    if (afk.isVoluntary(changedPlayer.id) && changedPlayer.team !== 0) {
      room.setPlayerTeam(changedPlayer.id, 0);
      if (byPlayer) {
        room.sendAnnouncement(
          `${changedPlayer.name} está AFK e não pode ir pro time.`,
          byPlayer.id,
          0xe67e22,
          "normal",
          1
        );
      }
      return;
    }

    if (byPlayer) afk.touch(byPlayer.id);
    // Admin mexeu nos times no choose → reavalia sem resetar o que já foi escolhido
    if (byPlayer && choose.isActive()) choose.onTeamChange();
  };

  room.onPlayerBallKick = (player) => {
    afk.touch(player.id);
    match.onBallKick(player);
  };

  room.onTeamGoal = (team) => {
    match.onTeamGoal(team);
  };

  room.onPlayerChat = async (player, message) => {
    afk.touch(player.id);

    const muted = await commands.isMuted(player);
    if (muted) {
      room.sendAnnouncement(
        `Você está mutado até ${new Date(muted.endsAt).toLocaleString("pt-BR")}.`,
        player.id,
        0xe67e22,
        "bold",
        2
      );
      return false;
    }

    if (choose.handleCaptainChat(player, message)) return false;

    const handled = await commands.handle(player, message);
    if (handled) return false;

    const { line, color } = commands.formatPlayerChat(player, message);
    room.sendAnnouncement(line, null, color, "normal", 1);
    return false;
  };

  room.onTeamVictory = () => {
    match.markVictory();
    setTimeout(() => {
      room.stopGame();
    }, 2500);
  };

  room.onGameTick = () => {
    match.onTick();
  };

  room.onGameStop = async () => {
    const result = await match.finish();
    const count = room.getPlayerList().filter((p) => p.id !== 0).length;

    if (result && shouldUseWinnerStays(count, result.valid, result.winner)) {
      const { mode } = applyWinnerStays(room, result.winner, streak, {
        isExcluded: (p) => afk.isVoluntary(p.id),
      });
      uniforms.onWinnerStays(result.winner);
      if (mode === "choose") {
        setTimeout(() => choose.continueFromField(), 400);
        return;
      }
      // empate: reset → choose normal
      setTimeout(refreshLobby, 800);
      return;
    }

    if (result?.valid && count >= 2 && count < config.teamSize * 2) {
      if (result.winner === TEAM.BLUE) {
        const players = room.getPlayerList().filter((p) => p.id !== 0);
        for (const p of players) {
          if (p.team === TEAM.RED) room.setPlayerTeam(p.id, TEAM.BLUE);
          else if (p.team === TEAM.BLUE) room.setPlayerTeam(p.id, TEAM.RED);
        }
      }
      if (result.winner === TEAM.RED || result.winner === TEAM.BLUE) {
        streak.recordWin(result.winner);
      } else {
        streak.reset();
      }
    } else if (!result?.valid) {
      streak.reset();
    }

    setTimeout(refreshLobby, 1200);
  };

  applyStadium(room, 0);

  return { room, afk, match, choose, streak, uniforms };
}

module.exports = { createRoom };
