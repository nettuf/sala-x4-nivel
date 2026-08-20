/**
 * !bet — contador eterno de apostas na Haxbooket.
 * !provocar — zoação aleatória (o antigo !bet).
 */

function formatBetLine(n) {
  const count = Math.max(1, Math.floor(Number(n) || 1));
  return `🎲 Alguém apostou na Haxbooket pela ${count}ª vez.`;
}

const TEASE_LINES = [
  (n) => `🎲 Aposta certa: ${n} ia entregar — e entregou.`,
  (n) => `🎲 ${n} confirmou o flop ao vivo.`,
  (n) => `🎲 Alguém pagou ${n} pra jogar contra o próprio time.`,
  (n) => `🎲 ${n} inventou um novo jeito de errar o passe.`,
  (n) => `🎲 Estatística oficial: ${n} está 100% no modo doação.`,
  (n) => `🎲 ${n} viu o gol aberto e preferiu o meme.`,
  (n) => `🎲 Var conferiu: ${n} fez de propósito.`,
  (n) => `🎲 ${n} jogou tanto que o adversário agradeceu.`,
  (n) => `🎲 Se tivesse um prêmio de entregar, ${n} era favorito.`,
  (n) => `🎲 ${n} errou tão bonito que quase parece talento.`,
  (n) => `🎲 Replay do erro de ${n} já está nos stories da sala.`,
  (n) => `🎲 ${n} pediu bola, recebeu, e devolveu pro outro time.`,
  (n) => `🎲 Momento histórico: ${n} quase acertou. Quase.`,
  (n) => `🎲 ${n} está patrocinado pela falta de noção.`,
  (n) => `🎲 Tipster da sala: evita ${n} no próximo lance.`,
  (n) => `🎲 ${n} transformou defesa em assistência pro rival.`,
  (n) => `🎲 Não foi azar. Foi ${n}.`,
  (n) => `🎲 ${n} fez o que ninguém pediu: complicar o fácil.`,
  (n) => `🎲 Contagem regressiva até o próximo erro de ${n}… já foi.`,
  (n) => `🎲 ${n} entrou no modo "ajuda o inimigo".`,
];

function pickTeaseLine(name, rng = Math.random) {
  const nick = String(name || "?").trim() || "?";
  const i = Math.min(TEASE_LINES.length - 1, Math.floor(rng() * TEASE_LINES.length));
  return TEASE_LINES[Math.max(0, i)](nick);
}

/**
 * Alvo do !provocar: nick/#id passado, ou alguém aleatório da sala (de preferência em campo).
 */
function resolveTeaseTarget(room, actor, mention, rng = Math.random) {
  if (mention) {
    const { findPlayer } = require("../utils");
    return findPlayer(room, mention);
  }
  const humans = room.getPlayerList().filter((p) => p.id !== 0);
  if (!humans.length) return null;
  const others = humans.filter((p) => p.id !== actor?.id);
  const poolBase = others.length ? others : humans;
  const onField = poolBase.filter((p) => p.team !== 0);
  const pool = onField.length ? onField : poolBase;
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[Math.max(0, i)] || null;
}

module.exports = { formatBetLine, TEASE_LINES, pickTeaseLine, resolveTeaseTarget };
