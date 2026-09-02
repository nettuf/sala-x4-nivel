const config = require("../config");
const { pickFromSpecList, isChooseToken, targetTeamSize } = require("../gameLogic");

const TEAM = { SPEC: 0, RED: 1, BLUE: 2 };

/**
 * Choose mode x4: capitães (1º de cada time) escolhem specs até 4v4.
 * @param {{ onReadyToStart: Function, isExcluded?: (player: object) => boolean, getStreakLabel?: () => string, getStreak?: () => number, deferAfterTeamChange?: (callback: Function) => void, onCaptainTimeout?: (player: object) => void }} opts
 */
function createChooseController(room, {
  onReadyToStart,
  isExcluded,
  getStreakLabel,
  getStreak,
  deferAfterTeamChange,
  onPickFromSpec,
  onAborted,
  onCaptainTimeout,
}) {
  let active = false;
  let timeout = null;
  let replacement = null;
  let lockedSize = 0;
  const pendingTeams = new Map();
  /** Última lista/timer enviados ao capitão (health + refresh). */
  let lastPickPromptAt = 0;
  let lastPickCaptainId = 0;
  /** Fim do prazo do pick (evita tratar handle de setTimeout já disparado como timer vivo). */
  let capTimeoutUntil = 0;

  function excluded(p) {
    return typeof isExcluded === "function" ? !!isExcluded(p) : false;
  }

  function computeTeamSize() {
    if (replacement) return config.teamSize;
    const players = room.getPlayerList().filter((p) => p.id !== 0 && !excluded(p));
    const teamOf = (p) => (pendingTeams.has(p.id) ? pendingTeams.get(p.id) : p.team);
    const held = Math.max(
      players.filter((p) => teamOf(p) === TEAM.RED).length,
      players.filter((p) => teamOf(p) === TEAM.BLUE).length,
      1
    );
    const byCount = targetTeamSize(players.length, config.teamSize);
    return Math.min(config.teamSize, Math.max(byCount, held));
  }

  function currentTeamSize() {
    if (replacement) {
      return Number(replacement.teamSize) || config.teamSize;
    }
    if (active && lockedSize) return lockedSize;
    return computeTeamSize();
  }

  function streakSuffix() {
    if (typeof getStreakLabel !== "function") return "";
    const s = getStreakLabel();
    return s ? ` · ${s}` : "";
  }

  function setTeam(playerId, team) {
    pendingTeams.set(playerId, team);
    room.setPlayerTeam(playerId, team);
    const timer = setTimeout(() => pendingTeams.delete(playerId), 250);
    if (typeof timer.unref === "function") timer.unref();
  }

  function afterTeamChange(callback) {
    if (typeof deferAfterTeamChange === "function") {
      deferAfterTeamChange(callback);
    } else {
      callback();
    }
  }

  function specQueue(players) {
    const specs = players.filter((p) => p.team === TEAM.SPEC && p.id !== 0);
    const ready = specs.filter((p) => !excluded(p));
    const afkSpecs = specs.filter((p) => excluded(p));
    return { ready, afk: afkSpecs, all: [...ready, ...afkSpecs] };
  }

  function list() {
    const players = room.getPlayerList().map((p) =>
      pendingTeams.has(p.id) ? { ...p, team: pendingTeams.get(p.id) } : p
    );
    const queue = specQueue(players);
    return {
      red: players.filter((p) => p.team === TEAM.RED),
      blue: players.filter((p) => p.team === TEAM.BLUE),
      spec: queue.all,
      specReady: queue.ready,
      specAfk: queue.afk,
    };
  }

  /**
   * AFK ainda no campo (setPlayerTeam async) não preenche vaga.
   * Sem isso a reposição “fecha” 4v4, despausa, e o jogo segue 3v4.
   */
  function eligibleOn(side) {
    return (side || []).filter((p) => !excluded(p));
  }

  function teamCount(team) {
    const { red, blue } = list();
    return eligibleOn(team === TEAM.RED ? red : blue).length;
  }

  function clearCapTimeout() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    capTimeoutUntil = 0;
  }

  function isCapTimeoutLive() {
    return capTimeoutUntil > Date.now();
  }

  /** Nunca cai no chat geral: id inválido / 0 (host) = não manda. */
  function tell(playerId, msg, color, style = "normal", sound = 1) {
    const id = Number(playerId);
    if (!Number.isInteger(id) || id <= 0) return;
    room.sendAnnouncement(msg, id, color, style, sound);
  }

  /** Lista só quem pode ser escolhido: AFK não aparece nem ocupa número. Só o capitão vê. */
  function announceSpecList(captainId) {
    const id = Number(captainId);
    if (!Number.isInteger(id) || id <= 0) return;
    lastPickPromptAt = Date.now();
    lastPickCaptainId = id;
    const { specReady } = list();
    if (!specReady.length) {
      tell(id, "Sem jogadores no spec.", 0xe74c3c, "bold", 2);
      return;
    }
    const line = specReady.map((p, i) => `${p.name}[${i + 1}]`).join(", ");
    tell(id, `Specs: ${line}`, 0x3498db, "bold", 1);
    tell(
      id,
      `Escolha em ${config.chooseTimeSec}s: número | top | random | bottom${streakSuffix()}`,
      0xecf0f1,
      "normal",
      1
    );
  }

  function pickPromptStale(maxAgeMs = 4000) {
    if (!active || !lastPickCaptainId) return true;
    return Date.now() - lastPickPromptAt >= maxAgeMs;
  }

  function scheduleCaptainTimeouts(cap) {
    const chooseTime = config.chooseTimeSec;
    const capId = cap.id;
    capTimeoutUntil = Date.now() + chooseTime * 1000;
    timeout = setTimeout(() => {
      if (!active || currentCaptain()?.id !== capId) {
        promptCaptain();
        return;
      }
      tell(
        cap.id,
        `${cap.name}, ${Math.floor(chooseTime / 2)}s restantes!`,
        0xf1c40f,
        "bold",
        2
      );
      timeout = setTimeout(() => {
        if (!active || currentCaptain()?.id !== capId) {
          promptCaptain();
          return;
        }
        if (tryFinishChoose()) return;
        parkTimedOutCaptain(cap);
      }, (chooseTime / 2) * 1000);
      if (typeof timeout.unref === "function") timeout.unref();
    }, (chooseTime / 2) * 1000);
    if (typeof timeout.unref === "function") timeout.unref();
  }

  /**
   * Envia Specs + instrução e inicia (ou mantém) o timer de pick.
   * refreshOnly: só atualiza a lista — não zera o relógio (join no meio do pick).
   */
  function beginCaptainPickTurn({ refreshOnly = false } = {}) {
    if (!active) return false;

    const team = pickingTeam() || (replacement && replacement.targetTeam) || 0;
    if (!team) {
      tryFinishChoose();
      return false;
    }
    if (!replacement && !teamHasHole(team)) {
      if (!tryFinishChoose()) deactivate();
      return false;
    }

    if (!list().specReady.length) {
      if (abortIfNoEligibleSpec()) return false;
    }

    const cap = ensureCaptain();
    if (!cap) return false;

    announceSpecList(cap.id);

    if (!refreshOnly) {
      clearCapTimeout();
      scheduleCaptainTimeouts(cap);
    }
    return true;
  }

  /** Time que precisa pickar: nunca o que já está completo. */
  function pickingTeam() {
    if (replacement) return replacement.targetTeam;
    const redN = teamCount(TEAM.RED);
    const blueN = teamCount(TEAM.BLUE);
    const redHole = redN < currentTeamSize();
    const blueHole = blueN < currentTeamSize();
    if (redHole && !blueHole) return TEAM.RED;
    if (blueHole && !redHole) return TEAM.BLUE;
    if (redHole && blueHole) return redN <= blueN ? TEAM.RED : TEAM.BLUE;
    return 0;
  }

  function currentCaptain() {
    const { red, blue } = list();
    const team = pickingTeam();
    if (!team) return null;
    const side = team === TEAM.RED ? red : blue;
    // AFK que ainda aparece no time (lista stale) não herda o pick.
    const cap = side.find((p) => !excluded(p));
    if (cap) return cap;
    // 1v1 no começo: o time ficou vazio, quem restou escolhe o adversário.
    if (replacement && Number(replacement.teamSize) === 1) {
      const other = team === TEAM.RED ? blue : red;
      return other.find((p) => !excluded(p)) || null;
    }
    return null;
  }

  /**
   * Sempre tenta ter um capitão no time que precisa pickar.
   * Sobe o 1º do spec pronto se o time ficou vazio (timeout/AFK/saída).
   * @returns {object|null} capitão atual após garantir
   */
  function ensureCaptain() {
    let cap = currentCaptain();
    if (cap) return cap;
    const team = pickingTeam();
    if (!team) return null;
    const { specReady } = list();
    const next = specReady[0];
    if (!next) return null;
    if (typeof onPickFromSpec === "function") onPickFromSpec(next, team);
    setTeam(next.id, team);
    room.sendAnnouncement(
      `${next.name} virou capitão do time ${team === TEAM.RED ? "vermelho" : "azul"}.`,
      null,
      0x3498db,
      "bold",
      1
    );
    return currentCaptain();
  }

  function teamForCaptain(cap) {
    if (replacement) return replacement.targetTeam;
    return pickingTeam() || cap?.team || 0;
  }

  function promoteSpecTo(team) {
    const next = list().specReady[0];
    if (!next) return false;
    setTeam(next.id, team);
    return true;
  }

  function promoteSpecsTo(team, maxMoves = currentTeamSize()) {
    let moved = 0;
    while (teamCount(team) < currentTeamSize() && moved < maxMoves && list().specReady[0]) {
      const next = list().specReady[0];
      if (typeof onPickFromSpec === "function") onPickFromSpec(next, team);
      setTeam(next.id, team);
      moved++;
    }
    return moved;
  }

  function teamHasHole(team) {
    return teamCount(team) < currentTeamSize();
  }

  function holesByTeam() {
    return {
      red: Math.max(0, currentTeamSize() - teamCount(TEAM.RED)),
      blue: Math.max(0, currentTeamSize() - teamCount(TEAM.BLUE)),
    };
  }

  /**
   * Winner stays: vencedores cheios + perdedores ainda no outro time (async).
   * Devolve todos pro spec e sobe o 1º elegível como capitão — nunca picka
   * em cima de 2–3 perdedores que ainda não saíram.
   */
  function normalizeWinnerStaysSide() {
    if (replacement) return false;
    const size = currentTeamSize();
    const redN = teamCount(TEAM.RED);
    const blueN = teamCount(TEAM.BLUE);

    if (redN >= size && blueN > 1) {
      const waiting = list().specReady.slice();
      const { blue } = list();
      for (const p of eligibleOn(blue)) setTeam(p.id, TEAM.SPEC);
      const captain = waiting[0] || list().specReady[0];
      if (captain) setTeam(captain.id, TEAM.BLUE);
      return true;
    }
    if (blueN >= size && redN > 1) {
      const waiting = list().specReady.slice();
      const { red } = list();
      for (const p of eligibleOn(red)) setTeam(p.id, TEAM.SPEC);
      const captain = waiting[0] || list().specReady[0];
      if (captain) setTeam(captain.id, TEAM.RED);
      return true;
    }
    return false;
  }

  /**
   * Completa sozinho o time da vez quando o spec tem exatamente as vagas
   * (1=1, 2=2, 3=3). Mais opções que vagas → o capitão escolhe.
   * Ao vivo: auto só com vagas = opções elegíveis (AFK não entram na conta).
   */
  function isLiveReplacement() {
    return !!replacement && !!room.getScores();
  }

  function tryFillExactHoles() {
    if (!active) return false;
    const { specReady } = list();

    if (replacement) {
      const holes = holesByTeam();
      const need =
        replacement.targetTeam === TEAM.RED ? holes.red : holes.blue;
      const otherTeam = replacement.targetTeam === TEAM.RED ? TEAM.BLUE : TEAM.RED;
      if (
        need > 0 &&
        specReady.length > 0 &&
        specReady.length < need &&
        teamCount(otherTeam) >= currentTeamSize() &&
        teamCount(replacement.targetTeam) === 0
      ) {
        const names = [];
        for (const p of [...specReady]) {
          if (typeof onPickFromSpec === "function") onPickFromSpec(p, replacement.targetTeam);
          setTeam(p.id, replacement.targetTeam);
          names.push(p.name);
        }
        room.sendAnnouncement(
          `${names.join(", ")} entraram (${names.length} no spec, ${need} vagas) — equilibrando times.`,
          null,
          0x2ecc71,
          "bold",
          1
        );
        const onReady = replacement.onReady;
        deactivate();
        afterTeamChange(() => onReady?.({ cancelled: true, partial: true }));
        return true;
      }

      if (need <= 0 || specReady.length !== need) return false;
      const names = [];
      let last = null;
      for (let n = 0; n < need; n++) {
        const p = specReady[n];
        if (!p) return false;
        if (typeof onPickFromSpec === "function") onPickFromSpec(p, replacement.targetTeam);
        setTeam(p.id, replacement.targetTeam);
        names.push(p.name);
        last = p;
      }
      const arrow = replacement.targetTeam === TEAM.RED ? "🔴" : "🔵";
      room.sendAnnouncement(
        need === 1
          ? `${names[0]} entrou automaticamente (única opção) → ${arrow}`
          : `${names.join(", ")} entraram automaticamente (${need} vagas, ${need} opções) → ${arrow}`,
        null,
        0x2ecc71,
        "bold",
        1
      );
      const onReady = replacement.onReady;
      deactivate();
      afterTeamChange(() => onReady?.({ chosen: last }));
      return true;
    }

    const team = pickingTeam();
    if (!team) return false;
    const holes = holesByTeam();
    const need = team === TEAM.RED ? holes.red : holes.blue;
    // Mais specs que vagas deste time → pick. Menos → abort em outro lugar.
    if (need <= 0 || specReady.length !== need) return false;

    for (let n = 0; n < need; n++) {
      const p = specReady[n];
      if (p) setTeam(p.id, team);
    }
    room.sendAnnouncement(
      "Sem escolhas restantes — bot completou os times.",
      null,
      0x9b59b6,
      "bold",
      2
    );
    if (bothFull()) {
      deactivate();
      afterTeamChange(onReadyToStart);
      return true;
    }
    if (!beginCaptainPickTurn()) {
      afterTeamChange(() => promptCaptain({ allowExactFill: true }));
    } else {
      afterTeamChange(() => beginCaptainPickTurn({ refreshOnly: true }));
    }
    return true;
  }

  /**
   * Ninguém elegível para escolher/ser escolhido: devolve o controle ao lobby.
   * Sem isso o choose fica ativo para sempre (e a reposição deixa o jogo pausado).
   */
  function abortChoose(reason) {
    const onReady = replacement?.onReady || null;
    deactivate();
    if (reason) room.sendAnnouncement(reason, null, 0xe67e22, "normal", 1);
    if (onReady) afterTeamChange(() => onReady({ cancelled: true }));
    else if (typeof onAborted === "function") afterTeamChange(onAborted);
  }

  /** Spec sem elegíveis: encerra choose/reposição em vez de pausa ou timer presos. */
  function abortIfNoEligibleSpec() {
    if (!active) return false;
    const { specReady, spec } = list();
    if (specReady.length > 0) return false;
    abortChoose(
      isLiveReplacement()
        ? "Sem jogadores elegíveis no spec — equilibrando times."
        : spec.length
          ? "Ninguém elegível no spec (todos AFK) — voltando ao lobby."
          : "Sem jogadores no spec — voltando ao lobby."
    );
    return true;
  }

  function promptCaptain({ allowExactFill = true } = {}) {
    clearCapTimeout();
    if (!active) return;
    if (tryFinishChoose()) return;
    if (allowExactFill && tryFillExactHoles()) return;

    const team = pickingTeam() || (replacement && replacement.targetTeam) || 0;
    if (!team) return;

    let { specReady } = list();
    // Única opção restante: sobe sozinho (ensureCaptain se o time estiver vazio).
    if (specReady.length === 1 && teamHasHole(team)) {
      const cap = ensureCaptain() || currentCaptain();
      if (cap) {
        if (tryFinishChoose() || tryFillExactHoles()) return;
        ({ specReady } = list());
        if (specReady.length === 1 && teamHasHole(team)) {
          applyCaptainPick(cap, specReady[0], team, "");
        } else {
          promptCaptain({ allowExactFill });
        }
        return;
      }
    }

    if (!beginCaptainPickTurn()) {
      const cap = ensureCaptain();
      if (!cap) abortChoose("Sem jogadores para escolher — voltando ao lobby.");
      else if (!beginCaptainPickTurn()) abortChoose("Sem jogadores para escolher — voltando ao lobby.");
    }
  }

  /**
   * Capitão não escolheu a tempo: AFK no spec (fim da fila) e o próximo picka.
   * Se depois disso sobrar exatamente N vagas e N specs, aí sim completa sozinho.
   */
  function parkTimedOutCaptain(cap) {
    if (!cap) return;
    clearCapTimeout();
    const team = replacement?.targetTeam || cap.team;
    setTeam(cap.id, TEAM.SPEC);
    if (typeof onCaptainTimeout === "function") onCaptainTimeout(cap);
    room.sendAnnouncement(
      `${cap.name} não escolheu a tempo — AFK no fim da fila.`,
      null,
      0xe67e22,
      "bold",
      1
    );

    const side = (team === TEAM.RED ? list().red : list().blue).filter(
      (p) => !excluded(p)
    );
    if (side.length) {
      room.sendAnnouncement(
        `${side[0].name} é o novo capitão e escolhe agora.`,
        null,
        0x3498db,
        "bold",
        1
      );
      promptCaptain();
      return;
    }

    // Time ficou vazio: sobe alguém do spec como capitão (nunca deixa sem pick).
    const promoted = ensureCaptain();
    if (promoted) {
      promptCaptain();
      return;
    }
    // Sem spec pronto: auto-completa se der; senão cancela a reposição/choose.
    if (tryFillExactHoles()) return;
    onPlayerLeave({ skipId: cap.id });
  }

  function bothFull() {
    return (
      teamCount(TEAM.RED) >= currentTeamSize() &&
      teamCount(TEAM.BLUE) >= currentTeamSize()
    );
  }

  function replacementTeamFull() {
    if (!replacement) return false;
    return teamCount(replacement.targetTeam) >= currentTeamSize();
  }

  /** 4v4 fechado (pick ou admin): encerra choose/reposição e não kicka capitão. */
  function tryFinishChoose(movedPlayer) {
    if (!active) return false;
    if (replacement) {
      // Ao vivo: counts “4v4” (jogador ainda na lista) não fecham o pick.
      // Só vale se alguém do spec de fato entrou no time.
      if (isLiveReplacement() && !movedPlayer) return false;
      if (!replacementTeamFull() && !bothFull()) return false;
      const onReady = replacement.onReady;
      const target = replacement.targetTeam;
      const side = eligibleOn(target === TEAM.RED ? list().red : list().blue);
      const chosen =
        (movedPlayer && movedPlayer.team === target
          ? side.find((p) => p.id === movedPlayer.id)
          : null) ||
        side[side.length - 1] ||
        movedPlayer ||
        null;
      deactivate();
      afterTeamChange(() => onReady?.({ chosen }));
      return true;
    }
    if (!bothFull()) return false;
    deactivate();
    afterTeamChange(onReadyToStart);
    return true;
  }

  function deactivate() {
    active = false;
    lockedSize = 0;
    clearCapTimeout();
    replacement = null;
    lastPickPromptAt = 0;
    lastPickCaptainId = 0;
  }

  function activate() {
    if (active) return;
    active = true;
    lockedSize = computeTeamSize();
    if (tryFillExactHoles()) return;
    promptCaptain();
  }

  /**
   * Há vaga(s) no time desfalcado. Auto se vagas = opções; senão o capitão escolhe.
   * `opts.teamSize` mantém o formato (2v2/3v3); o padrão é 4v4.
   */
  function startReplacement(targetTeam, onReady, opts = {}) {
    clearCapTimeout();
    const teamSize = Math.max(
      1,
      Math.min(config.teamSize, Number(opts.teamSize) || config.teamSize)
    );
    replacement = { targetTeam, onReady, teamSize };
    active = true;
    lockedSize = teamSize;
    const { specReady } = list();
    const have = teamCount(targetTeam);
    const need = Math.max(0, teamSize - have);
    if (specReady.length !== need) {
      room.sendAnnouncement(
        `🔄 Reposição: capitão ${targetTeam === TEAM.RED ? "vermelho" : "azul"} escolhe um jogador do spec.`,
        null,
        0x9b59b6,
        "bold",
        2
      );
    }
    promptCaptain();
  }

  /**
   * Pós-streak: times já montados (vencedores no red + 1 azul).
   * Não reseta o campo.
   */
  function continueFromField({ winnerStays = false } = {}) {
    if (room.getScores()) {
      try {
        room.pauseGame(true);
      } catch {
        /* ignore */
      }
    }
    if (bothFull()) {
      // 4v4 ainda no campo: perdedores não saíram (async). Winner stays limpa antes de abortar.
      if (winnerStays && normalizeWinnerStaysSide()) {
        /* segue montando o choose */
      } else if (list().specReady.length) {
        return;
      } else {
        deactivate();
        onReadyToStart();
        return;
      }
    }

    if (winnerStays) normalizeWinnerStaysSide();

    const redN = teamCount(TEAM.RED);
    const blueN = teamCount(TEAM.BLUE);
    // AFK ainda no time (lista stale) não conta como “cheio”.
    if (redN >= currentTeamSize() && blueN === 0) {
      if (!promoteSpecTo(TEAM.BLUE)) {
        abortChoose("Sem jogadores elegíveis para o outro time — voltando ao lobby.");
        return;
      }
    } else if (blueN >= currentTeamSize() && redN === 0) {
      if (!promoteSpecTo(TEAM.RED)) {
        abortChoose("Sem jogadores elegíveis para o outro time — voltando ao lobby.");
        return;
      }
    } else if (redN === 0 || blueN === 0) {
      if (redN === 0 && !promoteSpecTo(TEAM.RED)) {
        abortChoose("Sem jogadores elegíveis — voltando ao lobby.");
        return;
      }
      if (teamCount(TEAM.BLUE) === 0 && !promoteSpecTo(TEAM.BLUE)) {
        abortChoose("Sem jogadores elegíveis — voltando ao lobby.");
        return;
      }
    }

    if (active) {
      promptCaptain();
      return;
    }
    activate();
  }

  /** Alguém entrou no meio do choose: atualiza a lista sem zerar o timer do capitão. */
  function onPlayerJoin() {
    if (!active) return;
    if (tryFinishChoose()) return;
    if (tryFillExactHoles()) return;

    const team = pickingTeam() || (replacement && replacement.targetTeam) || 0;
    if (!team || (!replacement && !teamHasHole(team))) return;

    let { specReady } = list();
    if (!specReady.length) {
      if (abortIfNoEligibleSpec()) return;
    }

    // 1 spec / 1 vaga: precisa do fluxo completo (auto-sobe ou abort).
    if (specReady.length === 1 && teamHasHole(team)) {
      promptCaptain();
      return;
    }

    const cap = currentCaptain();
    if (!cap) {
      promptCaptain();
      return;
    }

    // refreshLobby batendo de novo: só atualiza a lista se o timer ainda está no prazo.
    if (isCapTimeoutLive()) {
      beginCaptainPickTurn({ refreshOnly: true });
      return;
    }
    promptCaptain();
  }

  /**
   * Admin mexeu nos times durante o choose: se completou 4v4 inicia,
   * se esvaziou um time refaz capitães, senão só atualiza a lista.
   * Reposição ocorre com o jogo pausado (getScores() != null).
   */
  function onTeamChange(movedPlayer) {
    if (!active) return;
    if (room.getScores() && !replacement) return;
    if (tryFinishChoose(movedPlayer)) return;
    if (replacement) {
      const cap = currentCaptain();
      const { spec } = list();
      // Ao vivo: spec vazio (AFK ainda no time / ninguém no spec) espera pausado.
      if (!isLiveReplacement() && (!cap || !spec.length)) {
        const onReady = replacement.onReady;
        deactivate();
        onReady?.({ cancelled: true });
        return;
      }
      promptCaptain();
      return;
    }
    if (teamCount(TEAM.RED) === 0 || teamCount(TEAM.BLUE) === 0) {
      // Quem o admin acabou de mandar pro spec não volta na hora como capitão.
      onPlayerLeave({ skipId: movedPlayer?.team === TEAM.SPEC ? movedPlayer.id : null });
      return;
    }
    promptCaptain();
  }

  /**
   * Monta o 4v4 a partir do campo atual. Nunca manda os dois times pro spec
   * para dois capitães escolherem do zero: quem já está em um time fica.
   * Sem times (todo mundo no spec) sobe pares na ordem e começa.
   * Com vencedores (um lado já em 4), o outro time é montado no choose.
   */
  function tryStartChoose() {
    if (room.getScores()) return;
    if (active) {
      promptCaptain();
      return;
    }

    const eligible = room
      .getPlayerList()
      .filter((p) => p.id !== 0 && !excluded(p));
    if (eligible.length < currentTeamSize() * 2) {
      deactivate();
      return;
    }

    if (bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }

    // Capitães escolhem. Auto só quando o time da vez tem exatamente N specs
    // para N vagas (tryFillExactHoles) ou sobra uma opção.
    continueFromField();
  }

  /** Números seguem a lista mostrada ao capitão (sem AFK). */
  function pickSpec(indexOrMode) {
    return pickFromSpecList(list().specReady, indexOrMode);
  }

  /**
   * @returns {boolean} true se consumiu a mensagem (choose)
   */
  function applyCaptainPick(player, chosen, team, token) {
    if (teamCount(team) >= currentTeamSize()) {
      if (bothFull()) {
        deactivate();
        afterTeamChange(onReadyToStart);
      } else {
        promptCaptain();
      }
      return true;
    }

    clearCapTimeout();
    if (excluded(chosen)) {
      promptCaptain();
      return true;
    }
    if (typeof onPickFromSpec === "function") onPickFromSpec(chosen, team);
    setTeam(chosen.id, team);
    const arrow = team === TEAM.RED ? "🔴" : "🔵";
    room.sendAnnouncement(
      token
        ? `${player.name} escolheu ${chosen.name} → ${arrow}`
        : `${chosen.name} entrou automaticamente (única opção) → ${arrow}`,
      null,
      0x2ecc71,
      "bold",
      1
    );

    if (replacement) {
      if (replacementTeamFull() || bothFull()) {
        const onReady = replacement.onReady;
        deactivate();
        afterTeamChange(() => onReady?.({ chosen }));
        return true;
      }
      if (!beginCaptainPickTurn()) {
        afterTeamChange(() => promptCaptain({ allowExactFill: true }));
      } else {
        afterTeamChange(() => beginCaptainPickTurn({ refreshOnly: true }));
      }
      return true;
    }

    if (bothFull()) {
      deactivate();
      afterTeamChange(onReadyToStart);
      return true;
    }

    // Lista + timer na hora; depois do defer só renumera (times async do Haxball).
    if (!beginCaptainPickTurn()) {
      afterTeamChange(() => promptCaptain({ allowExactFill: true }));
    } else {
      afterTeamChange(() => beginCaptainPickTurn({ refreshOnly: true }));
    }
    return true;
  }

  function handleCaptainChat(player, message) {
    // Choose ativo manda, mesmo com o jogo rolando ou pausado: era esse guard
    // que deixava o capitão sem pick quando a partida começava incompleta.
    if (!active) return false;
    const token = String(message || "").trim().split(/\s+/)[0];
    if (!isChooseToken(token)) return false;

    const cap = currentCaptain();
    if (!cap || player.id !== cap.id) {
      tell(player.id, "Só o capitão da vez escolhe.", 0xe67e22, "bold", 2);
      return true;
    }
    if (bothFull()) return true;

    const chosen = pickSpec(token);
    if (!chosen) {
      tell(player.id, "Escolha inválida — a lista mudou. Confira os números:", 0xe74c3c, "normal", 1);
      announceSpecList(player.id);
      return true;
    }

    const team = teamForCaptain(cap);
    if (!team || (!replacement && !teamHasHole(team))) return true;
    return applyCaptainPick(player, chosen, team, token);
  }

  function onPlayerLeave({ skipId = null, allowExactFill = true } = {}) {
    if (!active) return;
    if (replacement) {
      if (tryFillExactHoles()) return;
      const cap = currentCaptain() || ensureCaptain();
      const { specReady } = list();
      if (!cap || !specReady.length) {
        const onReady = replacement.onReady;
        deactivate();
        onReady?.({ cancelled: true });
        return;
      }
      promptCaptain();
      return;
    }

    const players = room.getPlayerList().filter((p) => p.id !== 0 && !excluded(p));
    const size = currentTeamSize();
    let { red, blue, spec, specReady } = list();
    const redN = teamCount(TEAM.RED);
    const blueN = teamCount(TEAM.BLUE);
    if (players.length < size * 2 || redN > size || blueN > size) {
      deactivate();
      room.sendAnnouncement("Choose cancelado — poucos jogadores.", null, 0xe67e22, "normal", 1);
      return;
    }

    // Sem streak: se ficou 2 a mais de um lado, o último escolhido volta pro spec (FC/Wazarr).
    const streakNow = typeof getStreak === "function" ? getStreak() : 0;
    if (!room.getScores() && streakNow === 0 && Math.abs(redN - blueN) === 2) {
      const largerSide = redN > blueN ? eligibleOn(red) : eligibleOn(blue);
      const extra = largerSide[largerSide.length - 1];
      setTeam(extra.id, TEAM.SPEC);
      room.sendAnnouncement("🤖 Equilibrando: último escolhido voltou pro spec.", null, 0x3498db, "normal", 1);
      ({ red, blue, spec, specReady } = list());
    }

    // Time vazio → sobe o 1º do spec pronto (AFK não sobe). Nunca aborta se ainda há gente.
    if (teamCount(TEAM.RED) === 0 || teamCount(TEAM.BLUE) === 0) {
      const empty = teamCount(TEAM.RED) === 0 ? TEAM.RED : TEAM.BLUE;
      const next =
        (skipId ? specReady.find((p) => p.id !== skipId) : null) || specReady[0];
      if (next) {
        if (typeof onPickFromSpec === "function") onPickFromSpec(next, empty);
        setTeam(next.id, empty);
        room.sendAnnouncement(
          `${next.name} virou capitão do time ${empty === TEAM.RED ? "vermelho" : "azul"}.`,
          null,
          0x3498db,
          "bold",
          1
        );
        ({ red, blue, spec, specReady } = list());
      } else if (
        (teamCount(TEAM.RED) >= currentTeamSize() && teamCount(TEAM.BLUE) === 0) ||
        (teamCount(TEAM.BLUE) >= currentTeamSize() && teamCount(TEAM.RED) === 0)
      ) {
        promptCaptain();
        return;
      } else if (ensureCaptain()) {
        ({ red, blue, spec, specReady } = list());
      } else {
        abortChoose("Time sem capitão e sem spec pronto — voltando ao lobby.");
        return;
      }
    }

    if (allowExactFill && tryFillExactHoles()) return;

    // Times iguais e quase sem spec pronto → se 3v3/4v4 pronto, inicia
    if (teamCount(TEAM.RED) === teamCount(TEAM.BLUE) && specReady.length < 2 && bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }

    promptCaptain({ allowExactFill });
  }

  return {
    isActive: () => active,
    isReplacement: () => !!replacement,
    confirmTeamChange(player) {
      if (pendingTeams.get(player.id) === player.team) {
        pendingTeams.delete(player.id);
      }
    },
    tryStartChoose,
    startReplacement,
    continueFromField,
    deactivate,
    abortIfNoEligibleSpec,
    handleCaptainChat,
    onPlayerLeave,
    onPlayerJoin,
    onTeamChange,
    bothFull,
    list,
    promptCaptain,
    currentCaptain,
    pickPromptStale,
    isCapTimeoutLive,
    beginCaptainPickTurn,
  };
}

module.exports = { createChooseController, TEAM };
