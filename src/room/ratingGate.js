/**
 * Gate de entrada da X4 Nível: rating > minRating (default 75).
 * Fail-open quando o site não respondeu (syncOk === false).
 */

const DEFAULT_MIN_RATING = 75;

const RATING_GATE_REASON =
  "Sala Nível: rating acima de 75. Crie/vincule sua conta ou aumente o rating no site (!site).";

function parseRating(status) {
  const n = Number(status?.rating);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{ rating?: number|null, linked?: boolean }|null|undefined} status
 * @param {{ minRating?: number, syncOk?: boolean, hasAuth?: boolean }} opts
 * @returns {{ action: "allow"|"kick", reason?: string }}
 */
function evaluateRatingGate(status, opts = {}) {
  const syncOk = opts.syncOk !== false;
  const minRating = Number(opts.minRating);
  const floor = Number.isFinite(minRating) && minRating > 0 ? minRating : DEFAULT_MIN_RATING;

  // Site fora / sem key / timeout → deixa entrar
  if (!syncOk) {
    return { action: "allow", reason: "site-offline" };
  }

  // Sem auth não dá pra medir rating no site → kick (conta/vínculo)
  if (opts.hasAuth === false) {
    return { action: "kick", reason: RATING_GATE_REASON };
  }

  const rating = parseRating(status);
  const linked = status?.linked === true || (rating != null && rating >= 1);

  if (!linked || rating == null) {
    return { action: "kick", reason: RATING_GATE_REASON };
  }

  // "maior que 75" → 76+ entra; 75 e abaixo saem
  if (!(rating > floor)) {
    return { action: "kick", reason: RATING_GATE_REASON };
  }

  return { action: "allow" };
}

module.exports = {
  DEFAULT_MIN_RATING,
  RATING_GATE_REASON,
  parseRating,
  evaluateRatingGate,
};
