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

  // Toques mais recente primeiro.
  // Gol: último toque do time que fez (chute ou drible).
  // GC: último chute foi do time que sofreu, e ninguém desse time tocou depois.
  // Corpo do zagueiro perto da bola nunca vira GC.
  const kickIdx = list.findIndex(isKickTouch);
  const lastKick = kickIdx >= 0 ? list[kickIdx] : null;
  const scoreIdx = list.findIndex((t) => t && t.team === scoringTeam);
  const scoringTouch = scoreIdx >= 0 ? list[scoreIdx] : null;
  const ownKick = lastKick && lastKick.team !== scoringTeam;
  const scoredAfterKick = scoringTouch && (kickIdx < 0 || scoreIdx < kickIdx);

  if (ownKick && !scoredAfterKick) {
    return { scorer: lastKick, assist: null, isOwnGoal: true };
  }
  if (scoringTouch) {
    return {
      scorer: scoringTouch,
      assist: findAssist(list, scoringTouch, scoringTeam),
      isOwnGoal: false,
    };
  }
  return { scorer: null, assist: null, isOwnGoal: false };
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

function emptyPlayStat(player = {}) {
  return {
    id: player.id ?? null,
    auth: player.auth || null,
    name: player.name || "",
    team: player.team || 0,
    passes: 0,
    misplaced: 0,
    interceptions: 0,
    tackles: 0,
    saves: 0,
    shotSaved: 0,
    kickGoals: 0,
    ownKicks: 0,
    errors: 0,
    clearances: 0,
    recoveries: 0,
    lost: 0,
    possTicks: 0,
    possCount: 0,
  };
}

function emptyPlayEvents() {
  return {
    kickType: null,
    pass: null,
    misplaced: null,
    interception: null,
    save: null,
    shotSaved: null,
    tackle: null,
    lost: null,
    clearance: null,
    recovery: null,
    kickGoal: null,
    ownKick: null,
    errors: null,
  };
}

/** Área do gol atacado: vermelho vai à direita (+x), azul à esquerda (−x). */
function goalAreaFromStadium(stadium) {
  const obj = stadium && typeof stadium === "object" ? stadium : {};
  const halfX = Number(obj.bg?.width) || Number(obj.width) || 700;
  const halfY = Number(obj.bg?.height) || Number(obj.height) || 320;
  return {
    halfX,
    boxDepth: Math.max(90, halfX * 0.18),
    boxHalfY: Math.max(80, halfY * 0.42),
  };
}

function isInAttackingGoalArea(pos, kickerTeam, area) {
  if (!pos || !area || !kickerTeam) return false;
  const x = Number(pos.x);
  const y = Number(pos.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.abs(y) > area.boxHalfY) return false;
  if (kickerTeam === 1) return x >= area.halfX - area.boxDepth;
  if (kickerTeam === 2) return x <= -area.halfX + area.boxDepth;
  return false;
}

function isInDefensiveGoalArea(pos, team, area) {
  if (!pos || !area || !team) return false;
  const x = Number(pos.x);
  const y = Number(pos.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.abs(y) > area.boxHalfY) return false;
  if (team === 1) return x <= -area.halfX + area.boxDepth;
  if (team === 2) return x >= area.halfX - area.boxDepth;
  return false;
}

function isInDefensiveHalf(pos, team) {
  if (!pos || !team) return false;
  const x = Number(pos.x);
  if (!Number.isFinite(x)) return false;
  if (team === 1) return x <= 0;
  if (team === 2) return x >= 0;
  return false;
}

function bumpPlayStat(map, player, key, n = 1) {
  if (!map || !player || player.id == null || !n) return;
  let row = map.get(player.id);
  if (!row) {
    row = emptyPlayStat(player);
    map.set(player.id, row);
  } else {
    if (player.name) row.name = player.name;
    if (player.auth) row.auth = player.auth;
    if (player.team) row.team = player.team;
  }
  row[key] = (Number(row[key]) || 0) + n;
}

/**
 * Chute (Haxclass): passe / steal / save.
 * Corpo sem chute pendente: desarme (tackle), não interceptação.
 */
