const config = require("../config");
const { connToIp } = require("../utils");
const { upsertPlayer, getAdmin } = require("../db/players");
const { findActiveBan } = require("../db/bans");
const { notifyJoin } = require("../discord/webhook");
const { applyStadium } = require("./maps");
const { createAfkTracker } = require("./afk");
const { createChooseController, TEAM } = require("./choose");
const { planCompetitiveRecovery } = require("./recovery");
const { createMatchController } = require("./match");
const { applyJoinGuards } = require("./joinGuards");
const { createUniformManager } = require("./uniforms");
const { planWarmup, applyWarmupMoves } = require("./warmupFlow");
const { createStreakTracker, applyWinnerStays, shouldUseWinnerStays } = require("./streak");
const { createCommandHandler } = require("../commands");
const { detectRageQuit, isChooseToken } = require("../gameLogic");

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
    match: null,
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
  ctx.match = match;
  const commands = createCommandHandler(room, ctx);

  const choose = createChooseController(room, {
    isExcluded: (p) => afk.isVoluntary(p.id),
    getStreakLabel: () => (streak.get() > 0 ? streak.label() : ""),
    getStreak: () => streak.get(),
    deferAfterTeamChange(callback) {
      const timer = setTimeout(callback, 100);
      if (typeof timer.unref === "function") timer.unref();
    },
    onReadyToStart() {
      room.sendAnnouncement("4v4 pronto — iniciando!", null, 0x2ecc71, "bold", 2);
      applyStadium(room, config.teamSize * 2);
      match.start({ competitive: true });
    },
  });

  let lobbyRevision = 0;
  const slowChat = new Set();

  function stopCurrentGame({ preserveMatch = false } = {}) {
    if (!preserveMatch) match.cancelRecordingOnly();
    if (room.getScores()) room.stopGame();
  }

  function laterForCurrentLobby(callback, delay = 250) {
    const revision = lobbyRevision;
    const timer = setTimeout(() => {
      if (revision === lobbyRevision) callback();
    }, delay);
    if (typeof timer.unref === "function") timer.unref();
  }

  function startWarmupIfPossible() {
    if (room.getScores() || match.isRunning()) return;
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    const plan = planWarmup(players, {
      isExcluded: (p) => afk.isVoluntary(p.id),
    });
    if (!plan.shouldStart || plan.replacementTeam) return;
    match.start({ competitive: false });
  }

  function refreshLobby() {
    lobbyRevision += 1;
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    const eligibleCount = players.filter((p) => !afk.isVoluntary(p.id)).length;

    // O 4v4 oficial não é interrompido por uma entrada; o novo fica no spec.
    // Reposição/choose pausado só atualiza a lista do capitão.
    if (match.isCompetitive()) {
      if (choose.isActive()) choose.onPlayerJoin();
      return;
    }

    if (eligibleCount >= config.teamSize * 2) {
      if (choose.isActive() && !choose.isReplacement()) {
        choose.onPlayerJoin();
        return;
      }
      stopCurrentGame();
      choose.deactivate();
      applyStadium(room, players.length);
      laterForCurrentLobby(() => choose.tryStartChoose());
      return;
    }

    const plan = planWarmup(players, {
      isExcluded: (p) => afk.isVoluntary(p.id),
    });

    if (!plan.eligibleCount) {
      choose.deactivate();
      stopCurrentGame();
      applyStadium(room, players.length);
      return;
    }

    if (plan.replacementTeam) {
      stopCurrentGame();
      applyWarmupMoves(room, plan);
      applyStadium(room, players.length);
      if (choose.isReplacement()) {
        choose.onPlayerJoin();
      } else {
        choose.deactivate();
        choose.startReplacement(plan.replacementTeam, () => refreshLobby());
      }
      return;
    }

    if (choose.isActive()) choose.deactivate();

    if (plan.moves.length || !match.isRunning() || !room.getScores()) {
      stopCurrentGame();
      applyWarmupMoves(room, plan);
      applyStadium(room, players.length);
      laterForCurrentLobby(startWarmupIfPossible);
      return;
    }

    // Número ímpar: o único spec aguarda sem reiniciar o jogo atual.
    applyStadium(room, players.length);
  }

  function startCompetitiveFromCurrentField() {
    if (room.getScores() || match.isRunning()) return;
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    const red = players.filter((p) => p.team === TEAM.RED);
    const blue = players.filter((p) => p.team === TEAM.BLUE);
    if (red.length !== config.teamSize || blue.length !== config.teamSize) {
      refreshLobby();
      return;
    }
    applyStadium(room, players.length);
    match.start({ competitive: true });
  }

  function recoverCompetitiveLineup() {
    const players = room
      .getPlayerList()
      .filter((p) => p.id !== 0 && !afk.isVoluntary(p.id));
    const red = players.filter((p) => p.team === TEAM.RED);
    const blue = players.filter((p) => p.team === TEAM.BLUE);
    const specs = players.filter((p) => p.team === TEAM.SPEC);
    if (red.length === config.teamSize && blue.length === config.teamSize) {
      return;
    }

    const live = !!room.getScores();
    const plan = planCompetitiveRecovery({
      redCount: red.length,
      blueCount: blue.length,
      specCount: specs.length,
      teamSize: config.teamSize,
      live,
    });

    if (plan.action === "none") return;

    if (!live) {
      lobbyRevision += 1;
      stopCurrentGame();
    }

    if (plan.action === "fill-pairs") {
      for (let index = 0; index < plan.pairs * 2; index += 2) {
        room.setPlayerTeam(specs[index].id, TEAM.RED);
        room.setPlayerTeam(specs[index + 1].id, TEAM.BLUE);
        match.addToLineup(specs[index], TEAM.RED);
        match.addToLineup(specs[index + 1], TEAM.BLUE);
      }
      if (plan.restart) laterForCurrentLobby(startCompetitiveFromCurrentField);
      return;
    }

    if (plan.action === "fill-one") {
      room.setPlayerTeam(specs[0].id, plan.targetTeam);
      match.addToLineup(specs[0], plan.targetTeam);
      if (live) {
        room.sendAnnouncement(
          `${specs[0].name} entrou no time ${plan.targetTeam === TEAM.RED ? "vermelho" : "azul"} — jogo segue.`,
          null,
          0x2ecc71,
          "bold",
          1
        );
        return;
      }
      laterForCurrentLobby(startCompetitiveFromCurrentField);
      return;
    }

    if (plan.action === "choose") {
      const startChoose = () => {
        if (live) {
          try {
            room.pauseGame(true);
          } catch {
            /* ignore */
          }
        }
        choose.deactivate();
        choose.startReplacement(plan.targetTeam, ({ chosen, cancelled } = {}) => {
          if (cancelled || !chosen) {
            if (live) {
              try {
                room.pauseGame(false);
              } catch {
                /* ignore */
              }
            }
            recoverCompetitiveLineup();
            return;
          }
          match.addToLineup(chosen, plan.targetTeam);
          if (live) {
            try {
              room.pauseGame(false);
            } catch {
              /* ignore */
            }
            return;
          }
          laterForCurrentLobby(startCompetitiveFromCurrentField);
        });
      };
      if (live) startChoose();
      else laterForCurrentLobby(startChoose);
      return;
    }

    if (live) {
      lobbyRevision += 1;
      stopCurrentGame();
    }
    laterForCurrentLobby(refreshLobby);
  }

  afk.setOnStateChange(({ type, player, previousTeam }) => {
    if (type === "kick") return; // onPlayerKicked/onPlayerLeave cuidam disso.

    if (type === "auto-afk" && previousTeam !== TEAM.SPEC) {
      if (match.isCompetitive()) recoverCompetitiveLineup();
      else refreshLobby();
      return;
    }

    // !afk (permitido no spec/treino solo) e !back alteram a fila elegível.
    refreshLobby();
  });

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

  const pendingLeaves = new Map();

  function cleanupPlayer(player) {
    afk.remove(player.id);
    ctx.admins.delete(player.id);
    ctx.mutes.delete(player.id);
    ctx.titles.delete(player.id);
  }

  function processDeparture(player, { kicked = false } = {}) {
    if (choose.isActive()) {
      choose.onPlayerLeave();
      setTimeout(refreshLobby, 100);
      return;
    }

    if (match.isCompetitive()) {
      const rageReason = kicked ? null : match.rageQuitReason(player);
      if (rageReason) {
        room.sendAnnouncement(
          `🚨 Ragequit de ${player.name}: ${rageReason}. Partida encerrada.`,
          null,
          0xe74c3c,
          "bold",
          2
        );
        match.markVictory();
        setTimeout(() => room.stopGame(), 100);
        return;
      }

      if (!kicked) {
        const remaining = room
          .getPlayerList()
          .filter((p) => p.id !== 0 && !afk.isVoluntary(p.id));
        const classic = detectRageQuit({
          redCount: remaining.filter((p) => p.team === TEAM.RED).length,
          blueCount: remaining.filter((p) => p.team === TEAM.BLUE).length,
          scores: room.getScores(),
        });
        if (classic && remaining.length >= config.teamSize * 2) {
          room.sendAnnouncement(
            "🤖 Abandono detectado no fim do jogo. Partida encerrada.",
            null,
            0xe74c3c,
            "bold",
            2
          );
          match.markVictory();
          setTimeout(() => room.stopGame(), 100);
          return;
        }
      }

      recoverCompetitiveLineup();
      return;
    }

    if (match.isRunning() || room.getScores()) {
      lobbyRevision += 1;
      stopCurrentGame();
    }
    setTimeout(refreshLobby, 100);
  }

  room.onPlayerLeave = (player) => {
    cleanupPlayer(player);

    // onPlayerKicked vem logo após onPlayerLeave. O pequeno atraso impede
    // que kick de admin/AFK seja classificado como ragequit.
    const timer = setTimeout(() => {
      pendingLeaves.delete(player.id);
      processDeparture(player, { kicked: false });
    }, 75);
    pendingLeaves.set(player.id, { timer, player });
  };

  room.onPlayerActivity = (player) => {
    afk.touch(player.id);
  };

  room.onPlayerKicked = (kickedPlayer, reason, ban, byPlayer) => {
    const pending = pendingLeaves.get(kickedPlayer.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingLeaves.delete(kickedPlayer.id);
      processDeparture(pending.player, { kicked: true });
    }
    cleanupPlayer(kickedPlayer);
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
    choose.confirmTeamChange(changedPlayer);
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

    if (changedPlayer.team !== TEAM.SPEC) afk.touch(changedPlayer.id);
    if (byPlayer) afk.touch(byPlayer.id);
    if (match.isCompetitive() && changedPlayer.team !== TEAM.SPEC) {
      match.addToLineup(changedPlayer, changedPlayer.team);
    }
    // Admin mexeu nos times no choose → reavalia sem resetar o que já foi escolhido
    if (byPlayer && choose.isActive()) choose.onTeamChange();
    else if (byPlayer && !match.isCompetitive()) refreshLobby();
  };

  room.onPlayerBallKick = (player) => {
    afk.touch(player.id);
    match.onBallKick(player);
  };

  room.onTeamGoal = (team) => {
    afk.setCounting(false);
    match.onTeamGoal(team);
  };

  room.onPositionsReset = () => {
    match.notePositionsReset();
    afk.setCounting(true);
  };

  room.onGameStart = () => {
    afk.setCounting(true);
    afk.setPaused(false);
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

    if (choose.isActive() && !ctx.admins.has(player.id)) {
      const token = String(message || "").trim().split(/\s+/)[0];
      if (!String(message || "").startsWith("!") && !isChooseToken(token)) {
        if (slowChat.has(player.id)) return false;
        slowChat.add(player.id);
        const timer = setTimeout(() => slowChat.delete(player.id), 2000);
        if (typeof timer.unref === "function") timer.unref();
      }
    }

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

    if (result?.titleUnlocks?.length) {
      for (const u of result.titleUnlocks) {
        for (const t of u.titles) {
          const extra = u.equippedChanged ? " — cargo atualizado" : "";
          room.sendAnnouncement(
            `${t.emblem} ${u.nick} desbloqueou ${t.name}!${extra}`,
            null,
            t.color,
            "bold",
            2
          );
        }
      }
      for (const p of room.getPlayerList()) {
        if (!p.id) continue;
        await commands.loadTitleForPlayer(p);
      }
    }

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

    if (result && count >= 2 && count < config.teamSize * 2) {
      if (result.winner === TEAM.BLUE) {
        const players = room.getPlayerList().filter((p) => p.id !== 0);
        for (const p of players) {
          if (p.team === TEAM.RED) room.setPlayerTeam(p.id, TEAM.BLUE);
          else if (p.team === TEAM.BLUE) room.setPlayerTeam(p.id, TEAM.RED);
        }
      }
    }

    if (result?.valid && count >= 2 && count < config.teamSize * 2) {
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

  if (config.discordInviteUrl && config.discordAdMs > 0) {
    const ad = setInterval(() => {
      room.sendAnnouncement(
        `Entre em nosso Discord: ${config.discordInviteUrl}`,
        null,
        0x5865f2,
        "bold",
        1
      );
    }, config.discordAdMs);
    if (typeof ad.unref === "function") ad.unref();
  }

  return { room, afk, match, choose, streak, uniforms };
}

module.exports = { createRoom };
