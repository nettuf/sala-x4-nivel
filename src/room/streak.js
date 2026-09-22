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
/** Em 2v2+ a campanha segue com ≥2 originais no vermelho. 1v1 segue se for o mesmo. */
const MIN_STREAK_HOLDERS = 2;

function holdersNeededToKeep(redCount, previousHolderCount = 0) {
  if (redCount <= 1 && previousHolderCount <= 1) return 1;
  return MIN_STREAK_HOLDERS;
}
/** !topstreak: até 5 campanhas; só entra com 3 ou mais. */
const TOP_STREAKS = 5;
const MIN_BOARD_STREAK = 3;

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

function sameHolders(a, b) {
  const left = sanitizeHolders(a);
  const right = sanitizeHolders(b);
  return left.length === right.length && left.every((name, i) => name === right[i]);
}

function normalizeBoardEntry(raw) {
  const n = Math.max(0, Math.floor(Number(raw?.n ?? raw?.best) || 0));
  if (n < MIN_BOARD_STREAK) return null;
  return {
    n,
    holders: sanitizeHolders(raw?.holders),
    live: !!raw?.live,
  };
}

function rankStreakBoard(entries) {
  const out = [];
  const seenLive = { yes: false };
  for (const raw of entries || []) {
    const entry = normalizeBoardEntry(raw);
    if (!entry) continue;
    if (entry.live) {
      if (seenLive.yes) entry.live = false;
      else seenLive.yes = true;
    }
    out.push(entry);
  }
  out.sort((a, b) => {
    if (b.n !== a.n) return b.n - a.n;
    if (a.live !== b.live) return a.live ? -1 : 1;
    return 0;
  });
  return out.slice(0, TOP_STREAKS);
}

function seedStreakBoard(entries, best, bestHolders) {
  const seeded = rankStreakBoard(entries);
  if (seeded.length) return seeded;
  return rankStreakBoard([{ n: best, holders: bestHolders, live: false }]);
}

function uniqIds(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function createStreakTracker({ best = 0, bestHolders = [], board = [], onBest, onBoard } = {}) {
  let streak = 0;
  let bestStreak = Math.max(0, Math.floor(Number(best) || 0));
  let bestStreakHolders = sanitizeHolders(bestHolders);
  let holderIds = [];
  let live = null;
  let topBoard = seedStreakBoard(board, bestStreak, bestStreakHolders);

  function get() {
    return streak;
  }

  function getBest() {
    return bestStreak;
  }

  function getBestHolders() {
    return [...bestStreakHolders];
  }

  function getTopStreaks() {
    return topBoard.map((e) => ({ ...e, holders: [...e.holders] }));
  }

  function getHolderIds() {
    return [...holderIds];
  }

  function emitBoard() {
    if (typeof onBoard === "function") onBoard(getTopStreaks());
  }

  function publishLive() {
    const frozen = topBoard.filter((e) => !e.live);
    const next = live && live.n >= MIN_BOARD_STREAK ? [...frozen, { ...live, live: true }] : frozen;
    topBoard = rankStreakBoard(next);
    emitBoard();
  }

  function finalizeLive() {
    if (!live) return;
    if (live.n >= MIN_BOARD_STREAK) {
      topBoard = rankStreakBoard([...topBoard.filter((e) => !e.live), { ...live, live: false }]);
    } else {
      topBoard = rankStreakBoard(topBoard.filter((e) => !e.live));
    }
    live = null;
    emitBoard();
  }

  function hydrateBest(n, holders) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    const names = sanitizeHolders(holders);
    if (v > bestStreak) {
      bestStreak = v;
      bestStreakHolders = names;
    } else if (v === bestStreak && bestStreakHolders.length === 0) {
      bestStreakHolders = names;
    }
    if (v >= MIN_BOARD_STREAK && !topBoard.some((e) => e.n === v && sameHolders(e.holders, names))) {
      topBoard = rankStreakBoard([...topBoard, { n: v, holders: names, live: false }]);
      emitBoard();
    }
  }

  function hydrateBoard(entries, fallbackBest, fallbackHolders) {
    const seeded = seedStreakBoard(entries, fallbackBest, fallbackHolders);
    if (seeded.length) topBoard = seeded;
    const top = topBoard[0];
    const rec = Math.max(0, Math.floor(Number(fallbackBest) || 0));
    if (top) {
      bestStreak = Math.max(bestStreak, top.n, rec);
      if (top.holders.length) bestStreakHolders = top.holders;
    } else if (rec > bestStreak) {
      hydrateBest(rec, fallbackHolders);
    }
  }

  function reset() {
    finalizeLive();
    streak = 0;
    holderIds = [];
  }

  function maybeRecordBest(holders) {
    if (streak <= 0 || streak < bestStreak) {
      publishLive();
      return;
    }
    bestStreak = streak;
    bestStreakHolders = sanitizeHolders(holders);
    if (typeof onBest === "function") onBest(bestStreak, bestStreakHolders);
    publishLive();
  }

  /**
   * Só partida com vencedor. Empate / abort / RR não zera.
   * Azul ganhar é derrota de quem segura: streak recomeça em 1.
   * @param {1|2|0} winner
   * @param {string[]} [holders] nicks do time que segura o streak
   * @param {number[]} [ids] ids dos vencedores que ficaram
   * @returns {number} streak atual após update
   */
  function recordWin(winner, holders = [], ids = []) {
    if (winner === TEAM.RED) {
      streak += 1;
    } else if (winner === TEAM.BLUE) {
      finalizeLive();
      streak = 1;
    } else {
      return streak;
    }
    holderIds = uniqIds(ids);
    live = { n: streak, holders: sanitizeHolders(holders) };
    maybeRecordBest(holders);
    return streak;
  }

  function adoptHolders(holders = [], ids = []) {
    if (streak <= 0) return;
    holderIds = uniqIds(ids);
    if (live) live = { n: live.n, holders: sanitizeHolders(holders) };
  }

  function label() {
    if (streak <= 0) return "sem streak";
    return `streak ${streak}`;
  }

  return {
    get,
    getBest,
    getBestHolders,
    getTopStreaks,
    getHolderIds,
    hydrateBest,
    hydrateBoard,
    reset,
    recordWin,
    adoptHolders,
    label,
  };
}