function classifyTouchChange(prev, next, {
  pendingKick = null,
  receiverPos = null,
  kickerPos = null,
  goalArea = null,
  receiverIsGk = false,
} = {}) {
  const events = emptyPlayEvents();
  if (!next) return { ...events, nextPendingKick: pendingKick };

  if (pendingKick && !sameTouchPlayer(pendingKick, next)) {
    if (pendingKick.team === next.team) {
      events.kickType = "pass";
      events.pass = pendingKick;
    } else if (
      isInAttackingGoalArea(receiverPos, pendingKick.team, goalArea)
      || (receiverIsGk && isInDefensiveHalf(receiverPos, next.team))
    ) {
      events.kickType = "save";
      events.save = next;
      events.shotSaved = pendingKick;
    } else if (isInDefensiveGoalArea(kickerPos, pendingKick.team, goalArea)) {
      events.kickType = "steal";
      events.clearance = pendingKick;
      events.interception = next;
    } else {
      events.kickType = "steal";
      events.misplaced = pendingKick;
      events.interception = next;
    }
  } else if (prev && !sameTouchPlayer(prev, next) && prev.team !== next.team) {
    events.tackle = next;
    events.lost = prev;
  }

  return {
    ...events,
    nextPendingKick: isKickTouch(next) ? next : null,
  };
}

/** Chute ainda sem destinatário no apito: gol, GC ou erro (desvio). */
function classifyPendingKickOnGoal(pendingKick, scoringTeam, touches) {
  const events = emptyPlayEvents();
  if (!pendingKick) return { ...events, kicker: null, deflector: null };

  if (pendingKick.team === scoringTeam) {
    events.kickType = "goal";
    events.kickGoal = pendingKick;
    return { ...events, kicker: pendingKick, deflector: null };
  }

  const kickIdx = (touches || []).findIndex((t) => sameTouchPlayer(t, pendingKick) && isKickTouch(t));
  const after = kickIdx >= 0 ? touches.slice(0, kickIdx) : [];
  const deflector = after.find((t) => t && t.team === scoringTeam) || null;
  if (deflector) {
    events.kickType = "error";
    events.errors = pendingKick;
    return { ...events, kicker: pendingKick, deflector };
  }
  events.kickType = "own_goal";
  events.ownKick = pendingKick;
  return { ...events, kicker: pendingKick, deflector: null };
}

/** Corpo no bolo do chute: perto do pé do batedor não é passe nem rec. */
function shouldIgnoreClusteredReceive(kicker, other, { kind, ballAtKicker } = {}) {
  if (kind !== "body" || !ballAtKicker || !kicker || !other) return false;
  return !sameTouchPlayer(kicker, other);
}

const shouldIgnoreClusteredTeammateReceive = shouldIgnoreClusteredReceive;

function applyPlayEvents(map, events) {
  if (!map || !events) return;
  if (events.pass) bumpPlayStat(map, events.pass, "passes");
  if (events.misplaced) bumpPlayStat(map, events.misplaced, "misplaced");
  if (events.interception) bumpPlayStat(map, events.interception, "interceptions");
  if (events.save) bumpPlayStat(map, events.save, "saves");
  if (events.shotSaved) bumpPlayStat(map, events.shotSaved, "shotSaved");
  if (events.tackle) bumpPlayStat(map, events.tackle, "tackles");
  if (events.lost) bumpPlayStat(map, events.lost, "lost");
  if (events.clearance) bumpPlayStat(map, events.clearance, "clearances");
  if (events.recovery) bumpPlayStat(map, events.recovery, "recoveries");
  if (events.kickGoal) bumpPlayStat(map, events.kickGoal, "kickGoals");
  if (events.ownKick) bumpPlayStat(map, events.ownKick, "ownKicks");
  if (events.errors) bumpPlayStat(map, events.errors, "errors");
}

function playStatsList(map) {
  return [...(map && map.values ? map.values() : [])];
}

function passAttempts(row) {
  return (Number(row?.passes) || 0) + (Number(row?.misplaced) || 0);
}

