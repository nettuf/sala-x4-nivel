const config = require("../config");
const { TEAM } = require("./choose");
const { detectRageQuit } = require("../gameLogic");

/**
 * Casos de saída alinhados ao bot Wazarr/Fazendão:
 * - ragequit no fim do jogo
 * - time vazio → puxa do spec ou encerra
 * - desbalanceio → preenche do spec
 * - warmup (<8) → para e rebalanceia
 *
 * @returns {"ragequit"|"warmup-reset"|"filled"|"ended"|"none"}
 */
function handleInGameLeave(room, match, { isExcluded } = {}) {
  if (!match.isRunning() && !room.getScores()) return "none";

  const players = room.getPlayerList().filter((p) => p.id !== 0);
  const count = players.length;
  const red = players.filter((p) => p.team === TEAM.RED);
  const blue = players.filter((p) => p.team === TEAM.BLUE);
  const specs = players.filter(
    (p) => p.team === TEAM.SPEC && !(typeof isExcluded === "function" && isExcluded(p))
  );

  const scores = room.getScores();
  if (scores && count >= config.teamSize * 2) {
    const rq = detectRageQuit({
      redCount: red.length,
      blueCount: blue.length,
      scores,
    });
    if (rq) {
      room.sendAnnouncement("Ragequit detectado, o jogo terminou.", null, 0xe74c3c, "bold", 2);
      match.markVictory();
      setTimeout(() => room.stopGame(), 100);
      return "ragequit";
    }
  }

  // Warmup / menos que 4v4: reinicia lobby limpo
  if (count < config.teamSize * 2) {
    match.cancelRecordingOnly();
    if (room.getScores()) room.stopGame();
    return "warmup-reset";
  }

  // Partida com sala ≥8: tenta manter times
  if (!red.length || !blue.length) {
    if (specs.length) {
      const empty = !red.length ? TEAM.RED : TEAM.BLUE;
      room.setPlayerTeam(specs[0].id, empty);
      room.sendAnnouncement(
        `${specs[0].name} entrou no time ${empty === TEAM.RED ? "vermelho" : "azul"} (vaga).`,
        null,
        0x3498db,
        "normal",
        1
      );
      return "filled";
    }
    room.sendAnnouncement("Time sem jogadores — encerrando partida.", null, 0xe67e22, "bold", 2);
    match.cancelRecordingOnly();
    if (room.getScores()) room.stopGame();
    return "ended";
  }

  let r = red.length;
  let b = blue.length;
  const queue = [...specs];
  let moved = 0;
  while (Math.abs(r - b) > 0 && queue.length) {
    const target = r < b ? TEAM.RED : TEAM.BLUE;
    const p = queue.shift();
    room.setPlayerTeam(p.id, target);
    if (target === TEAM.RED) r += 1;
    else b += 1;
    moved += 1;
  }
  if (moved) {
    room.sendAnnouncement(`Balance automático: ${moved} jogador(es) do spec entraram.`, null, 0x3498db, "normal", 1);
    return "filled";
  }

  return "none";
}

module.exports = { handleInGameLeave };
