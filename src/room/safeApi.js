/**
 * A API do Haxball lança quando o alvo já saiu da sala (ou o estado do jogo mudou
 * no meio de um lote de movimentações). Sem isso, uma exceção derruba o handler
 * inteiro e a sala fica com times pela metade / jogo pausado para sempre.
 */
const GUARDED = [
  "setPlayerTeam",
  "setPlayerAdmin",
  "kickPlayer",
  "clearBan",
  "pauseGame",
  "startGame",
  "stopGame",
  "setCustomStadium",
  "setDefaultStadium",
  "setScoreLimit",
  "setTimeLimit",
  "setTeamsLock",
  "startRecording",
  "stopRecording",
  "sendAnnouncement",
  "setPlayerDiscProperties",
];

function guardRoomApi(room, { log = console.warn } = {}) {
  if (!room || room.__guarded) return room;
  for (const name of GUARDED) {
    const original = room[name];
    if (typeof original !== "function") continue;
    room[name] = function guarded(...args) {
      try {
        return original.apply(room, args);
      } catch (err) {
        log(`[room] ${name} falhou: ${err?.message || err}`);
        return null;
      }
    };
  }
  room.__guarded = true;
  return room;
}

module.exports = { guardRoomApi };
