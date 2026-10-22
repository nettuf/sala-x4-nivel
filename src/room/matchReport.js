/**
 * Nota, MVP/pior e mensagens de estatística da partida.
 * A nota é a mesma conta do site (MatchRatingCalculator no back): mudou lá, muda aqui.
 */

const SHOT_KICKS = new Set(["save", "block"]);

function nz(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function goalsBonus(goals) {
  let bonus = 0;
  for (let i = 0; i < goals; i++) bonus += i === 0 ? 0.8 : i === 1 ? 0.5 : 0.3;
  return bonus;
}

function assistsBonus(assists) {
  let bonus = 0;
  for (let i = 0; i < assists; i++) bonus += i === 0 ? 0.45 : 0.3;
  return bonus;
}

function passBonus(row, goalkeeper) {
  const passes = nz(row.passes);
  const attempts = passes + nz(row.misplaced);
  if (attempts < 4) return 0;
  const accuracy = passes / attempts;
  const rateCap = goalkeeper ? 0.4 : 0.8;
  const rateBonus = clamp((((accuracy - 0.7) * 100) / 10) * 0.2, -rateCap, rateCap);
  const volumeBonus = Math.min(goalkeeper ? 6 : 12, passes) * (goalkeeper ? 0.015 : 0.03);
  return rateBonus + volumeBonus;
}

function conceded(team, redScore, blueScore) {
  if (team === 1) return nz(blueScore);
  if (team === 2) return nz(redScore);
  return 0;
}

function resultBonus(team, winner) {
  if (!winner || (team !== 1 && team !== 2)) return 0;
  return team === winner ? 0.15 : -0.15;
}

/** Nota 1–10 com uma casa, igual ao site. winner: 1, 2 ou 0 (empate). */
function siteRating(row, { redScore = 0, blueScore = 0, winner = 0 } = {}) {
  const team = Number(row.team) || 0;
  const cleanSheet = (team === 1 || team === 2) && conceded(team, redScore, blueScore) === 0;
  let score;
  if (row.goalkeeper) {
    score = 6.5;
    let saveBonus = 0;
    for (let i = 0; i < nz(row.saves); i++) saveBonus += i < 3 ? 0.25 : 0.12;
    score += Math.min(1.6, saveBonus);
    if (cleanSheet) score += 0.7;
    score += conceded(team, redScore, blueScore) * -0.35;
    score += nz(row.ownGoals) * -1.2;
    score += nz(row.errors) * -0.8;
    score += passBonus(row, true);
    score += Math.min(6, nz(row.tackles)) * 0.04;
    score += Math.min(6, nz(row.interceptions)) * 0.04;
  } else {
    score = 6.3;
    score += goalsBonus(nz(row.goals));
    score += assistsBonus(nz(row.assists));
    score += Math.min(4, nz(row.shotSaved)) * 0.08;
    score += passBonus(row, false);
    score += Math.min(6, nz(row.tackles)) * 0.08;
    score += Math.min(6, nz(row.interceptions)) * 0.08;
    score += Math.min(4, nz(row.clearances)) * 0.05;
    score += Math.min(8, nz(row.lost)) * -0.08;
    score += nz(row.ownGoals) * -1.2;
    score += nz(row.errors) * -0.8;
    score += resultBonus(team, winner);
    if (cleanSheet && nz(row.tackles) + nz(row.interceptions) + nz(row.clearances) >= 2) score += 0.15;
  }
  return clamp(Math.round(score * 10) / 10, 1, 10);
}

function passAccuracy(row) {
  const attempts = nz(row.passes) + nz(row.misplaced);
  return attempts > 0 ? nz(row.passes) / attempts : 0;
}

/** Melhor → pior: nota, gols, assist, acerto de passe, menos GC, nick. */
function compareSite(a, b) {
  return (b.rating - a.rating)
    || (nz(b.goals) - nz(a.goals))
    || (nz(b.assists) - nz(a.assists))
    || (passAccuracy(b) - passAccuracy(a))
    || (nz(a.ownGoals) - nz(b.ownGoals))
    || String(a.name || "").toLowerCase().localeCompare(String(b.name || "").toLowerCase());
}

function rankRows(rows) {
  return [...(rows || [])].filter((row) => Number.isFinite(row?.rating)).sort(compareSite);
}

/** MVP é o primeiro; pior é o último, se for outra pessoa. */
function pickSiteTitles(rows) {
  const ranked = rankRows(rows);
  if (!ranked.length) return { mvp: null, worst: null, ranked };
  const mvp = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  return { mvp, worst, ranked };
}

function playRowFor(player, playMap) {
  if (!player || !playMap) return null;
  if (player.id != null && playMap.has?.(player.id)) return playMap.get(player.id);
  if (player.auth) {
    for (const row of playMap.values()) {
      if (row?.auth && row.auth === player.auth) return row;
    }
  }
  return null;
}

/** Chute a gol: gol (sem GC) + chute defendido + chute bloqueado na área. */
function countShots(kicks, goals) {
  const byTeam = { 1: 0, 2: 0 };
  const byId = new Map();
  const bump = (team, id) => {
    if (team === 1 || team === 2) byTeam[team] += 1;
    if (id != null) byId.set(id, (byId.get(id) || 0) + 1);
  };
  for (const kick of kicks || []) {
    if (kick && SHOT_KICKS.has(kick.type)) bump(kick.fromTeam, kick.fromId);
  }
  for (const goal of goals || []) {
    if (goal && !goal.isOwnGoal) bump(goal.team, goal.scorerId);
  }
  return { byTeam, byId };
}

/**
 * Uma linha por jogador com ações e nota.
 * players: [{ id, auth, name, team }]; tally(p) → { goals, assists, own_goals }.
 */
function buildRows({ players, playMap, tally, gk, shots, redScore = 0, blueScore = 0, winner = 0 } = {}) {
  const rows = [];
  for (const p of players || []) {
    if (!p || (p.team !== 1 && p.team !== 2)) continue;
    const play = playRowFor(p, playMap) || {};
    const t = typeof tally === "function" ? tally(p) || {} : {};
    const goalkeeper = p.team === 1 ? gk?.redId === p.id : gk?.blueId === p.id;
    const row = {
      id: p.id ?? null,
      auth: p.auth || null,
      name: p.name || p.nick || "?",
      team: p.team,
      goalkeeper: !!goalkeeper && p.id != null,
      goals: nz(t.goals),
      assists: nz(t.assists),
      ownGoals: nz(t.own_goals),
      passes: nz(play.passes),
      misplaced: nz(play.misplaced),
      tackles: nz(play.tackles),
      interceptions: nz(play.interceptions),
      saves: nz(play.saves),
      clearances: nz(play.clearances),
      lost: nz(play.lost),
      errors: nz(play.errors),
      shotSaved: nz(play.shotSaved),
      shots: p.id != null ? nz(shots?.byId?.get(p.id)) : 0,
    };
    row.rating = siteRating(row, { redScore, blueScore, winner });
    rows.push(row);
  }
  return rows;
}

function teamTotals(playMap, shots, poss) {
  const totals = {
    1: { passes: 0, tackles: 0, interceptions: 0, saves: 0 },
    2: { passes: 0, tackles: 0, interceptions: 0, saves: 0 },
  };
  for (const row of playMap?.values?.() || []) {
    const side = totals[row?.team];
    if (!side) continue;
    side.passes += nz(row.passes);
    side.tackles += nz(row.tackles);
    side.interceptions += nz(row.interceptions);
    side.saves += nz(row.saves);
  }
  totals[1].shots = nz(shots?.byTeam?.[1]);
  totals[2].shots = nz(shots?.byTeam?.[2]);
  const red = Math.round(Number(poss?.red) || 0);
  totals[1].poss = clamp(red, 0, 100);
  totals[2].poss = 100 - totals[1].poss;
  return totals;
}

function decimal(value) {
  return (Math.round((Number(value) || 0) * 10) / 10).toFixed(1).replace(".", ",");
}

function versus(label, red, blue) {
  return `${label} ${red} · ${blue}`;
}

function teamStatLines(totals, { full = false } = {}) {
  const r = totals[1];
  const b = totals[2];
  const lines = [
    `⏱️ ${versus("Posse", `${r.poss}%`, `${b.poss}%`)}   🎯 ${versus("Passes", r.passes, b.passes)}`,
    `👟 ${versus("Chutes", r.shots, b.shots)}   ⚔️ ${versus("Desarmes", r.tackles, b.tackles)}`,
  ];
  if (full) {
    lines.push(`✂️ ${versus("Interceptações", r.interceptions, b.interceptions)}   🧤 ${versus("Defesas", r.saves, b.saves)}`);
  }
  return lines;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Ações em texto curto, só o que aconteceu. */
function actionBits(row) {
  const bits = [];
  if (row.goals) bits.push(`${row.goals}G`);
  if (row.assists) bits.push(`${row.assists}A`);
  if (row.ownGoals) bits.push(`${row.ownGoals} GC`);
  const attempts = row.passes + row.misplaced;
  if (attempts) bits.push(`${row.passes}/${attempts} passes`);
  if (row.shots) bits.push(plural(row.shots, "chute", "chutes"));
  if (row.tackles) bits.push(plural(row.tackles, "desarme", "desarmes"));
  if (row.interceptions) bits.push(plural(row.interceptions, "interceptação", "interceptações"));
  if (row.saves) bits.push(plural(row.saves, "defesa", "defesas"));
  return bits;
}

function withBits(head, row) {
  const bits = actionBits(row);
  return bits.length ? `${head} · ${bits.join(" · ")}` : head;
}

function minuteOf(timeSec) {
  return Math.floor(Math.max(0, Number(timeSec) || 0) / 60);
}

function scoreLine(redScore, blueScore) {
  return `🔴 ${nz(redScore)} x ${nz(blueScore)} 🔵`;
}

function formatPartialTeams({ minute, redScore, blueScore, totals }) {
  return [`📊 Parcial ${minute}' · ${scoreLine(redScore, blueScore)}`, ...teamStatLines(totals)];
}

function formatPartialPlayer(row, minute) {
  return withBits(`📍 Você aos ${minute}' · nota ~${decimal(row.rating)}`, row);
}

function formatFinalTeams({ redScore, blueScore, totals }) {
  return [`🏁 Fim de jogo · ${scoreLine(redScore, blueScore)}`, ...teamStatLines(totals, { full: true })];
}

function formatTitleLine(kind, row) {
  const head = kind === "mvp" ? `⭐ MVP · ${row.name}` : `💩 Pior · ${row.name}`;
  return withBits(`${head} · nota ${decimal(row.rating)}`, row);
}

function formatFinalPlayer(row, place, total) {
  return withBits(`📋 Sua partida · nota ${decimal(row.rating)} (${place}º de ${total})`, row);
}

module.exports = {
  siteRating,
  compareSite,
  rankRows,
  pickSiteTitles,
  countShots,
  buildRows,
  teamTotals,
  minuteOf,
  formatPartialTeams,
  formatPartialPlayer,
  formatFinalTeams,
  formatTitleLine,
  formatFinalPlayer,
  decimal,
};