function formatCurrentStreak(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v > 0 ? `🔁 Streak atual: ${v} (vencedores no vermelho)` : "🔁 Sem streak no momento.";
}

function formatTopStreaks(entries = []) {
  const rows = rankStreakBoard(Array.isArray(entries) ? entries : []);
  if (!rows.length) return "🏆 Sem recorde de streak ainda.";
  const lines = rows.map((e, i) => {
    const who = e.holders.length ? ` — ${e.holders.join(", ")}` : "";
    const live = e.live ? " (em andamento)" : "";
    return `${i + 1}. ${e.n}${who}${live}`;
  });
  return `🏆 Top streak\n${lines.join("\n")}`;
}

function formatBestStreak(best, current = 0, holders = []) {
  if (Array.isArray(best)) return formatTopStreaks(best);
  const rec = Math.max(0, Math.floor(Number(best) || 0));
  const now = Math.max(0, Math.floor(Number(current) || 0));
  if (rec < MIN_BOARD_STREAK) return "🏆 Sem recorde de streak ainda.";
  return formatTopStreaks([{ n: rec, holders, live: now > 0 && now >= rec }]);
}

/**
 * Monta o campo pós-partida para choose: vencedores no vermelho + 1º spec no azul.
 * @returns {{ mode: "choose"|"keep", streak: number }}
 */
