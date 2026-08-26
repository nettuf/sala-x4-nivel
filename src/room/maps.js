const config = require("../config");
const STADIUMS = require("./stadiums");

const cache = { training: null, x3: null, x4: null, loaded: false };

// Stadium .hbs do editor traz comentarios de indice; JSON.parse puro rejeita.
function stripHbsComments(text) {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === "\\" && next) {
        out += next;
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === "/" && next === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function parseStadium(raw) {
  return JSON.parse(stripHbsComments(String(raw || "")));
}

function loadSlot(kind, inline, hardcoded, label) {
  const fromEnv = String(inline || "").trim();
  const raw = fromEnv || hardcoded;
  if (!raw) {
    console.warn(`[maps] ${label} ausente`);
    return;
  }
  try {
    parseStadium(raw);
    cache[kind] = raw;
    console.log(`[maps] ${label}:`, fromEnv ? "env" : "hardcoded");
  } catch (err) {
    console.warn(`[maps] ${label} inválido:`, err.message);
  }
}

function ensureLoaded() {
  if (cache.loaded) return;
  cache.loaded = true;

  loadSlot("training", config.mapTraining, STADIUMS.training, "treino");
  loadSlot("x3", config.mapX3, STADIUMS.x3, "x3");
  loadSlot("x4", config.mapX4, STADIUMS.x4, "x4");
}

/** 1 = treino; 2–7 (1v1/2v2/3v3) = x3; 8+ = x4 */
function stadiumKindForCount(count) {
  const n = Number(count) || 0;
  if (n <= 1) return "training";
  if (n < 8) return "x3";
  return "x4";
}

/** Treino ↔ x3 precisa parar o jogo; 2v2 → 1v1 no mesmo x3 não. */
function needsTrainingX3Swap(fromKind, toKind) {
  const from = String(fromKind || "");
  const to = String(toKind || "");
  return (to === "x3" && from === "training") || (to === "training" && from !== "training");
}

function stadiumForPlayerCount(count) {
  ensureLoaded();
  const kind = stadiumKindForCount(count);
  if (kind === "training") return cache.training || cache.x3 || cache.x4 || null;
  if (kind === "x3") return cache.x3 || cache.x4 || cache.training || null;
  return cache.x4 || cache.x3 || cache.training || null;
}

let lastStadiumKey = null;

function applyStadium(room, count) {
  const stadium = stadiumForPlayerCount(count);
  const key = stadiumKindForCount(count);
  if (!stadium) {
    if (lastStadiumKey !== "classic") {
      room.setDefaultStadium("Classic");
      lastStadiumKey = "classic";
    }
    return;
  }
  if (lastStadiumKey === key) return;
  try {
    room.setCustomStadium(stadium);
    lastStadiumKey = key;
  } catch (err) {
    console.warn("[maps] stadium inválido, fallback Classic:", err.message);
    room.setDefaultStadium("Classic");
    lastStadiumKey = "classic";
  }
}

function reloadMaps() {
  cache.loaded = false;
  cache.training = null;
  cache.x3 = null;
  cache.x4 = null;
  lastStadiumKey = null;
  ensureLoaded();
}

module.exports = {
  applyStadium,
  stadiumForPlayerCount,
  stadiumKindForCount,
  needsTrainingX3Swap,
  reloadMaps,
  parseStadium,
  stripHbsComments,
};
