const fs = require("fs");
const path = require("path");
const config = require("../config");

const cache = { training: null, x3: null, x4: null, loaded: false };

function loadFile(filePath) {
  if (!filePath) return null;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(config.root, filePath);
  if (!fs.existsSync(abs)) {
    console.warn("[maps] arquivo não encontrado:", abs);
    return null;
  }
  const raw = fs.readFileSync(abs, "utf8").trim();
  if (!raw) return null;
  // valida JSON sem alterar o texto (Haxball aceita o .hbs como string)
  JSON.parse(raw);
  return raw;
}

function loadSlot(kind, inline, filePath, label) {
  if (inline) {
    cache[kind] = inline;
    return;
  }
  try {
    cache[kind] = loadFile(filePath);
    if (cache[kind]) console.log(`[maps] ${label}:`, filePath);
  } catch (err) {
    console.warn(`[maps] ${label} inválido:`, err.message);
  }
}

function ensureLoaded() {
  if (cache.loaded) return;
  cache.loaded = true;

  loadSlot("training", config.mapTraining, config.mapTrainingFile, "treino");
  loadSlot("x3", config.mapX3, config.mapX3File, "x3");
  loadSlot("x4", config.mapX4, config.mapX4File, "x4");
}

/** 1 = treino; 2–7 (1v1/2v2/3v3) = x3; 8+ = x4 */
function stadiumKindForCount(count) {
  const n = Number(count) || 0;
  if (n <= 1) return "training";
  if (n < 8) return "x3";
  return "x4";
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

/** Força recarregar arquivos (útil se trocar .hbs sem restart completo) */
function reloadMaps() {
  cache.loaded = false;
  cache.training = null;
  cache.x3 = null;
  cache.x4 = null;
  lastStadiumKey = null;
  ensureLoaded();
}

module.exports = { applyStadium, stadiumForPlayerCount, stadiumKindForCount, reloadMaps };
