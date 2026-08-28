const config = require("../config");
const { connToIp, kickReason, formatDuration } = require("../utils");
const { upsertPlayer, getAdmin } = require("../db/players");
const { findActiveBan, createBan } = require("../db/bans");
const { notifyJoin, notifyBan } = require("../discord/webhook");
const { createChatLogger } = require("../discord/chatLog");
const { applyStadium, stadiumKindForCount, needsTrainingX3Swap } = require("./maps");
const { createAfkTracker, shouldCountAutoAfk } = require("./afk");
const { createChatFloodGuard } = require("./chatFlood");
const { diagnoseRoom, createHealthMonitor } = require("./health");
const { createChooseController, TEAM } = require("./choose");
const { planWarmup, applyWarmupMoves, planPromoteToX4, planHeldWinnersToChoose, warmupNeedsLiveFill } = require("./warmupFlow");
const {
  planCompetitiveRecovery,
  planExactFill,
  applyExactFill,
  isKickoffIdleAfk,
  planKickoffAfkRecovery,
} = require("./recovery");
const { createMatchController } = require("./match");
const { createRoomStats } = require("./roomStats");
const { createCarousel, buildCarouselSlides } = require("./carousel");
const { applyJoinGuards } = require("./joinGuards");
const { createUniformManager } = require("./uniforms");
const { createStreakTracker, applyWinnerStays, shouldUseWinnerStays } = require("./streak");
const { createCommandHandler } = require("../commands");
const { detectRageQuit, isChooseToken, rageQuitMessages, targetTeamSize } = require("../gameLogic");
const { rememberIdentity, withIdentity } = require("./playerAuth");
const { guardRoomApi } = require("./safeApi");

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

  guardRoomApi(room);

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
    auths: new Map(),
    conns: new Map(),
    afk: null,
    match: null,
    streak: null,
    uniforms: null,
    roomStats: null,
    chatLog: null,
    selfLeaves: new Set(),
  };

  const movedThisMatch = new Set();
  const afk = createAfkTracker(room, {
    shouldAutoAfk: () => shouldCountAutoAfk(room.getPlayerList()),
    onFieldMove: (id) => movedThisMatch.add(id),
  });
  ctx.afk = afk;
  const uniforms = createUniformManager(room);
  ctx.uniforms = uniforms;
  const roomStats = createRoomStats();
  ctx.roomStats = roomStats;
  const statsSnap = roomStats.snapshot();
  const streak = createStreakTracker({
    best: statsSnap.bestStreak,
    bestHolders: statsSnap.bestStreakHolders,
    onBest(n, holders) {
      roomStats.setBestStreak(n, holders);
    },
  });
  ctx.streak = streak;
  const chatLog = createChatLogger();
  ctx.chatLog = chatLog;
  roomStats
    .hydrateFromDb()
    .then((snap) => streak.hydrateBest(snap.bestStreak, snap.bestStreakHolders))
    .catch(() => {});
  const match = createMatchController(room, {
    identify: (player) =>
      withIdentity(player, {
        auths: ctx.auths,
        conns: ctx.conns,
        livePlayers: room.getPlayerList(),
      }),
    onCompletedMatch(info) {
      roomStats.recordCompletedMatch(info);
    },
  });
  ctx.match = match;
  const commands = createCommandHandler(room, ctx);

  function identified(player) {
    return withIdentity(player, {
      auths: ctx.auths,
      conns: ctx.conns,
      livePlayers: room.getPlayerList(),
    });
  }

  async function bindIdentity(player) {
    rememberIdentity(player, ctx);
    const p = identified(player);
    if (!p?.auth) {
      await commands.loadTitleForPlayer(p);
      return p;
    }
    if (!ctx.admins.has(p.id)) {
      const admin = await getAdmin(p.auth);
      if (admin) {
        ctx.admins.set(p.id, admin);
        commands.applyAdminLook(p, admin);
      }
    }
    await Promise.all([commands.loadTitleForPlayer(p), commands.isMuted(p)]);
    return p;
  }

  let recoverSoonTimer = null;
  function recoverCompetitiveLineupSoon() {
    if (recoverSoonTimer) return;
    recoverSoonTimer = setTimeout(() => {
      recoverSoonTimer = null;
      recoverCompetitiveLineup();
    }, 80);
    if (typeof recoverSoonTimer.unref === "function") recoverSoonTimer.unref();
  }

  function retryAuth(playerId) {
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const live = room.getPlayerList().find((p) => p.id === playerId);
      if (!live || tries > 10) {
        clearInterval(timer);
        return;
      }
      if (!live.auth) return;
      clearInterval(timer);
      rememberIdentity(live, ctx);
      const ban = await findActiveBan({ auth: live.auth, conn: live.conn || ctx.conns.get(playerId) });
      if (ban) {
        const until = ban.ends_at ? ` até ${ban.ends_at}` : " (permanente)";
        room.kickPlayer(playerId, kickReason(`Banido${until}: ${ban.reason || ""}`), false);
        return;
      }
      await bindIdentity(live);
    }, 200);
    if (typeof timer.unref === "function") timer.unref();
  }

  const choose = createChooseController(room, {
    isExcluded: (p) => afk.isAfk(p.id),
    getStreakLabel: () => (streak.get() > 0 ? streak.label() : ""),
    getStreak: () => streak.get(),
    deferAfterTeamChange(callback) {
      const timer = setTimeout(callback, 100);
      if (typeof timer.unref === "function") timer.unref();
    },
    onPickFromSpec(chosen, team) {
      if (match.isCompetitive() && chosen && team) {
        match.addToLineup(chosen, team);
      }
    },
    onCaptainTimeout(player) {
      // Só marca AFK: o choose já mandou pro spec e passa o pick.
      afk.noteAfk(player.id);
    },
    onAborted() {
      // Choose sem candidatos: volta ao lobby em vez de ficar ativo para sempre.
      if (!match.isCompetitive()) refreshLobby();
    },
    onReadyToStart() {
      if (shouldHoldReplacementPause()) return;
      try {
        room.pauseGame(false);
      } catch {
        /* ignore */
      }
      // Admin fechou o 4v4 numa reposição pausada: só despausa, não reinicia.
      if (room.getScores()) return;
      startFromCurrentField();
    },
  });
  ctx.choose = choose;

  let lobbyRevision = 0;
  let postMatchBusy = false;
  /** Winner stays: perdedores ainda no campo (setPlayerTeam atrasado). */
  let winnerStaysPending = null;
  /** RR por AFK no começo do treino: o onGameStop não pode gravar stats nem remontar de novo. */
  let kickoffAfkRestart = false;
  /**
   * stopGame feito pelo lobby (promo x3→x4, troca de mapa, etc.): o onGameStop
   * não pode agendar outro refreshLobby — isso dava 2× "4v4 pronto" / RR duplo.
   */
  let lobbyTransitionStop = false;
  /** Pausa aberta pelo bot para reposição (não desfazer pausa de admin). */
  let replacementPauseActive = false;
  /** Trava a pausa até o spec entrar — mesmo se o choose cair no meio. */
  let holdUntilPick = false;
  /** Estado real do motor (onGamePause / onGameUnpause). */
  let enginePaused = false;
  let holdPauseTimer = null;
  /** Invalida callback de reposição antiga (setPlayerTeam async fechava e despausava cedo). */
  let replacementEpoch = 0;
  /** Admin pausou/despausou manualmente: não re-pausa reposição por cima. */
  let adminPauseOverride = false;
  const slowChat = new Set();
  const chatFlood = createChatFloodGuard({
    limit: config.chatFloodLimit,
    windowMs: config.chatFloodWindowMs,
    muteMs: config.chatFloodMuteMs,
  });
  let stadiumKind = "training";

  /**
   * Pausa para reposição: sempre pausa o jogo e congela o AFK,
   * mesmo se a flag de pausa já estiver ligada (admin/reposição anterior).
   */
  function specReadyCount() {
    return room
      .getPlayerList()
      .filter((p) => p.id !== 0 && p.team === TEAM.SPEC && !afk.isAfk(p.id)).length;
  }

  function requestEnginePause() {
    if (!room.getScores()) return;
    replacementPauseActive = true;
    afk.setPaused(true);
    if (enginePaused) return;
    try {
      room.pauseGame(true);
    } catch {
      /* ignore */
    }
  }

  function stopHoldPauseLoop() {
    if (!holdPauseTimer) return;
    clearInterval(holdPauseTimer);
    holdPauseTimer = null;
  }

  function startHoldPauseLoop() {
    if (holdPauseTimer) return;
    holdPauseTimer = setInterval(() => {
      if (!shouldHoldReplacementPause()) {
        stopHoldPauseLoop();
        return;
      }
      requestEnginePause();
    }, 200);
    if (typeof holdPauseTimer.unref === "function") holdPauseTimer.unref();
  }

  function pauseForReplacement() {
    if (!room.getScores()) return;
    adminPauseOverride = false;
    holdUntilPick = true;
    requestEnginePause();
    startHoldPauseLoop();
  }

  /**
   * @deprecated use pauseForReplacement nos fluxos de reposição
   * @returns {boolean} true se a pausa foi do bot (legado)
   */
  function pauseForBot() {
    if (!room.getScores() || afk.isPaused()) return false;
    room.pauseGame(true);
    return true;
  }

  function resumeFromBot(botPaused) {
    if (botPaused) room.pauseGame(false);
  }

  function eligibleTeamCounts() {
    const players = room
      .getPlayerList()
      .filter((p) => p.id !== 0 && !afk.isAfk(p.id));
    return {
      red: players.filter((p) => p.team === TEAM.RED).length,
      blue: players.filter((p) => p.team === TEAM.BLUE).length,
    };
  }

  function teamsReadyToResume() {
    const { red, blue } = eligibleTeamCounts();
    return red > 0 && red === blue;
  }

  /** Pausa de reposição ainda vale: choose aberto, ou buraco com gente no spec. */
  function shouldHoldReplacementPause() {
    if (adminPauseOverride) return false;
    if (!room.getScores()) return false;
    if (!holdUntilPick && !replacementPauseActive) return false;
    if (choose.isReplacement()) return true;
    const { red, blue } = eligibleTeamCounts();
    if (red !== blue) return true;
    return Math.min(red, blue) < config.teamSize && specReadyCount() > 0;
  }

  /**
   * Haxball ignora pauseGame() chamado de dentro do onGameUnpause.
   * Re-pausa fora do handler e de novo enquanto o pick não veio.
   */
  function scheduleHoldReplacementPause() {
    const bump = (delay) => {
      const timer = setTimeout(() => {
        if (shouldHoldReplacementPause()) requestEnginePause();
      }, delay);
      if (typeof timer.unref === "function") timer.unref();
    };
    bump(50);
    bump(250);
  }

  function releaseReplacementPause({ force = false } = {}) {
    const ours = replacementPauseActive || holdUntilPick;
    holdUntilPick = false;
    replacementPauseActive = false;
    adminPauseOverride = false;
    stopHoldPauseLoop();
    if (!force && !ours) return;
    afk.setPaused(false);
    if (!enginePaused) return;
    try {
      room.pauseGame(false);
    } catch {
      /* ignore */
    }
  }

  let resumeRetry = null;

  /**
   * Reposição resolvida: o jogo volta mesmo se a pausa foi de um admin.
   * Nunca despausa 3v4 — o setPlayerTeam do Haxball é async e o callback
   * antigo chegava antes do substituto entrar.
   */
  function forceResume() {
    if (!room.getScores()) return;
    if (choose.isReplacement()) return;
    if (shouldHoldReplacementPause()) {
      requestEnginePause();
      return;
    }
    if (!replacementPauseActive && !holdUntilPick) return;
    if (!teamsReadyToResume()) {
      if (resumeRetry) return;
      const epoch = replacementEpoch;
      resumeRetry = setTimeout(() => {
        resumeRetry = null;
        if (epoch !== replacementEpoch) return;
        if (!replacementPauseActive || !room.getScores()) return;
        if (shouldHoldReplacementPause()) {
          requestEnginePause();
          return;
        }
        if (teamsReadyToResume()) {
          releaseReplacementPause();
          return;
        }
        recoverCompetitiveLineup();
      }, 150);
      if (typeof resumeRetry.unref === "function") resumeRetry.unref();
      return;
    }
    if (resumeRetry) {
      clearTimeout(resumeRetry);
      resumeRetry = null;
    }
    // Flag primeiro: senão o onGameUnpause re-pausa a reposição já resolvida.
    releaseReplacementPause();
  }

  function startLiveReplacement(targetTeam, onResolved, opts) {
    if (choose.isReplacement()) {
      choose.onPlayerJoin();
      return;
    }
    const epoch = ++replacementEpoch;
    choose.deactivate();
    choose.startReplacement(
      targetTeam,
      (payload = {}) => {
        if (epoch !== replacementEpoch) return;
        onResolved(payload);
      },
      opts
    );
  }

  function stopCurrentGame({ preserveMatch = false, lobbyTransition = false } = {}) {
    if (lobbyTransition) lobbyTransitionStop = true;
    if (!preserveMatch) match.cancelRecordingOnly();
    if (room.getScores()) {
      room.stopGame();
      return;
    }
    // Sem jogo ao vivo: onGameStop não vem — não deixa a flag presa.
    if (lobbyTransition) lobbyTransitionStop = false;
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
    parkAfkOnField();
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    const plan = planWarmup(players, {
      isExcluded: (p) => afk.isAfk(p.id),
    });
    if (!plan.shouldStart || plan.replacementTeam) return;
    match.start({ competitive: false });
  }

  function setLobbyStadium(count) {
    const nextKind = stadiumKindForCount(count);
    const live = !!(match.isRunning() && room.getScores());
    // Queda 4v4 → 3v3/2v2/1v1: o jogo segue no x4; o x3 entra no próximo warmup.
    if (live && stadiumKind === "x4" && nextKind === "x3") return;
    applyStadium(room, count);
    stadiumKind = nextKind;
    uniforms.reapply();
  }

  function refreshLobby() {
    if (postMatchBusy) return;
    if (winnerStaysPending) {
      if (tryFinishWinnerStays()) return;
      return;
    }
    lobbyRevision += 1;
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    const eligibleCount = players.filter((p) => !afk.isAfk(p.id)).length;
    const redN = players.filter((p) => p.team === TEAM.RED && !afk.isAfk(p.id)).length;
    const blueN = players.filter((p) => p.team === TEAM.BLUE && !afk.isAfk(p.id)).length;
    const live = !!(match.isRunning() && room.getScores());
    const fourOnField = redN >= config.teamSize && blueN >= config.teamSize;

    // 4v4 ao vivo completo: nunca warmup, nunca RR, nunca choose, nunca pausa presa.
    // Cobre admin puxando no x3/treino e o mapa x4 oficial.
    if (live && fourOnField) {
      if (choose.isReplacement()) choose.deactivate();
      releaseReplacementPause();
      if (!match.isCompetitive()) match.setCompetitive(true);
      return;
    }

    // 4v4 oficial incompleto (x4 competitivo): reposição é recover/health, não o lobby.
    // Flag competitive preso no treino 1v0 não entra aqui (mapa ≠ x4).
    if (live && match.isCompetitive() && stadiumKind === "x4") {
      if (choose.isActive()) choose.onPlayerJoin();
      else recoverCompetitiveLineup();
      return;
    }

    // No x3/x4: desigual equilibra; 2 specs sobem o par sem RR; 8 gente no x3 RR para o x4.
    // Treino ↔ x3 precisa parar (Haxball não troca mapa ao vivo).
    // 0v0 (treino fantasma) também segue: warmupNeedsLiveFill manda parar / puxar.
    if (live) {
      const nextKind = stadiumKindForCount(eligibleCount);
      const growOnSameMap =
        nextKind === stadiumKind && (stadiumKind === "x3" || stadiumKind === "x4");
      const promoteToX4 = stadiumKind !== "x4" && eligibleCount >= config.teamSize * 2;
      if (
        !needsTrainingX3Swap(stadiumKind, nextKind) &&
        !warmupNeedsLiveFill(redN, blueN, specReadyCount(), { grow: growOnSameMap }) &&
        !promoteToX4
      ) {
        return;
      }
    }
    if (match.isCompetitive()) match.setCompetitive(false);

    // Winner stays 1v1/2v2/3v3/4v4: não deixa o warmup desmontar os vencedores.
    if (choose.isActive() && !choose.isReplacement()) {
      choose.onPlayerJoin();
      return;
    }

    if (eligibleCount >= config.teamSize * 2) {
      if (choose.isActive() && !choose.isReplacement()) {
        choose.onPlayerJoin();
        return;
      }

      const fieldRed = players.filter((p) => p.team === TEAM.RED && !afk.isAfk(p.id)).length;
      const fieldBlue = players.filter((p) => p.team === TEAM.BLUE && !afk.isAfk(p.id)).length;
      // Admin (ou o par do 3v3) já fechou o 4v4: inicia. Não abre choose nem segura pausa.
      if (fieldRed >= config.teamSize && fieldBlue >= config.teamSize) {
        choose.deactivate();
        releaseReplacementPause();
        if (live) {
          match.setCompetitive(true);
          return;
        }
        setLobbyStadium(config.teamSize * 2);
        laterForCurrentLobby(startCompetitiveFromCurrentField);
        return;
      }

      const promo = planPromoteToX4(players, {
        isExcluded: (p) => afk.isAfk(p.id),
        teamSize: config.teamSize,
      });
      if (promo) {
        if (live && stadiumKind === "x4") {
          applyWarmupMoves(room, promo);
          releaseReplacementPause();
          match.setCompetitive(true);
          return;
        }
        stopCurrentGame({ lobbyTransition: true });
        applyWarmupMoves(room, promo);
        setLobbyStadium(eligibleCount);
        room.sendAnnouncement("4v4: jogadores acrescentados — iniciando!", null, 0x2ecc71, "bold", 2);
        laterForCurrentLobby(startCompetitiveFromCurrentField);
        return;
      }

      const held = planHeldWinnersToChoose(players, {
        isExcluded: (p) => afk.isAfk(p.id),
        teamSize: config.teamSize,
      });
      if (held) {
        stopCurrentGame({ lobbyTransition: true });
        applyWarmupMoves(room, held);
        setLobbyStadium(eligibleCount);
        if (held.start) {
          laterForCurrentLobby(startCompetitiveFromCurrentField);
        } else {
          laterForCurrentLobby(() => choose.continueFromField());
        }
        return;
      }

      stopCurrentGame({ lobbyTransition: true });
      choose.deactivate();
      setLobbyStadium(players.length);
      laterForCurrentLobby(() => choose.tryStartChoose());
      return;
    }

    const plan = planWarmup(players, {
      isExcluded: (p) => afk.isAfk(p.id),
    });

    if (!plan.eligibleCount) {
      choose.deactivate();
      stopCurrentGame({ lobbyTransition: true });
      setLobbyStadium(0);
      return;
    }

    const nextKind = stadiumKindForCount(plan.eligibleCount);
    // Treino → x3 (1v1). Queda 1v1 → treino precisa parar: o Haxball não troca mapa com o jogo andando.
    const loadX3 = nextKind === "x3" && stadiumKind === "training";
    const loadTraining = nextKind === "training" && stadiumKind !== "training";

    if (plan.replacementTeam) {
      applyWarmupMoves(room, plan);
      setLobbyStadium(plan.eligibleCount);
      if (choose.isReplacement()) {
        choose.onPlayerJoin();
      } else {
        if (live) pauseForReplacement();
        choose.deactivate();
        const formatSize = Math.min(config.teamSize, Math.max(redN, blueN, 1));
        choose.startReplacement(
          plan.replacementTeam,
          () => {
            releaseReplacementPause();
            refreshLobby();
          },
          { teamSize: formatSize }
        );
      }
      return;
    }

    if (choose.isActive()) choose.deactivate();

    // Troca de mapa no warmup: treino ↔ x3. 3v3 → 2v2 no mesmo x3 só remaneja.
    if (loadX3 || loadTraining) {
      stopCurrentGame({ lobbyTransition: true });
      applyWarmupMoves(room, plan);
      setLobbyStadium(plan.eligibleCount);
      laterForCurrentLobby(startWarmupIfPossible);
      return;
    }

    applyWarmupMoves(room, plan);
    setLobbyStadium(plan.eligibleCount);
    if (!live) laterForCurrentLobby(startWarmupIfPossible);
  }

  function startCompetitiveFromCurrentField() {
    startFromCurrentField();
  }

  /** AFK nunca entra em campo: fora da partida o tick do AFK não corrige isso. */
  function parkAfkOnField() {
    for (const p of room.getPlayerList()) {
      if (p.id === 0 || p.team === TEAM.SPEC) continue;
      if (afk.isAfk(p.id)) room.setPlayerTeam(p.id, TEAM.SPEC);
    }
  }

  function startFromCurrentField() {
    if (winnerStaysPending && !winnerStaysSettled(winnerStaysPending.winner)) return;
    winnerStaysPending = null;
    if (room.getScores() || match.isRunning()) return;
    parkAfkOnField();
    const eligible = room
      .getPlayerList()
      .filter((p) => p.id !== 0 && !afk.isAfk(p.id));
    const size = targetTeamSize(eligible.length, config.teamSize);
    const red = eligible.filter((p) => p.team === TEAM.RED);
    const blue = eligible.filter((p) => p.team === TEAM.BLUE);
    // Times desiguais nunca iniciam: era assim que saía um 4v1 rodando.
    if (red.length !== blue.length || red.length < size || blue.length < size) {
      refreshLobby();
      return;
    }
    if (size >= config.teamSize) {
      room.sendAnnouncement("4v4 pronto — iniciando!", null, 0x2ecc71, "bold", 2);
      applyStadium(room, config.teamSize * 2);
      stadiumKind = "x4";
      uniforms.reapply();
      match.start({ competitive: true });
      return;
    }
    room.sendAnnouncement(`${size}v${size} pronto — iniciando!`, null, 0x2ecc71, "bold", 2);
    setLobbyStadium(eligible.length);
    match.start({ competitive: false });
  }

  function recoverCompetitiveLineup() {
    // Gol da vitória / fim de tempo: o jogo ainda está "vivo" uns segundos.
    // Reposição aqui pausa e pede pick no meio da comemoração.
    if (postMatchBusy || match.isDecided()) return;

    // Reposição em andamento: nada de puxar gente por fora, só atualizar a
    // lista do capitão (alguém entrou, saiu ou ficou AFK enquanto ele escolhia).
    if (choose.isActive() && choose.isReplacement()) {
      choose.onPlayerJoin();
      return;
    }

    const players = room
      .getPlayerList()
      .filter((p) => p.id !== 0 && !afk.isAfk(p.id));
    const red = players.filter((p) => p.team === TEAM.RED);
    const blue = players.filter((p) => p.team === TEAM.BLUE);
    const specs = players.filter((p) => p.team === TEAM.SPEC);
    if (red.length === config.teamSize && blue.length === config.teamSize) {
      releaseReplacementPause();
      return;
    }

    const live = !!room.getScores();
    let plan = planCompetitiveRecovery({
      redCount: red.length,
      blueCount: blue.length,
      specCount: specs.length,
      teamSize: config.teamSize,
      live,
    });

    if (plan.action === "none") return;

    if (!live && plan.action !== "keep-play" && plan.action !== "park-larger") {
      lobbyRevision += 1;
      stopCurrentGame({ lobbyTransition: true });
    }

    // Partida ao vivo: pausa + capitão escolhe (nunca auto-fill direto no recovery).
    if (
      live &&
      (plan.action === "fill-one" || plan.action === "fill-exact" || plan.action === "choose")
    ) {
      plan = { action: "choose", targetTeam: plan.targetTeam };
    }

    if (plan.action === "fill-pairs") {
      if (live && plan.restart) {
        lobbyRevision += 1;
        stopCurrentGame({ lobbyTransition: true });
      }
      for (let index = 0; index < plan.pairs * 2; index += 2) {
        // Specs podem ter saído entre o plano e a execução.
        if (!specs[index] || !specs[index + 1]) break;
        room.setPlayerTeam(specs[index].id, TEAM.RED);
        room.setPlayerTeam(specs[index + 1].id, TEAM.BLUE);
        if (!plan.restart) {
          match.addToLineup(specs[index], TEAM.RED);
          match.addToLineup(specs[index + 1], TEAM.BLUE);
        }
      }
      if (plan.restart) laterForCurrentLobby(startCompetitiveFromCurrentField);
      return;
    }

    if (plan.action === "fill-one") {
      room.setPlayerTeam(specs[0].id, plan.targetTeam);
      match.addToLineup(specs[0], plan.targetTeam);
      laterForCurrentLobby(startCompetitiveFromCurrentField);
      return;
    }

    if (plan.action === "fill-exact") {
      const n = Number(plan.count) || specs.length;
      const names = [];
      for (let i = 0; i < n; i++) {
        if (!specs[i]) break;
        room.setPlayerTeam(specs[i].id, plan.targetTeam);
        match.addToLineup(specs[i], plan.targetTeam);
        names.push(specs[i].name);
      }
      room.sendAnnouncement(
        `${names.join(", ")} entraram automaticamente (${names.length} vagas, ${names.length} opções).`,
        null,
        0x2ecc71,
        "bold",
        1
      );
      laterForCurrentLobby(startCompetitiveFromCurrentField);
      return;
    }

    if (plan.action === "choose") {
      const startChoose = () => {
        if (live) pauseForReplacement();
        startLiveReplacement(plan.targetTeam, ({ chosen, cancelled } = {}) => {
          if (cancelled || !chosen) {
            recoverCompetitiveLineup();
            return;
          }
          match.addToLineup(chosen, plan.targetTeam);
          if (live) {
            forceResume();
            return;
          }
          laterForCurrentLobby(startCompetitiveFromCurrentField);
        });
      };
      if (live) startChoose();
      else laterForCurrentLobby(startChoose);
      return;
    }

    if (plan.action === "park-larger") {
      holdUntilPick = false;
      const largerTeam = plan.targetTeam;
      const larger = room
        .getPlayerList()
        .filter((p) => p.id !== 0 && p.team === largerTeam);
      const last = larger[larger.length - 1];
      if (last) room.setPlayerTeam(last.id, TEAM.SPEC);
      match.setCompetitive(false);
      room.sendAnnouncement(
        "3v3: o jogo segue. 4v4 recomeça quando entrar mais gente.",
        null,
        0xf1c40f,
        "bold",
        1
      );
      if (live) releaseReplacementPause();
      return;
    }

    if (plan.action === "keep-play") {
      holdUntilPick = false;
      match.setCompetitive(false);
      if (live) releaseReplacementPause();
      return;
    }

    if (live) {
      lobbyRevision += 1;
      stopCurrentGame({ lobbyTransition: true });
    }
    laterForCurrentLobby(refreshLobby);
  }

  function recoverAfterKickoffAfk() {
    parkAfkOnField();
    const players = room
      .getPlayerList()
      .filter((p) => p.id !== 0 && !afk.isAfk(p.id));
    const red = players.filter((p) => p.team === TEAM.RED);
    const blue = players.filter((p) => p.team === TEAM.BLUE);
    const specs = players.filter((p) => p.team === TEAM.SPEC);
    const plan = planKickoffAfkRecovery({
      redCount: red.length,
      blueCount: blue.length,
      specCount: specs.length,
    });

    if (plan.action === "choose") {
      laterForCurrentLobby(() => {
        choose.deactivate();
        choose.startReplacement(
          plan.targetTeam,
          ({ chosen, cancelled } = {}) => {
            if (cancelled || !chosen) {
              laterForCurrentLobby(refreshLobby);
              return;
            }
            laterForCurrentLobby(startFromCurrentField);
          },
          { teamSize: plan.teamSize }
        );
      });
      return;
    }

    if (plan.action === "fill") {
      const n = Number(plan.count) || 1;
      const names = [];
      for (let i = 0; i < n; i++) {
        if (!specs[i]) break;
        room.setPlayerTeam(specs[i].id, plan.targetTeam);
        names.push(specs[i].name);
      }
      if (names.length) {
        room.sendAnnouncement(
          names.length === 1
            ? `${names[0]} entrou automaticamente (1 vaga, 1 opção).`
            : `${names.join(", ")} entraram automaticamente (${names.length} vagas, ${names.length} opções).`,
          null,
          0x2ecc71,
          "bold",
          1
        );
      }
      laterForCurrentLobby(startFromCurrentField);
      return;
    }

    if (plan.action === "start") {
      laterForCurrentLobby(startFromCurrentField);
      return;
    }

    laterForCurrentLobby(refreshLobby);
  }

  function restartAfterKickoffAfk(player) {
    if (kickoffAfkRestart) return;
    kickoffAfkRestart = true;
    lobbyRevision += 1;
    match.cancelRecordingOnly();
    if (room.getScores()) room.stopGame();
    recoverAfterKickoffAfk();
  }

  afk.setOnStateChange(({ type, player, previousTeam }) => {
    if (type === "kick") return;
    if (kickoffAfkRestart) return;

    const leftField = previousTeam === TEAM.RED || previousTeam === TEAM.BLUE;

    // Começo da partida (nunca teclou/chutou): RR sem stats em 1v1–4v4.
    // Depois o capitão escolhe o substituto se tiver spec.
    if (
      leftField &&
      player &&
      isKickoffIdleAfk(type, player.id, movedThisMatch) &&
      room.getScores()
    ) {
      restartAfterKickoffAfk(player);
      return;
    }

    if (match.isCompetitive()) {
      // Spec / fora do jogo: não pausa nem abre reposição. Só atualiza o pick se já está aberto.
      if (!leftField) {
        if (choose.isReplacement()) choose.onPlayerJoin();
        return;
      }
      if (
        room.getScores() &&
        (type === "auto-afk" || type === "voluntary-afk")
      ) {
        const specReady = room
          .getPlayerList()
          .filter((p) => p.id !== 0 && p.team === TEAM.SPEC && !afk.isAfk(p.id));
        if (specReady.length) pauseForReplacement();
      }
      // setPlayerTeam é async: se o AFK ainda aparece no time, espera o
      // onPlayerTeamChange. Já no spec (mock / tick seguinte) recupera já.
      const live = player && room.getPlayerList().find((p) => p.id === player.id);
      if (live && live.team !== TEAM.SPEC) {
        recoverCompetitiveLineupSoon();
        return;
      }
      recoverCompetitiveLineup();
      return;
    }

    refreshLobby();
  });

  room.onRoomLink = (link) => {
    console.log("[sala-x4] link:", link);
  };

  room.onPlayerJoin = async (player) => {
    try {
      await handleJoin(player);
    } catch (err) {
      console.error("[room] onPlayerJoin", err?.message || err);
    }
  };

  async function handleJoin(player) {
    afk.touch(player.id);
    rememberIdentity(player, ctx);

    const auth = player.auth || ctx.auths.get(player.id) || null;
    const conn = player.conn || ctx.conns.get(player.id) || null;
    const ip = connToIp(conn);

    const ban = await findActiveBan({ auth, conn });
    if (ban) {
      const until = ban.ends_at ? ` até ${ban.ends_at}` : " (permanente)";
      room.kickPlayer(player.id, kickReason(`Banido${until}: ${ban.reason || ""}`), false);
      return;
    }

    // Ghost kick (auth duplicada) e limite por conexão
    const guard = applyJoinGuards(room, identified(player));
    if (guard === "conn-limit") return;

    // Monta o 4v4/warmup já; stats/cargo/Discord não podem atrasar o jogo
    // (era o mesmo tipo de espera do saveMatch no fim da partida).
    refreshLobby();
    afk.ensureReserveSlots();
    if (!auth) retryAuth(player.id);

    void (async () => {
      await upsertPlayer({ auth, nick: player.name, conn, ip });
      const bound = await bindIdentity(player);
      const title = ctx.titles.get(player.id) || { emblem: "🌱", color: 0xbdc3c7 };
      room.sendAnnouncement(
        `Bem-vindo, ${title.emblem} ${player.name}! !ajuda · !cargos`,
        player.id,
        title.color,
        "normal",
        1
      );
      notifyJoin({
        playerId: player.id,
        nick: player.name,
        auth: bound?.auth || auth,
        conn: bound?.conn || conn,
        ip,
        admin: ctx.admins.get(player.id) || null,
        title,
      }).catch(() => {});
    })().catch((err) => console.error("[join]", err?.message || err));
  }

  const pendingLeaves = new Map();

  function cleanupPlayer(player) {
    afk.remove(player.id);
    ctx.admins.delete(player.id);
    ctx.mutes.delete(player.id);
    ctx.titles.delete(player.id);
    ctx.auths.delete(player.id);
    ctx.conns.delete(player.id);
    slowChat.delete(player.id);
    chatFlood.forget(player.id);
    commands.forgetPlayer(player.id);
    movedThisMatch.delete(player.id);
  }

  function announceRageQuit(player, reason) {
    const { public: publicMsg, private: privateMsg } = rageQuitMessages(player.name, reason);
    room.sendAnnouncement(publicMsg, null, 0xe74c3c, "bold", 2);
    try {
      room.sendAnnouncement(privateMsg, player.id, 0xe74c3c, "bold", 2);
    } catch {
      /* jogador já saiu */
    }
  }

  function processDeparture(
    player,
    { kicked = false, adminKick = false, scoresAtLeave = null, chooseNotified = false } = {}
  ) {
    if (match.isRunning()) {
      const rageReason = adminKick ? null : match.rageQuitReason(player, scoresAtLeave);
      if (rageReason) {
        if (choose.isActive()) choose.deactivate();
        announceRageQuit(player, rageReason);
        match.markVictory();
        setTimeout(() => room.stopGame(), 100);
        return;
      }
    }

    if (choose.isActive()) {
      // onPlayerLeave já avisou o choose na hora: avisar de novo reiniciaria o
      // timer do capitão e poderia rebalancear duas vezes.
      if (!chooseNotified) choose.onPlayerLeave();
      if (choose.isActive()) return;
      // Choose encerrou: 4v4 pronto (inicia com delay) ou poucos jogadores (volta ao warmup).
      const timer = setTimeout(() => {
        if (!match.isCompetitive()) refreshLobby();
      }, 150);
      if (typeof timer.unref === "function") timer.unref();
      return;
    }

    if (match.isCompetitive()) {
      // Spec saindo de um 4v4 fechado não mexe. Se o Haxball reporta spec
      // mas o campo já está 3v4, ainda precisa repor.
      if (player && player.team === TEAM.SPEC) {
        const { red, blue } = eligibleTeamCounts();
        if (red === config.teamSize && blue === config.teamSize) return;
      }

      if (!adminKick) {
        const remaining = room
          .getPlayerList()
          .filter((p) => p.id !== 0 && !afk.isAfk(p.id));
        const scores = scoresAtLeave || match.snapshotScores() || room.getScores();
        const leavingTeam =
          player.team === TEAM.RED || player.team === TEAM.BLUE
            ? player.team
            : 0;
        const losingTeam =
          scores && scores.red < scores.blue
            ? TEAM.RED
            : scores && scores.blue < scores.red
              ? TEAM.BLUE
              : 0;
        // Ragequit clássico (4v3 no fim) também é só do time que está perdendo.
        if (!losingTeam || leavingTeam === losingTeam) {
          const classic = detectRageQuit({
            redCount: remaining.filter((p) => p.team === TEAM.RED).length,
            blueCount: remaining.filter((p) => p.team === TEAM.BLUE).length,
            scores,
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
      }

      recoverCompetitiveLineup();
      return;
    }

    // Spec saindo não mexe no warmup: sem RR, sem reposição.
    if (player && player.team === TEAM.SPEC) return;

    // Warmup / 3v3 ao vivo: o refresh decide se precisa parar.
    // Spec saindo de um 3v3 já montado não reinicia o jogo.
    refreshLobby();
  }

  room.onPlayerLeave = (player) => {
    const scoresAtLeave = match.snapshotScores();
    // Guarda auth/conn antes da limpeza: onPlayerKicked precisa disso para registrar ban.
    const snapshot = { ...identified(player), team: player.team };
    cleanupPlayer(player);

    if (
      match.isCompetitive() &&
      room.getScores() &&
      snapshot.team !== TEAM.SPEC
    ) {
      pauseForReplacement();
    }

    // Capitão precisa passar o pick na hora; o delay de 75ms é só do ragequit.
    const chooseNotified = choose.isActive();
    if (chooseNotified) choose.onPlayerLeave();

    // onPlayerKicked vem logo após onPlayerLeave. O pequeno atraso impede
    // que kick de admin/AFK seja classificado como ragequit.
    const timer = setTimeout(() => {
      pendingLeaves.delete(player.id);
      processDeparture(snapshot, { kicked: false, scoresAtLeave, chooseNotified });
    }, 75);
    pendingLeaves.set(player.id, { timer, player: snapshot, scoresAtLeave, chooseNotified });
  };

  room.onPlayerKicked = (kickedPlayer, reason, ban, byPlayer) => {
    const pending = pendingLeaves.get(kickedPlayer.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingLeaves.delete(kickedPlayer.id);
      const selfLeave =
        ctx.selfLeaves.delete(kickedPlayer.id) || String(reason || "") === "Até mais!";
      processDeparture(pending.player, {
        kicked: !selfLeave,
        adminKick: !!byPlayer,
        scoresAtLeave: pending.scoresAtLeave,
        chooseNotified: pending.chooseNotified,
      });
    }
    ctx.selfLeaves.delete(kickedPlayer.id);
    cleanupPlayer(kickedPlayer);
    if (byPlayer) afk.touch(byPlayer.id);

    if (ban && byPlayer) {
      const admin = ctx.admins.get(byPlayer.id);
      // Sem cargo no banco não banimos de verdade: desfaz o ban da sala.
      if (!admin) room.clearBan(kickedPlayer.id);
      else persistNativeBan(pending?.player || kickedPlayer, reason, byPlayer);
    }
  };

  /**
   * Ban feito pelo painel do Haxball (sem !ban): o ban nativo some no restart,
   * então registramos na tabela e deixamos a checagem de entrada valer.
   */
  function persistNativeBan(target, reason, byPlayer) {
    const auth = target.auth || ctx.auths.get(target.id) || null;
    const conn = target.conn || ctx.conns.get(target.id) || null;
    if (!auth && !conn) return;

    createBan({
      auth,
      conn,
      ip: connToIp(conn),
      nick: target.name,
      reason: reason || "Ban pelo painel do Haxball",
      bannedBy: ctx.auths.get(byPlayer.id) || byPlayer.name,
      endsAt: null,
    })
      .then((saved) => {
        notifyBan({
          nick: target.name,
          auth,
          conn,
          ip: connToIp(conn),
          reason: reason || "Ban pelo painel do Haxball",
          duration: "permanente",
          endsAt: null,
          bannedBy: byPlayer.name,
          source: saved ? "painel Haxball" : "painel Haxball (sem banco)",
        }).catch(() => {});
        if (!saved) {
          room.sendAnnouncement(
            "Ban não registrado no banco — vale só até o restart.",
            byPlayer.id,
            0xe74c3c,
            "bold",
            2
          );
          return;
        }
        // A tabela vira a fonte da verdade: assim o !unban resolve de verdade.
        room.clearBan(target.id);
        room.sendAnnouncement(
          `${target.name} banido permanentemente por ${byPlayer.name}. (!unban para desfazer)`,
          null,
          0xe74c3c,
          "bold",
          2
        );
      })
      .catch((err) => console.error("[ban nativo]", err?.message || err));
  }

  room.onGamePause = (byPlayer) => {
    enginePaused = true;
    afk.setPaused(true);
    if (byPlayer) {
      afk.touch(byPlayer.id);
      adminPauseOverride = true;
      stopHoldPauseLoop();
    }
  };

  room.onGameUnpause = (byPlayer) => {
    enginePaused = false;
    if (byPlayer) afk.touch(byPlayer.id);
    if (byPlayer) {
      adminPauseOverride = true;
      stopHoldPauseLoop();
      afk.setPaused(false);
      return;
    }
    // pauseGame aqui dentro é ignorado. Re-pausa no timeout/loop.
    if (shouldHoldReplacementPause()) {
      afk.setPaused(true);
      scheduleHoldReplacementPause();
      return;
    }
    afk.setPaused(false);
  };

  room.onPlayerAdminChange = (changedPlayer, byPlayer) => {
    if (byPlayer) afk.touch(byPlayer.id);
  };

  room.onPlayerTeamChange = (changedPlayer, byPlayer) => {
    choose.confirmTeamChange(changedPlayer);
    if (afk.isAfk(changedPlayer.id) && changedPlayer.team !== 0) {
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

    uniforms.syncAvatars();
    if (changedPlayer.team !== TEAM.SPEC) afk.touch(changedPlayer.id);
    if (byPlayer) afk.touch(byPlayer.id);
    if (match.isCompetitive() && changedPlayer.team !== TEAM.SPEC) {
      match.addToLineup(changedPlayer, changedPlayer.team);
    }
    if (winnerStaysPending && !byPlayer) {
      tryFinishWinnerStays();
      return;
    }
    if (byPlayer && winnerStaysPending) winnerStaysPending = null;
    // Admin mexeu nos times no choose → reavalia sem resetar o que já foi escolhido
    if (byPlayer && choose.isActive()) choose.onTeamChange(changedPlayer);
    else if (byPlayer && !match.isCompetitive()) refreshLobby();
    else if (byPlayer && match.isCompetitive()) recoverCompetitiveLineup();
    else if (
      !byPlayer &&
      match.isCompetitive() &&
      room.getScores() &&
      !choose.isActive()
    ) {
      recoverCompetitiveLineupSoon();
    }
  };

  // Tecla no lugar NÃO zera. Corrida (inclusive linha reta) zera pelo disco.
  room.onPlayerActivity = (player) => {
    if (!player?.id) return;
    movedThisMatch.add(player.id);
    afk.noteActivity(player);
  };

  room.onPlayerBallKick = (player) => {
    // Chute sem andar não zera o AFK (map.txt). Só marca que já jogou nesta partida.
    if (player?.id) movedThisMatch.add(player.id);
    match.onBallKick(identified(player));
  };

  room.onTeamGoal = (team) => {
    match.onTeamGoal(team);
  };

  room.onPositionsReset = () => {
    match.notePositionsReset();
    afk.notePositionsReset();
  };

  room.onGameStart = () => {
    enginePaused = false;
    holdUntilPick = false;
    replacementPauseActive = false;
    adminPauseOverride = false;
    winnerStaysPending = null;
    stopHoldPauseLoop();
    movedThisMatch.clear();
    kickoffAfkRestart = false;
    afk.setPaused(false);
    afk.resetClocks();
    uniforms.prepareKickoff();
    uniforms.syncAvatars();
    const humans = room.getPlayerList().filter((p) => p.id !== 0);
    const hasRed = humans.some((p) => p.team === TEAM.RED);
    const hasBlue = humans.some((p) => p.team === TEAM.BLUE);
    if (hasRed && hasBlue) {
      room.sendAnnouncement(uniforms.kickoffVs(), null, 0xf1c40f, "bold", 2);
    }
  };

  room.onPlayerChat = (player, message) => {
    const who = identified(player);
    const text = String(message || "").trim();

    // Mutado só usa o que começa com ! (!stats, !1, !afk…). Chat e pick sem ! bloqueados.
    if (text.startsWith("!")) {
      if (choose.handleCaptainChat(who, message)) return false;
      commands.handle(who, message).catch((err) => {
        console.error("[cmd]", err?.message || err);
      });
      return false;
    }

    const muted = commands.peekMute(who);
    if (muted) {
      room.sendAnnouncement(
        `Você está mutado por mais ${formatDuration(muted.endsAt - Date.now())}. Só comandos com ! estão liberados.`,
        player.id,
        0xe67e22,
        "bold",
        2
      );
      return false;
    }

    if (choose.handleCaptainChat(who, message)) return false;

    if (commands.handleTeamChat(who, message)) return false;
    if (commands.handleStaffChat(who, message)) return false;
    if (commands.handleWhisper(who, message)) return false;

    if (!ctx.admins.has(player.id)) {
      const flood = chatFlood.note(player.id);
      if (flood) {
        ctx.mutes.set(player.id, { endsAt: flood.endsAt, reason: "flood" });
        room.sendAnnouncement(
          `${who.name} mutado 30s por flood (4 msgs em 5s).`,
          null,
          0xf39c12,
          "bold",
          2
        );
        room.sendAnnouncement(
          "Você foi mutado 30s por flood. Só comandos com ! estão liberados.",
          player.id,
          0xe67e22,
          "bold",
          2
        );
        return false;
      }
    }

    if (choose.isActive() && !ctx.admins.has(player.id)) {
      const token = String(message || "").trim().split(/\s+/)[0];
      if (!isChooseToken(token)) {
        if (slowChat.has(player.id)) return false;
        slowChat.add(player.id);
        const timer = setTimeout(() => slowChat.delete(player.id), 2000);
        if (typeof timer.unref === "function") timer.unref();
      }
    }

    const { line, color } = commands.formatPlayerChat(who, message);
    room.sendAnnouncement(line, null, color, "bold", 1);
    chatLog.push({ nick: who.name, text: message, kind: "chat" });
    return false;
  };

  room.onTeamVictory = () => {
    match.markVictory();
    setTimeout(() => {
      room.stopGame();
    }, 2500);
  };

  room.onGameTick = () => {
    // Tick só roda despausado (e no fim da contagem de 2s). Segura a reposição.
    if (shouldHoldReplacementPause()) {
      requestEnginePause();
      return;
    }
    try {
      match.onTick();
    } catch (err) {
      console.error("[room] onTick", err?.message || err);
    }
    try {
      afk.noteGameTick();
    } catch (err) {
      console.error("[room] afk.tick", err?.message || err);
    }
  };

  room.onGameStop = async () => {
    try {
      await handleGameStop();
    } catch (err) {
      // Falha no save/replay não pode deixar a sala sem próximo jogo.
      console.error("[room] onGameStop", err?.message || err);
      postMatchBusy = false;
      setTimeout(refreshLobby, 1200);
    }
  };

  function waitMs(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function waitUntil(predicate, { timeout = 1000, interval = 40 } = {}) {
    if (predicate()) return true;
    const started = Date.now();
    while (Date.now() - started < timeout) {
      await waitMs(interval);
      if (predicate()) return true;
    }
    return predicate();
  }

  /** Perdedores já saíram: o próximo time tem no máximo o capitão no azul. */
  function winnerStaysSettled(winner) {
    const players = room.getPlayerList().filter((p) => p.id !== 0 && !afk.isAfk(p.id));
    const red = players.filter((p) => p.team === TEAM.RED).length;
    const blue = players.filter((p) => p.team === TEAM.BLUE).length;
    if (winner !== TEAM.RED && winner !== TEAM.BLUE) return true;
    return blue <= 1 && red > 0;
  }

  function winnerStaysExclude(p) {
    return afk.isAfk(p.id);
  }

  /** Campo já assentou: choose ou fill. Sem isso o 4v4 fantasma relança. */
  function tryFinishWinnerStays() {
    if (!winnerStaysPending || winnerStaysPending.filling) return false;
    if (choose.isActive() || room.getScores() || match.isRunning()) {
      winnerStaysPending = null;
      return true;
    }
    const winner = winnerStaysPending.winner;
    if (!winnerStaysSettled(winner)) return false;

    winnerStaysPending.filling = true;
    const eligible = room.getPlayerList().filter((p) => p.id !== 0 && !afk.isAfk(p.id));
    const specs = eligible.filter((p) => p.team === TEAM.SPEC);
    const fill = planExactFill({
      redCount: eligible.filter((p) => p.team === TEAM.RED).length,
      blueCount: eligible.filter((p) => p.team === TEAM.BLUE).length,
      specCount: specs.length,
      teamSize: targetTeamSize(eligible.length, config.teamSize),
    });
    winnerStaysPending = null;
    postMatchBusy = false;

    if (fill.action === "start") {
      startFromCurrentField();
      return true;
    }
    if (fill.action === "fill-all") {
      applyExactFill(room, specs, fill);
      startFromCurrentField();
      return true;
    }
    if (fill.action === "keep") {
      const redN = eligible.filter((p) => p.team === TEAM.RED).length;
      const blueN = eligible.filter((p) => p.team === TEAM.BLUE).length;
      if (specs.length && (redN >= 1 || blueN >= 1) && redN !== blueN) {
        choose.continueFromField();
        return true;
      }
      laterForCurrentLobby(refreshLobby);
      return true;
    }
    choose.continueFromField();
    return true;
  }

  function scheduleWinnerStaysRetry() {
    laterForCurrentLobby(() => {
      if (!winnerStaysPending) return;
      if (tryFinishWinnerStays()) return;
      applyWinnerStays(room, winnerStaysPending.winner, streak, {
        isExcluded: winnerStaysExclude,
        recordStreak: false,
        quiet: true,
      });
      laterForCurrentLobby(() => tryFinishWinnerStays(), 400);
    }, 1500);
  }

  function announceTitleUnlocks(unlocks) {
    if (!unlocks?.length) return;
    for (const u of unlocks) {
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
  }

  function persistMatchInBackground(result) {
    if (!result?.persistPayload) return;
    match
      .persistMatch(result.persistPayload)
      .then(async (saved) => {
        await announceTitleUnlocks(saved?.titleUnlocks);
        // Recarrega mesmo sem desbloqueio novo (ex.: perdeu o cargo Negativo).
        for (const p of room.getPlayerList()) {
          if (!p.id) continue;
          await commands.loadTitleForPlayer(p);
        }
      })
      .catch((err) => console.error("[match] persist", err?.message || err));
  }

  async function remountWinnerStays(result) {
    const { mode } = applyWinnerStays(room, result.winner, streak, {
      isExcluded: winnerStaysExclude,
      recordStreak: !!(result.valid && result.decided),
    });
    uniforms.onWinnerStays(result.winner);
    if (mode !== "choose") {
      laterForCurrentLobby(refreshLobby, 800);
      return;
    }
    winnerStaysPending = { winner: result.winner };
    await waitUntil(() => winnerStaysSettled(result.winner), { timeout: 1000 });
    if (tryFinishWinnerStays()) return;
    // setPlayerTeam ainda não aplicou: não relança o 4v4. Espera o evento ou o retry.
    scheduleWinnerStaysRetry();
  }

  async function handleGameStop() {
    holdUntilPick = false;
    replacementPauseActive = false;
    adminPauseOverride = false;
    stopHoldPauseLoop();
    if (kickoffAfkRestart) {
      postMatchBusy = false;
      return;
    }
    if (lobbyTransitionStop) {
      lobbyTransitionStop = false;
      postMatchBusy = false;
      return;
    }
    postMatchBusy = true;
    uniforms.noteMatchEnd();
    let result = null;
    try {
      result = await match.finish(undefined, { persist: false });
      const humans = room.getPlayerList().filter((p) => p.id !== 0);
      const count = humans.filter((p) => !afk.isAfk(p.id)).length;
      const official4v4Done = !!(result?.valid && result?.decided);

      if (result && shouldUseWinnerStays(count, official4v4Done, result.winner)) {
        await remountWinnerStays(result);
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

      // Streak só conta 4v4 que acabou de verdade. Stop de admin, RR,
      // treino e 3v3 não zeram nem incrementam.

      laterForCurrentLobby(refreshLobby, 1200);
    } finally {
      postMatchBusy = false;
      persistMatchInBackground(result);
    }
  }

  const health = createHealthMonitor({
    diagnose() {
      if (postMatchBusy || winnerStaysPending) return { action: "none" };
      const { red, blue, specReady } = choose.list();
      return diagnoseRoom({
        live: !!room.getScores(),
        paused: afk.isPaused(),
        chooseActive: choose.isActive(),
        replacement: choose.isReplacement(),
        holdingPause: replacementPauseActive || holdUntilPick,
        hasCaptain: !!choose.currentCaptain(),
        competitive: match.isCompetitive(),
        winnerStaysPending: !!winnerStaysPending,
        redCount: red.filter((p) => !afk.isAfk(p.id)).length,
        blueCount: blue.filter((p) => !afk.isAfk(p.id)).length,
        specReadyCount: specReady.length,
        teamSize: config.teamSize,
      });
    },
    apply({ action, reason }) {
      console.warn(`[health] ${action}: ${reason}`);
      if (action === "stop-game") {
        choose.deactivate();
        match.setCompetitive(false);
        lobbyRevision += 1;
        forceResume();
        stopCurrentGame({ lobbyTransition: true });
        laterForCurrentLobby(refreshLobby, 600);
        return;
      }
      if (action === "recover") {
        recoverCompetitiveLineup();
        return;
      }
      if (action === "pause") {
        pauseForReplacement();
        return;
      }
      if (action === "unpause") {
        if (shouldHoldReplacementPause()) {
          requestEnginePause();
          return;
        }
        releaseReplacementPause({ force: true });
        return;
      }
      if (action === "prompt-choose") {
        choose.promptCaptain();
        return;
      }
      if (action === "refresh-lobby") refreshLobby();
    },
  });
  const healthHandle = health.start();

  applyStadium(room, 0);
  stadiumKind = "training";
  uniforms.reapply();

  const carousel = createCarousel({
    getSlides: () =>
      buildCarouselSlides({
        discordUrl: config.discordInviteUrl,
        siteUrl: config.siteUrl,
        ...roomStats.snapshot(),
      }),
  });
  const carouselHandle = carousel.start(room, config.carouselMs);

  return {
    room,
    afk,
    match,
    choose,
    streak,
    uniforms,
    roomStats,
    carousel: carouselHandle,
    mutes: ctx.mutes,
    chatLog,
    health: {
      stop() {
        stopHoldPauseLoop();
        healthHandle.stop();
      },
      check: health.check,
    },
    refreshLobby,
  };
}

module.exports = { createRoom };
