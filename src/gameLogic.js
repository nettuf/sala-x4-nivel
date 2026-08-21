/**
 * Lógica pura de partida (testável sem haxball.js).
 */

/**
 * Toques mais recente primeiro. Assistência = último toque de um
 * companheiro do time (pula chute de rival e o próprio goleador).
 */
function sameTouchPlayer(a, b) {
  if (!a || !b) return false;
  if (a.id != null && b.id != null && a.id === b.id) return true;
  if (a.auth && b.auth && a.auth === b.auth) return true;
  return false;
}

function isKickTouch(t) {
  return !!t && t.kind !== "body";
}

function findAssist(list, scorer, scoringTeam) {
  for (const t of list || []) {
    if (!t || t.team !== scoringTeam) continue;
    if (sameTouchPlayer(t, scorer)) continue;
    return t;
  }
  return null;
}

function attributeGoal(touches, scoringTeam) {
  const list = touches || [];
  if (!list.length) {
    return { scorer: null, assist: null, isOwnGoal: false };
  }

  // Proximidade/corpo do rival não conta como chute. Gol contra só se o
  // último chute de verdade foi do time que sofreu.
  const lastKick = list.find(isKickTouch) || null;
  const last = lastKick || list[0];

  if (last.team === scoringTeam) {
    return {
      scorer: last,
      assist: findAssist(list, last, scoringTeam),
      isOwnGoal: false,
    };
  }

  if (lastKick && lastKick.team !== scoringTeam) {
    return { scorer: lastKick, assist: null, isOwnGoal: true };
  }

  const teammate = list.find((t) => t && t.team === scoringTeam);
  if (teammate) {
    return {
      scorer: teammate,
      assist: findAssist(list, teammate, scoringTeam),
      isOwnGoal: false,
    };
  }

  return { scorer: last, assist: null, isOwnGoal: true };
}

function isValidMatchScores(scores, { scoreLimit = 3, timeLimitMin = 4, endByVictory = false } = {}) {
  if (!scores) return false;
  const hitScore =
    scores.red >= (scores.scoreLimit || scoreLimit) ||
    scores.blue >= (scores.scoreLimit || scoreLimit);
  const timeLimitSec = scores.timeLimit || timeLimitMin * 60;
  const enoughTime = timeLimitSec > 0 && scores.time >= timeLimitSec * (5 / 6);
  const hasWinner = scores.red !== scores.blue;
  // Empate não encerra: o gol de ouro resolve. Tempo esgotado só vale com vencedor.
  return hitScore || (enoughTime && hasWinner) || endByVictory;
}