function applyWinnerStays(
  room,
  winner,
  streakTracker,
  { isExcluded, recordStreak = true, quiet = false } = {}
) {
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

  const winnerSide = winner === TEAM.RED ? red : blue;
  const kept = winnerSide.filter(eligible);
  const holders = kept.map((p) => p.name);
  const fallenHolders = winner === TEAM.BLUE ? red.map((p) => p.name) : [];
  const prevStreak = streakTracker.get();
  const prevHolderIds = new Set(
    typeof streakTracker.getHolderIds === "function" ? streakTracker.getHolderIds() : []
  );
  const continuing = prevStreak > 0 && winner === TEAM.RED && prevHolderIds.size > 0;
  const keptCount = continuing
    ? kept.filter((p) => prevHolderIds.has(p.id)).length
    : kept.length;
  const enoughHolders =
    keptCount >= holdersNeededToKeep(kept.length, continuing ? prevHolderIds.size : 0);
  if (recordStreak && !enoughHolders) {
    streakTracker.reset();
  }
    const nextStreak = recordStreak && enoughHolders
      ? streakTracker.recordWin(winner, holders, kept.map((p) => p.id))
      : streakTracker.get();
  const streakBit = recordStreak && enoughHolders ? ` · ${streakTracker.label()}` : "";
  if (!quiet && recordStreak && !enoughHolders && prevStreak > 0) {
    room.sendAnnouncement(
      "🔁 Streak encerrada — menos de 2 vencedores no campo.",
      null,
      0xe67e22,
      "bold",
      1
    );
  }

  if (winner === TEAM.RED) {
    for (const p of blue) room.setPlayerTeam(p.id, TEAM.SPEC);
    if (!quiet) {
      room.sendAnnouncement(
        `✨ Vermelho venceu! Ficam no campo${streakBit}`,
        null,
        0xe74c3c,
        "bold",
        2
      );
    }
  } else if (winner === TEAM.BLUE) {
    for (const p of red) room.setPlayerTeam(p.id, TEAM.SPEC);
    const bluesNow = room.getPlayerList().filter((p) => p.team === TEAM.BLUE);
    for (const p of bluesNow) room.setPlayerTeam(p.id, TEAM.RED);
    if (!quiet) {
      room.sendAnnouncement(
        `✨ Azul venceu! Vão para o vermelho${streakBit}`,
        null,
        0x3498db,
        "bold",
        2
      );
    }
  }

  const specsNow = room
    .getPlayerList()
    .filter((p) => p.team === TEAM.SPEC && eligible(p));
  const captain = waitingSpecs[0] || specsNow[0];
  if (captain) room.setPlayerTeam(captain.id, TEAM.BLUE);

  if (!quiet) {
    announceStreakFlavor(room, {
      prevStreak,
      nextStreak,
      winner,
      holders,
      fallenHolders,
      recordStreak,
    });
  }

  return { mode: "choose", streak: nextStreak };
}

/**
 * Só no kickoff (times prontos). Spec no choose não zera.
 * 4v4/3v3/2v2: segue com ≥2 da campanha no vermelho; 1v1: o mesmo jogador.
 */
function pruneStreakIfTooFewHolders(room, streakTracker, { isExcluded, quiet = false } = {}) {
  if (!streakTracker || streakTracker.get() <= 0) return false;
  const ids = new Set(
    typeof streakTracker.getHolderIds === "function" ? streakTracker.getHolderIds() : []
  );
  if (!ids.size) return false;
  const eligible = (p) =>
    p && p.id !== 0 && !(typeof isExcluded === "function" && isExcluded(p));
  const red = room.getPlayerList().filter((p) => p.team === TEAM.RED && eligible(p));
  const originals = red.filter((p) => ids.has(p.id));
  const needed = holdersNeededToKeep(red.length, ids.size);
  if (originals.length >= needed) {
    if (typeof streakTracker.adoptHolders === "function") {
      streakTracker.adoptHolders(
        red.map((p) => p.name),
        red.map((p) => p.id)
      );
    }
    return false;
  }
  const prev = streakTracker.get();
  streakTracker.reset();
  if (!quiet && prev > 0 && room && typeof room.sendAnnouncement === "function") {
    room.sendAnnouncement(
      "🔁 Streak encerrada — menos de 2 da campanha no vermelho.",
      null,
      0xe67e22,
      "bold",
      1
    );
  }
  return true;
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
  pruneStreakIfTooFewHolders,
  holdersNeededToKeep,
  shouldUseWinnerStays,
  formatCurrentStreak,
  formatBestStreak,
  formatTopStreaks,
  rankStreakBoard,
  sanitizeHolders,
  TOP_STREAKS,
  MIN_BOARD_STREAK,
  isStreakMilestone,
  formatStreakMilestone,
  formatStreakBroken,
  announceStreakFlavor,
  STREAK_MILESTONE_EVERY,
  STREAK_BREAK_MIN,
  MIN_STREAK_HOLDERS,
};
