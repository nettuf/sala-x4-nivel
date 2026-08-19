/**
 * Lógica pura de partida (testável sem haxball.js).
 */

/**
 * @param {{ team: number, auth?: string, name?: string }[]} touches — mais recente primeiro
 * @param {number} scoringTeam — 1 red / 2 blue
 */
function attributeGoal(touches, scoringTeam) {
  const t0 = touches?.[0] || null;
  const t1 = touches?.[1] || null;
  if (!t0) {
    return { scorer: null, assist: null, isOwnGoal: false };
  }
  if (t0.team === scoringTeam) {
    const assist =
      t1 && t1.team === scoringTeam && t1.auth !== t0.auth ? t1 : null;
    return { scorer: t0, assist, isOwnGoal: false };
  }
  return { scorer: t0, assist: null, isOwnGoal: true };
}

function isValidMatchScores(scores, { scoreLimit = 3, timeLimitMin = 3, endByVictory = false } = {}) {
  if (!scores) return false;
  const hitScore =
    scores.red >= (scores.scoreLimit || scoreLimit) ||
    scores.blue >= (scores.scoreLimit || scoreLimit);
  const timeLimitSec = scores.timeLimit || timeLimitMin * 60;
  const enoughTime = timeLimitSec > 0 && scores.time >= timeLimitSec * (5 / 6);
  return hitScore || enoughTime || endByVictory;
}

function pickFromSpecList(spec, token) {
  if (!spec?.length) return null;
  const mode = String(token || "").toLowerCase();
  if (mode === "top" || mode === "auto") return spec[0];
  if (mode === "bottom" || mode === "bot") return spec[spec.length - 1];
  if (mode === "random" || mode === "rand") {
    return spec[Math.floor(Math.random() * spec.length)];
  }
  const n = Number(mode);
  if (Number.isFinite(n) && n >= 1 && n <= spec.length) return spec[n - 1];
  return null;
}

function isChooseToken(token) {
  return /^(top|auto|bottom|bot|random|rand|\d+)$/i.test(String(token || ""));
}

/**
 * Ragequit (Wazarr/Fazendão): após saída, times desiguais, placar com diferença 2
 * a favor do time maior, e tempo ≥ 5/6 do limite.
 * @returns {null | { winner: 1|2 }}
 */
function detectRageQuit({ redCount, blueCount, scores }) {
  if (!scores) return null;
  if (redCount === blueCount) return null;
  const timeLimit = scores.timeLimit || 0;
  if (!(timeLimit > 0 && scores.time >= timeLimit * (5 / 6))) return null;

  if (redCount < blueCount) {
    if (scores.blue - scores.red === 2) return { winner: 2 };
  } else if (scores.red - scores.blue === 2) {
    return { winner: 1 };
  }
  return null;
}

module.exports = {
  attributeGoal,
  isValidMatchScores,
  pickFromSpecList,
  isChooseToken,
  detectRageQuit,
};
