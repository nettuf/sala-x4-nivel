const { TEAM } = require("./choose");
const config = require("../config");
const { STREAK_TITLE_MIN } = require("../titles");

/**
 * Streak + winner stays:
 * - Vermelho ganha → streak++ e azul vai pro spec
 * - Azul ganha → vencedores vão pro vermelho, streak = 1
 * - Empate não existe no 4v4 (gol de ouro); os times nunca zeram.
 */

const STREAK_MILESTONE_EVERY = 5;
const STREAK_BREAK_MIN = 5;

/** Frases de efeito a cada 5 vitórias seguidas (5, 10, 15, 20…). */
const MILESTONE_LINES = {
  5: [
    "🔥 Streak 5! Ninguém segura essa sequência!",
    "🔥 Cinco seguidas! Tão difícil de parar!",
    "🔥 Deu 5! O vermelho tá impossível!",
  ],
  10: [
    "⚡ 10 vitórias seguidas! A sala inteira sentiu!",
    "👑 Dez seguidas! Dominando geral!",
    "⚡ Streak 10! Modo invencível ligado!",
  ],
  15: [
    "💀 15 seguidas! Modo imortal ativado!",
    "🚨 Quinze! Alguém para essa máquina?!",
    "💀 Streak 15! Tão absurdo que dói!",
  ],
  20: [
    "🏆 20 STREAK! Lendário demais!",
    "🌋 Vinte seguidas! História sendo escrita!",
    "🏆 Duas mãos de vitórias! Insano!",
  ],
  25: [
    "👹 25 seguidas! A sala pede arrego!",
    "🔱 Streak 25! Isso é crime de war crime!",
  ],
  30: [
    "🛸 30 STREAK! Alienígena demais!",
    "☄️ Trinta seguidas! Apaga a luz da sala!",
  ],
};

const MILESTONE_GENERIC = [
  "🔥 Streak {n}! Ninguém segura!",
  "⚡ {n} seguidas! Modo deus!",
  "👑 {n} vitórias consecutivas! Absurdo!",
];

/** Quando o azul derruba streak grande do vermelho. */
const BREAK_LINES = [
  "💥 {breakers} QUEBROU o streak de {n}! A hegemonia acabou!",
  "🛑 Streak de {n} foi pro saco! {breakers} resetou o servidor!",
  "😤 {n} seguidas no lixo! {breakers} apareceu!",
  "⚔️ Fim da era! {breakers} derrubou as {n} seguidas!",
  "🧨 {breakers} estourou o streak de {n}! Voltou ao jogo!",
];