/** Capitão manda `1` / `top` / `!1` / `!top` — o `!` é opcional. */
function chooseTokenKey(token) {
  let mode = String(token || "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
  if (mode.startsWith("!")) mode = mode.slice(1);
  return mode;
}

function pickFromSpecList(spec, token) {
  if (!spec?.length) return null;
  const mode = chooseTokenKey(token);
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
  return /^(top|auto|bottom|bot|random|rand|\d+)$/i.test(chooseTokenKey(token));
}

function rememberedChooseMode(token) {
  const mode = chooseTokenKey(token);
  if (mode === "top" || mode === "auto") return "top";
  if (mode === "bottom" || mode === "bot") return "bottom";
  if (mode === "random" || mode === "rand") return "random";
  return null;
}

function formatMatchClock(timeSec = 0) {
  const total = Math.max(0, Math.floor(Number(timeSec) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function pointDistance(a, b) {
  if (!a || !b) return 0;
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** km/h a partir de duas posições consecutivas da bola (tick ~1/60s). */
function ballSpeedKmh(prev, next) {
  return (pointDistance(prev, next) * 60 * 60 * 60) / 15000;
}

function possessionPercents(redTicks, blueTicks) {
  const total = redTicks + blueTicks;
  if (total <= 0) return { red: 50, blue: 50 };
  const red = (100 * redTicks) / total;
  return { red, blue: 100 - red };
}

function canJoinMatchStats(scores) {
  if (!scores) return true;
  const timeLimit = scores.timeLimit || 0;
  const tooLate = timeLimit > 0 && scores.time > timeLimit * 0.75;
  const blowout = Math.abs((scores.red || 0) - (scores.blue || 0)) >= 2;
  return !tooLate && !blowout;
}

/**
 * Ragequit clássico (Wazarr): depois da saída ficou 4v3, o time maior
 * está ganhando por 2+, e já estamos nos 5/6 finais do relógio.
 * @returns {null | { winner: 1|2 }}
 */
function detectRageQuit({ redCount, blueCount, scores }) {
  if (!scores) return null;
  if (redCount === blueCount) return null;
  const timeLimit = scores.timeLimit || 0;
  if (!(timeLimit > 0 && scores.time >= timeLimit * (5 / 6))) return null;

  const limit = Number(scores.scoreLimit) || 3;
  if (redCount < blueCount) {
    if (scores.blue - scores.red >= 2 || scores.blue >= limit) return { winner: 2 };
  } else if (scores.red - scores.blue >= 2 || scores.red >= limit) {
    return { winner: 1 };
  }
  return null;
}

/** 1 gol de diferença só pune no último minuto (gol de ouro conta como fim). */
const RAGEQUIT_ONE_GOAL_REMAINING_SEC = 60;

function remainingMatchSeconds(scores) {
  const limit = Number(scores?.timeLimit) || 0;
  const t = Number(scores?.time) || 0;
  if (limit <= 0) return 0;
  return Math.max(0, limit - t);
}

/** Diff 2+ sempre; placar 3 (limite) sempre; diff 1 só no último minuto. */
function isDecidedLosingScore(scores) {
  if (!scores) return false;
  const limit = Number(scores.scoreLimit) || 3;
  if ((scores.red || 0) >= limit || (scores.blue || 0) >= limit) return true;
  const diff = Math.abs((scores.red || 0) - (scores.blue || 0));
  if (diff >= 2) return true;
  return diff === 1 && remainingMatchSeconds(scores) <= RAGEQUIT_ONE_GOAL_REMAINING_SEC;
}

function rageQuitMessages(name, reason) {
  const mention = `@${name}`;
  return {
    public: `🚨 Ragequit de ${mention}: ${reason}. Partida encerrada.`,
    private: `${mention} você levou ragequit: ${reason}.`,
  };
}

/** 7 pessoas → 3v3; 5 → 2v2; 3 → 1v1; 8+ → 4v4. */
function targetTeamSize(eligibleCount, maxSize = 4) {
  const n = Math.max(0, Number(eligibleCount) || 0);
  const cap = Math.max(1, Number(maxSize) || 4);
  return Math.min(cap, Math.max(1, Math.floor(n / 2)));
}

/**
 * Goleiro = mais recuado na média de X. Vermelho defende a esquerda
 * (menor X); azul a direita (maior X).
 * @param {{ team: number, xAvg: number }[]} samples
 */
function pickGoalkeeper(samples, team) {
  const side = (samples || []).filter(
    (p) => p && p.team === team && Number.isFinite(Number(p.xAvg))
  );
  if (!side.length) return null;
  side.sort((a, b) => (team === 1 ? a.xAvg - b.xAvg : b.xAvg - a.xAvg));
  return side[0];
}

module.exports = {
  attributeGoal,
  sameTouchPlayer,
  isValidMatchScores,
  pickFromSpecList,
  isChooseToken,
  rememberedChooseMode,
  formatMatchClock,
  pointDistance,
  ballSpeedKmh,
  possessionPercents,
  canJoinMatchStats,
  detectRageQuit,
  isDecidedLosingScore,
  remainingMatchSeconds,
  RAGEQUIT_ONE_GOAL_REMAINING_SEC,
  rageQuitMessages,
  targetTeamSize,
  pickGoalkeeper,
};
