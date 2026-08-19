const config = require("../config");
const { pickFromSpecList, isChooseToken, rememberedChooseMode } = require("../gameLogic");

const TEAM = { SPEC: 0, RED: 1, BLUE: 2 };

/**
 * Choose mode x4: capitães (1º de cada time) escolhem specs até 4v4.
 * @param {{ onReadyToStart: Function, isExcluded?: (player: object) => boolean, getStreakLabel?: () => string, getStreak?: () => number, deferAfterTeamChange?: (callback: Function) => void }} opts
 */
function createChooseController(room, {
  onReadyToStart,
  isExcluded,
  getStreakLabel,
  getStreak,
  deferAfterTeamChange,
  onPickFromSpec,
}) {
  let active = false;
  let timeout = null;
  let replacement = null;
  const pendingTeams = new Map();
  const lastMode = { [TEAM.RED]: "", [TEAM.BLUE]: "" };
  const teamSize = config.teamSize;

  function excluded(p) {
    return typeof isExcluded === "function" ? !!isExcluded(p) : false;
  }

  function streakSuffix() {
    if (typeof getStreakLabel !== "function") return "";
    const s = getStreakLabel();
    return s ? ` · ${s}` : "";
  }

  function setTeam(playerId, team) {
    pendingTeams.set(playerId, team);
    room.setPlayerTeam(playerId, team);
    const applied = room
      .getPlayerList()
      .find((player) => player.id === playerId)?.team;
    if (applied === team) {
      pendingTeams.delete(playerId);
      return;
    }
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

  function clearCapTimeout() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  function announceSpecList(captainId) {
    const { spec, specReady } = list();
    if (!spec.length) {
      room.sendAnnouncement("Sem jogadores no spec.", captainId, 0xe74c3c, "bold", 2);
      return;
    }
    const line = spec
      .map((p, i) => {
        const mark = excluded(p) ? " AFK" : "";
        return `${p.name}[${i + 1}]${mark}`;
      })
      .join(", ");
    room.sendAnnouncement(`Specs: ${line}`, captainId, 0x3498db, "bold", 1);
    room.sendAnnouncement(
      `Escolha em ${config.chooseTimeSec}s: número | top | random | bottom${streakSuffix()}`,
      captainId,
      0xecf0f1,
      "normal",
      1
    );
    if (specReady.length && spec.length > specReady.length) {
      room.sendAnnouncement("AFKs no fim da fila.", captainId, 0xbdc3c7, "small", 1);
    }
  }

  function currentCaptain() {
    const { red, blue } = list();
    if (replacement) {
      const team = replacement.targetTeam === TEAM.RED ? red : blue;
      return team[0] || null;
    }
    if (!red.length || !blue.length) return null;
    if (red.length <= blue.length) return red[0];
    return blue[0];
  }

  function teamForCaptain(cap) {
    if (replacement) return replacement.targetTeam;
    return cap.team;
  }

  function teamHasHole(team) {
    const { red, blue } = list();
    const count = team === TEAM.RED ? red.length : blue.length;
    return count < teamSize;
  }

  function holesByTeam() {
    const { red, blue } = list();
    return {
      red: Math.max(0, teamSize - red.length),
      blue: Math.max(0, teamSize - blue.length),
    };
  }

  /**
   * Spec pronto fecha exatamente as vagas (2 ou 3, etc.): puxa na ordem, sem pick.
   * AFKs ficam de fora. Reposição só auto-puxa quando resta 1 candidato.
   */
  function tryFillExactHoles() {
    if (!active) return false;
    const { specReady } = list();

    if (replacement) {
      if (specReady.length === 1 && currentCaptain()) {
        applyCaptainPick(currentCaptain(), specReady[0], replacement.targetTeam, "");
        return true;
      }
      return false;
    }

    const holes = holesByTeam();
    const need = holes.red + holes.blue;
    // Os dois lados com vaga: draft (capitães escolhem quem vai onde).
    // Só puxa direto quando um time já está completo e o spec fecha o outro.
    if (holes.red > 0 && holes.blue > 0) return false;
    if (need <= 0 || specReady.length !== need) return false;

    let i = 0;
    for (let n = 0; n < holes.red; n++) {
      const p = specReady[i++];
      if (p) setTeam(p.id, TEAM.RED);
    }
    for (let n = 0; n < holes.blue; n++) {
      const p = specReady[i++];
      if (p) setTeam(p.id, TEAM.BLUE);
    }
    room.sendAnnouncement(
      "Sem escolhas restantes — bot completou os times.",
      null,
      0x9b59b6,
      "bold",
      2
    );
    deactivate();
    afterTeamChange(onReadyToStart);
    return true;
  }

  function promptCaptain() {
    clearCapTimeout();
    if (!active) return;
    if (tryFillExactHoles()) return;

    const cap = currentCaptain();
    if (!cap) return;

    const { specReady, spec } = list();
    const team = teamForCaptain(cap);
    if (specReady.length === 1 && teamHasHole(team)) {
      applyCaptainPick(cap, specReady[0], team, "");
      return;
    }
    if (!specReady.length && spec.length === 1 && teamHasHole(team)) {
      applyCaptainPick(cap, spec[0], team, "");
      return;
    }

    const remembered = !replacement && lastMode[cap.team];
    if (remembered && specReady.length) {
      const chosen = pickSpec(remembered);
      if (chosen) {
        applyCaptainPick(cap, chosen, cap.team, remembered);
        return;
      }
    }

    if (!spec.length) {
      room.sendAnnouncement("Sem jogadores no spec.", cap.id, 0xe74c3c, "bold", 2);
      return;
    }

    announceSpecList(cap.id);

    const chooseTime = config.chooseTimeSec;
    timeout = setTimeout(() => {
      room.sendAnnouncement(
        `${cap.name}, ${Math.floor(chooseTime / 2)}s restantes!`,
        cap.id,
        0xf1c40f,
        "bold",
        2
      );
      timeout = setTimeout(() => {
        room.kickPlayer(cap.id, "Não escolheu a tempo (AFK no choose)", false);
      }, (chooseTime / 2) * 1000);
      if (typeof timeout.unref === "function") timeout.unref();
    }, (chooseTime / 2) * 1000);
    if (typeof timeout.unref === "function") timeout.unref();
  }

  function bothFull() {
    const { red, blue } = list();
    return red.length >= teamSize && blue.length >= teamSize;
  }

  function deactivate() {
    active = false;
    clearCapTimeout();
    replacement = null;
    lastMode[TEAM.RED] = "";
    lastMode[TEAM.BLUE] = "";
  }

  function activate() {
    if (active) return;
    active = true;
    if (tryFillExactHoles()) return;
    room.sendAnnouncement(
      `🎮 Choose ativado — ${config.chooseTimeSec}s por pick · até 4v4${streakSuffix()}`,
      null,
      0x9b59b6,
      "bold",
      2
    );
    promptCaptain();
  }

  /**
   * Há uma vaga e mais de um candidato: o capitão do time desfalcado escolhe.
   */
  function startReplacement(targetTeam, onReady) {
    clearCapTimeout();
    replacement = { targetTeam, onReady };
    active = true;
    if (list().specReady.length !== 1) {
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
  function continueFromField() {
    if (room.getScores()) return;
    const { red, blue } = list();
    if (!red.length || !blue.length) {
      tryStartChoose();
      return;
    }
    if (bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }
    if (active) {
      promptCaptain();
      return;
    }
    activate();
  }

  /** Alguém entrou no meio do choose: só atualiza a lista do capitão (não reseta times). */
  function onPlayerJoin() {
    if (!active) return;
    promptCaptain();
  }

  /**
   * Admin mexeu nos times durante o choose: se completou 4v4 inicia,
   * se esvaziou um time refaz capitães, senão só atualiza a lista.
   */
  function onTeamChange() {
    if (!active || room.getScores()) return;
    if (replacement) {
      const cap = currentCaptain();
      const { spec } = list();
      if (!cap || !spec.length) {
        const onReady = replacement.onReady;
        deactivate();
        onReady?.({ cancelled: true });
        return;
      }
      promptCaptain();
      return;
    }
    if (bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }
    const { red, blue } = list();
    if (!red.length || !blue.length) {
      onPlayerLeave();
      return;
    }
    promptCaptain();
  }

  function tryStartChoose() {
    if (room.getScores()) return;
    if (active) {
      // Já em choose — não resetar times
      promptCaptain();
      return;
    }

    const players = room.getPlayerList().filter((p) => p.id !== 0);
    if (players.length < teamSize * 2) {
      deactivate();
      return;
    }

    // Sai do warmup: elegíveis pro spec e monta 2 capitães limpos
    for (const p of players) {
      if (p.team !== TEAM.SPEC) setTeam(p.id, TEAM.SPEC);
    }

    const ordered = list().specReady;
    if (ordered.length < 2) {
      room.sendAnnouncement("Poucos jogadores elegíveis para choose (muitos AFK?).", null, 0xe67e22, "normal", 1);
      return;
    }

    setTeam(ordered[0].id, TEAM.RED);
    setTeam(ordered[1].id, TEAM.BLUE);

    if (bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }

    activate();
  }

  function pickSpec(indexOrMode) {
    const { spec, specReady } = list();
    const mode = String(indexOrMode || "").toLowerCase();
    if (mode === "top" || mode === "auto" || mode === "random" || mode === "rand") {
      return pickFromSpecList(specReady.length ? specReady : spec, indexOrMode);
    }
    return pickFromSpecList(spec, indexOrMode);
  }

  /**
   * @returns {boolean} true se consumiu a mensagem (choose)
   */
  function applyCaptainPick(player, chosen, team, token) {
    const { red, blue } = list();
    if ((team === TEAM.RED && red.length >= teamSize) || (team === TEAM.BLUE && blue.length >= teamSize)) {
      return true;
    }

    clearCapTimeout();
    if (!replacement) {
      lastMode[team] = rememberedChooseMode(token) || lastMode[team];
    }
    if (excluded(chosen) && typeof onPickFromSpec === "function") {
      onPickFromSpec(chosen);
    }
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
      const onReady = replacement.onReady;
      deactivate();
      afterTeamChange(() => onReady?.({ chosen }));
      return true;
    }

    if (bothFull()) {
      deactivate();
      afterTeamChange(onReadyToStart);
    } else {
      promptCaptain();
    }
    return true;
  }

  function handleCaptainChat(player, message) {
    // Reposição pode acontecer com o jogo pausado (getScores() != null).
    if (!active || (room.getScores() && !replacement)) return false;
    const { red, blue } = list();
    const cap = currentCaptain();
    if (!cap || player.id !== cap.id) return false;
    if (red.length >= teamSize && blue.length >= teamSize) return false;

    const token = String(message || "").trim().split(/\s+/)[0];
    if (!isChooseToken(token)) {
      return false;
    }

    const chosen = pickSpec(token);
    if (!chosen) {
      room.sendAnnouncement("Escolha inválida (ou jogador AFK). Use número, top, random ou bottom.", player.id, 0xe74c3c, "normal", 1);
      return true;
    }

    const team = replacement
      ? replacement.targetTeam
      : red.length <= blue.length
        ? TEAM.RED
        : TEAM.BLUE;
    return applyCaptainPick(player, chosen, team, token);
  }

  function onPlayerLeave() {
    if (!active) return;
    if (replacement) {
      const cap = currentCaptain();
      const { spec } = list();
      if (!cap || !spec.length) {
        const onReady = replacement.onReady;
        deactivate();
        onReady?.({ cancelled: true });
        return;
      }
      promptCaptain();
      return;
    }

    const players = room.getPlayerList().filter((p) => p.id !== 0);
    if (players.length < teamSize * 2) {
      deactivate();
      room.sendAnnouncement("Choose cancelado — poucos jogadores.", null, 0xe67e22, "normal", 1);
      return;
    }

    let { red, blue, spec, specReady } = list();

    // Sem streak: se ficou 2 a mais de um lado, o último escolhido volta pro spec (FC/Wazarr).
    const streakNow = typeof getStreak === "function" ? getStreak() : 0;
    if (!room.getScores() && streakNow === 0 && Math.abs(red.length - blue.length) === 2) {
      const larger = red.length > blue.length ? red : blue;
      const extra = larger[larger.length - 1];
      setTeam(extra.id, TEAM.SPEC);
      room.sendAnnouncement("🤖 Equilibrando: último escolhido voltou pro spec.", null, 0x3498db, "normal", 1);
      ({ red, blue, spec, specReady } = list());
    }

    // Time vazio → sobe o 1º do spec (mantém picks já feitos)
    if (!red.length || !blue.length) {
      const next = specReady[0] || spec[0];
      if (next) {
        const empty = !red.length ? TEAM.RED : TEAM.BLUE;
        if (excluded(next) && typeof onPickFromSpec === "function") onPickFromSpec(next);
        setTeam(next.id, empty);
        room.sendAnnouncement(
          `${next.name} virou capitão do time ${empty === TEAM.RED ? "vermelho" : "azul"}.`,
          null,
          0x3498db,
          "bold",
          1
        );
        ({ red, blue, spec, specReady } = list());
      } else {
        active = false;
        clearCapTimeout();
        tryStartChoose();
        return;
      }
    }

    if (tryFillExactHoles()) return;

    // Times iguais e quase sem spec pronto → se 4v4 pronto, inicia
    if (red.length === blue.length && specReady.length < 2 && bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }

    promptCaptain();
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
    handleCaptainChat,
    onPlayerLeave,
    onPlayerJoin,
    onTeamChange,
    bothFull,
    list,
    promptCaptain,
    currentCaptain,
  };
}

module.exports = { createChooseController, TEAM };