function formatNames(names, max = 4) {
  const list = sanitizeHolders(names).slice(0, max);
  if (!list.length) return "O azul";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

function isStreakMilestone(n) {
  const v = Math.floor(Number(n) || 0);
  return v >= STREAK_MILESTONE_EVERY && v % STREAK_MILESTONE_EVERY === 0;
}

function milestoneTier(n) {
  const v = Math.floor(Number(n) || 0);
  if (v <= 0) return 0;
  const capped = Math.min(v, 30);
  return Math.floor(capped / STREAK_MILESTONE_EVERY) * STREAK_MILESTONE_EVERY;
}

function pickFromPool(pool, seed) {
  if (!pool?.length) return "";
  const i = Math.abs(Math.floor(Number(seed) || 0)) % pool.length;
  return pool[i];
}

function formatStreakMilestone(streak, holders = []) {
  if (!isStreakMilestone(streak)) return null;
  const n = Math.floor(streak);
  const who = formatNames(holders);
  const tier = milestoneTier(n);
  const pool = MILESTONE_LINES[tier] || MILESTONE_GENERIC;
  const line = pickFromPool(pool, n);
  return line.replace(/\{n\}/g, String(n)).replace(/\{who\}/g, who);
}

function formatStreakBroken(prevStreak, breakers = [], fallen = []) {
  const n = Math.floor(Number(prevStreak) || 0);
  if (n < STREAK_BREAK_MIN) return null;
  const line = pickFromPool(BREAK_LINES, n);
  const breakerText = formatNames(breakers);
  const fallenText = formatNames(fallen);
  return line
    .replace(/\{n\}/g, String(n))
    .replace(/\{breakers\}/g, breakerText)
    .replace(/\{fallen\}/g, fallenText);
}

function announceStreakFlavor(room, { prevStreak, nextStreak, winner, holders, fallenHolders, recordStreak = true }) {
  if (!recordStreak || !room || typeof room.sendAnnouncement !== "function") return;
  if (winner === TEAM.RED) {
    const msg = formatStreakMilestone(nextStreak, holders);
    if (msg) room.sendAnnouncement(msg, null, 0xf1c40f, "bold", 2);
    // Cargo temporário 🔥 no chat a partir da 3ª seguida.
    if (prevStreak < STREAK_TITLE_MIN && nextStreak >= STREAK_TITLE_MIN) {
      room.sendAnnouncement(
        "🔥 Vermelho em sequencia insana! 🔥",
        null,
        0xff1a1a,
        "bold",
        2
      );
    }
    return;
  }
  if (winner === TEAM.BLUE) {
    const msg = formatStreakBroken(prevStreak, holders, fallenHolders);
    if (msg) room.sendAnnouncement(msg, null, 0x9b59b6, "bold", 2);
  }
}

function sanitizeHolders(holders) {
  if (!Array.isArray(holders)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of holders) {
    const name = String(raw || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function createStreakTracker({ best = 0, bestHolders = [], onBest } = {}) {
  let streak = 0;
  let bestStreak = Math.max(0, Math.floor(Number(best) || 0));
  let bestStreakHolders = sanitizeHolders(bestHolders);

  function get() {
    return streak;
  }

  function getBest() {
    return bestStreak;
  }

  function getBestHolders() {
    return [...bestStreakHolders];
  }

  function hydrateBest(n, holders) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v > bestStreak) {
      bestStreak = v;
      bestStreakHolders = sanitizeHolders(holders);
    } else if (v === bestStreak && bestStreakHolders.length === 0) {
      bestStreakHolders = sanitizeHolders(holders);
    }
  }

  function reset() {
    streak = 0;
  }

  function maybeRecordBest(holders) {
    if (streak <= 0 || streak < bestStreak) return;
    bestStreak = streak;
    bestStreakHolders = sanitizeHolders(holders);
    if (typeof onBest === "function") onBest(bestStreak, bestStreakHolders);
  }

  /**
   * Só 4v4 com vencedor. Empate / abort / RR não zera.
   * Azul ganhar é derrota de quem segura: streak recomeça em 1.
   * @param {1|2|0} winner
   * @param {string[]} [holders] nicks do time que segura o streak
   * @returns {number} streak atual após update
   */
  function recordWin(winner, holders = []) {
    if (winner === TEAM.RED) {
      streak += 1;
    } else if (winner === TEAM.BLUE) {
      streak = 1;
    } else {
      return streak;
    }
    maybeRecordBest(holders);
    return streak;
  }

  function label() {
    if (streak <= 0) return "sem streak";
    return `streak ${streak}`;
  }

  return { get, getBest, getBestHolders, hydrateBest, reset, recordWin, label };
}

function formatCurrentStreak(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v > 0 ? `🔁 Streak atual: ${v} (vencedores no vermelho)` : "🔁 Sem streak no momento.";
}

function formatBestStreak(best, current = 0, holders = []) {
  const rec = Math.max(0, Math.floor(Number(best) || 0));
  const now = Math.max(0, Math.floor(Number(current) || 0));
  if (rec <= 0) return "🏆 Sem recorde de streak ainda.";
  const live = now > 0 && now >= rec ? " (em andamento)" : "";
  const names = sanitizeHolders(holders);
  const who = names.length ? ` · ${names.join(", ")}` : "";
  return `🏆 Maior streak da sala: ${rec}${live}${who}`;
}

/**
 * Monta o campo pós-partida para choose: vencedores no vermelho + 1º spec no azul.
 * @returns {{ mode: "choose"|"keep", streak: number }}
 */
function applyWinnerStays(room, winner, streakTracker, { isExcluded, recordStreak = true } = {}) {
  const players = room.getPlayerList().filter((p) => p.id !== 0);
  const eligible = (p) =>
    p && p.id !== 0 && !(typeof isExcluded === "function" && isExcluded(p));

  // Quem já estava no spec (1º da fila) vira capitão — não o 1º perdedor na ordem da sala.
  const waitingSpecs = players.filter((p) => p.team === TEAM.SPEC && eligible(p));
  const red = players.filter((p) => p.team === TEAM.RED);
  const blue = players.filter((p) => p.team === TEAM.BLUE);

  if (winner !== TEAM.RED && winner !== TEAM.BLUE) {
    return { mode: "keep", streak: streakTracker.get() };
  }

  const holders = (winner === TEAM.RED ? red : blue).map((p) => p.name);
  const fallenHolders = winner === TEAM.BLUE ? red.map((p) => p.name) : [];
  const prevStreak = streakTracker.get();
  const nextStreak = recordStreak ? streakTracker.recordWin(winner, holders) : streakTracker.get();
  const streakBit = recordStreak ? ` · ${streakTracker.label()}` : "";

  if (winner === TEAM.RED) {
    for (const p of blue) room.setPlayerTeam(p.id, TEAM.SPEC);
    room.sendAnnouncement(
      `✨ Vermelho venceu! Ficam no campo${streakBit}`,
      null,
      0xe74c3c,
      "bold",
      2
    );
  } else if (winner === TEAM.BLUE) {
    for (const p of red) room.setPlayerTeam(p.id, TEAM.SPEC);
    const bluesNow = room.getPlayerList().filter((p) => p.team === TEAM.BLUE);
    for (const p of bluesNow) room.setPlayerTeam(p.id, TEAM.RED);
    room.sendAnnouncement(
      `✨ Azul venceu! Vão para o vermelho${streakBit}`,
      null,
      0x3498db,
      "bold",
      2
    );
  }

  const specsNow = room
    .getPlayerList()
    .filter((p) => p.team === TEAM.SPEC && eligible(p));
  const captain = waitingSpecs[0] || specsNow[0];
  if (captain) room.setPlayerTeam(captain.id, TEAM.BLUE);

  announceStreakFlavor(room, {
    prevStreak,
    nextStreak,
    winner,
    holders,
    fallenHolders,
    recordStreak,
  });

  return { mode: "choose", streak: nextStreak };
}

function shouldUseWinnerStays(playerCount, valid, winner) {
  if (winner !== TEAM.RED && winner !== TEAM.BLUE) return false;
  if (playerCount < 2) return false;
  // playerCount = elegíveis (sem AFK). 4v4: só partida válida.
  // 1v1/2v2/3v3 rotaciona mesmo sem stats. AFK no spec não pode inflar
  // isso pra 8+ e pular o winner stays (ex.: 3v3 + 1 spec + 4 AFK).
  if (playerCount >= config.teamSize * 2) return !!valid;
  return true;
}

module.exports = {
  createStreakTracker,
  applyWinnerStays,
  shouldUseWinnerStays,
  formatCurrentStreak,
  formatBestStreak,
  sanitizeHolders,
  isStreakMilestone,
  formatStreakMilestone,
  formatStreakBroken,
  announceStreakFlavor,
  STREAK_MILESTONE_EVERY,
  STREAK_BREAK_MIN,
};
