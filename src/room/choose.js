const config = require("../config");
const { pickFromSpecList, isChooseToken } = require("../gameLogic");

const TEAM = { SPEC: 0, RED: 1, BLUE: 2 };

/**
 * Choose mode x4: capitães (1º de cada time) escolhem specs até 4v4.
 * @param {{ onReadyToStart: Function, isExcluded?: (player: object) => boolean, getStreakLabel?: () => string }} opts
 */
function createChooseController(room, { onReadyToStart, isExcluded, getStreakLabel }) {
  let active = false;
  let timeout = null;
  const teamSize = config.teamSize;

  function excluded(p) {
    return typeof isExcluded === "function" ? !!isExcluded(p) : false;
  }

  function streakSuffix() {
    if (typeof getStreakLabel !== "function") return "";
    const s = getStreakLabel();
    return s ? ` · ${s}` : "";
  }

  function list() {
    return {
      red: room.getPlayerList().filter((p) => p.team === TEAM.RED),
      blue: room.getPlayerList().filter((p) => p.team === TEAM.BLUE),
      spec: room
        .getPlayerList()
        .filter((p) => p.team === TEAM.SPEC && p.id !== 0 && !excluded(p)),
    };
  }

  function clearCapTimeout() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  function announceSpecList(captainId) {
    const { spec } = list();
    if (!spec.length) {
      room.sendAnnouncement("Sem jogadores no spec.", captainId, 0xe74c3c, "bold", 2);
      return;
    }
    const line = spec.map((p, i) => `${p.name}[${i + 1}]`).join(", ");
    room.sendAnnouncement(`Specs: ${line}`, captainId, 0x3498db, "bold", 1);
    room.sendAnnouncement(
      `Escolha em ${config.chooseTimeSec}s: número | top | random | bottom${streakSuffix()}`,
      captainId,
      0xecf0f1,
      "normal",
      1
    );
  }

  function currentCaptain() {
    const { red, blue } = list();
    if (!red.length || !blue.length) return null;
    if (red.length <= blue.length) return red[0];
    return blue[0];
  }

  function promptCaptain() {
    clearCapTimeout();
    const cap = currentCaptain();
    if (!cap || !active) return;
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
  }

  function activate() {
    if (active) return;
    active = true;
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
      if (p.team !== TEAM.SPEC) room.setPlayerTeam(p.id, TEAM.SPEC);
    }

    const ordered = room
      .getPlayerList()
      .filter((p) => p.id !== 0 && p.team === TEAM.SPEC && !excluded(p));
    if (ordered.length < 2) {
      room.sendAnnouncement("Poucos jogadores elegíveis para choose (muitos AFK?).", null, 0xe67e22, "normal", 1);
      return;
    }

    room.setPlayerTeam(ordered[0].id, TEAM.RED);
    room.setPlayerTeam(ordered[1].id, TEAM.BLUE);

    if (bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }

    activate();
  }

  function pickSpec(indexOrMode) {
    return pickFromSpecList(list().spec, indexOrMode);
  }

  /**
   * @returns {boolean} true se consumiu a mensagem (choose)
   */
  function handleCaptainChat(player, message) {
    if (!active || room.getScores()) return false;
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

    const team = red.length <= blue.length ? TEAM.RED : TEAM.BLUE;
    if ((team === TEAM.RED && red.length >= teamSize) || (team === TEAM.BLUE && blue.length >= teamSize)) {
      return true;
    }

    clearCapTimeout();
    room.setPlayerTeam(chosen.id, team);
    room.sendAnnouncement(
      `${player.name} escolheu ${chosen.name} → ${team === TEAM.RED ? "🔴" : "🔵"}`,
      null,
      0x2ecc71,
      "bold",
      1
    );

    if (bothFull()) {
      deactivate();
      onReadyToStart();
    } else {
      promptCaptain();
    }
    return true;
  }

  function onPlayerLeave() {
    if (!active) return;
    const players = room.getPlayerList().filter((p) => p.id !== 0);
    if (players.length < teamSize * 2) {
      deactivate();
      room.sendAnnouncement("Choose cancelado — poucos jogadores.", null, 0xe67e22, "normal", 1);
      return;
    }

    let { red, blue, spec } = list();

    // Time vazio → sobe o 1º do spec (mantém picks já feitos)
    if (!red.length || !blue.length) {
      if (spec.length) {
        const empty = !red.length ? TEAM.RED : TEAM.BLUE;
        room.setPlayerTeam(spec[0].id, empty);
        room.sendAnnouncement(
          `${spec[0].name} virou capitão do time ${empty === TEAM.RED ? "vermelho" : "azul"}.`,
          null,
          0x3498db,
          "bold",
          1
        );
        ({ red, blue, spec } = list());
      } else {
        active = false;
        clearCapTimeout();
        tryStartChoose();
        return;
      }
    }

    // Diff == specs → bot completa o time menor e inicia (Wazarr)
    if (spec.length > 0 && Math.abs(red.length - blue.length) === spec.length) {
      const target = red.length > blue.length ? TEAM.BLUE : TEAM.RED;
      for (const p of [...spec]) {
        room.setPlayerTeam(p.id, target);
      }
      room.sendAnnouncement("Sem escolhas restantes — bot completou os times.", null, 0x9b59b6, "bold", 2);
      deactivate();
      onReadyToStart();
      return;
    }

    // Times iguais e quase sem spec → se 4v4 pronto, inicia
    if (red.length === blue.length && spec.length < 2 && bothFull()) {
      deactivate();
      onReadyToStart();
      return;
    }

    promptCaptain();
  }

  return {
    isActive: () => active,
    tryStartChoose,
    continueFromField,
    deactivate,
    handleCaptainChat,
    onPlayerLeave,
    onPlayerJoin,
    onTeamChange,
    bothFull,
    list,
    promptCaptain,
  };
}

module.exports = { createChooseController, TEAM };