function pickPlayLeader(rows, scoreFn, minScore = 1) {
  let best = null;
  let bestScore = minScore - 1;
  for (const row of rows || []) {
    const score = Number(scoreFn(row)) || 0;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return bestScore >= minScore ? best : null;
}

function formatPlayChatLines(map, teamPoss) {
  const rows = playStatsList(map);
  const totalPoss = rows.reduce((sum, row) => sum + (Number(row.possTicks) || 0), 0);
  const passLeader = pickPlayLeader(rows, (row) => {
    const n = passAttempts(row);
    if (n <= 0) return 0;
    return (Number(row.passes) || 0) + (Number(row.passes) || 0) / n / 1000;
  });
  const tackleLeader = pickPlayLeader(rows, (row) => Number(row.tackles) || 0);
  const interceptLeader = pickPlayLeader(rows, (row) => Number(row.interceptions) || 0);
  const saveLeader = pickPlayLeader(rows, (row) => Number(row.saves) || 0);
  const possLeader = pickPlayLeader(rows, (row) => Number(row.possTicks) || 0);

  const lines = [];
  if (teamPoss) {
    lines.push(`⭐ Posse: 🔴 ${Number(teamPoss.red).toFixed(1)}% : ${Number(teamPoss.blue).toFixed(1)}% 🔵`);
  }
  const attempts = passAttempts(passLeader);
  if (passLeader && attempts > 0) {
    lines.push(`🎯 Passe: ${passLeader.name} ${passLeader.passes}/${attempts}`);
  }
  if (tackleLeader) {
    lines.push(`🛡️ Desarme: ${tackleLeader.name} ${tackleLeader.tackles}`);
  }
  if (interceptLeader) {
    lines.push(`✂️ Intercept: ${interceptLeader.name} ${interceptLeader.interceptions}`);
  }
  if (saveLeader) {
    lines.push(`🧤 Defesa: ${saveLeader.name} ${saveLeader.saves}`);
  }
  if (possLeader && totalPoss > 0) {
    const pct = (100 * possLeader.possTicks) / totalPoss;
    lines.push(`⚽ Posse jogador: ${possLeader.name} ${pct.toFixed(0)}%`);
  }
  return lines;
}

function playRowHasAction(row) {
  return passAttempts(row) > 0
    || (Number(row?.tackles) || 0) > 0
    || (Number(row?.interceptions) || 0) > 0
    || (Number(row?.saves) || 0) > 0
    || (Number(row?.possTicks) || 0) > 0;
}

function formatPlaySummaryLines(map) {
  const rows = playStatsList(map)
    .filter(playRowHasAction)
    .sort((a, b) => (b.passes - a.passes) || (b.tackles - a.tackles) || (b.interceptions - a.interceptions) || (b.possTicks - a.possTicks));
  if (!rows.length) return [];
  const totalPoss = rows.reduce((sum, row) => sum + (Number(row.possTicks) || 0), 0);
  const lines = ["", "**Passe / desarme / intercept / defesa**"];
  for (const row of rows.slice(0, 12)) {
    const n = passAttempts(row);
    const pass = n > 0 ? `${row.passes}/${n} passe` : "— passe";
    const des = `${row.tackles || 0} des`;
    const inter = `${row.interceptions || 0} int`;
    const def = `${row.saves || 0} def`;
    const poss = totalPoss > 0 ? `${((100 * (row.possTicks || 0)) / totalPoss).toFixed(0)}%` : "0%";
    lines.push(`· ${row.name} — ${pass} · ${des} · ${inter} · ${def} · ${poss}`);
  }
  return lines;
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

/** Uma linha por auth (PK em match_players). Entrada posterior vence. */
function dedupeMatchPlayers(players) {
  const byAuth = new Map();
  for (const p of players || []) {
    if (!p?.auth) continue;
    byAuth.set(p.auth, p);
  }
  return [...byAuth.values()];
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
  bumpPlayStat,
  classifyTouchChange,
  classifyPendingKickOnGoal,
  goalAreaFromStadium,
  isInAttackingGoalArea,
  isInDefensiveGoalArea,
  isInDefensiveHalf,
  shouldIgnoreClusteredReceive,
  shouldIgnoreClusteredTeammateReceive,
  applyPlayEvents,
  formatPlayChatLines,
  formatPlaySummaryLines,
  passAttempts,
  canJoinMatchStats,
  detectRageQuit,
  isDecidedLosingScore,
  remainingMatchSeconds,
  RAGEQUIT_ONE_GOAL_REMAINING_SEC,
  rageQuitMessages,
  targetTeamSize,
  pickGoalkeeper,
  dedupeMatchPlayers,
};
