const fs = require("fs");
const path = require("path");
const config = require("../config");

const cache = { training: null, x4: null, loaded: false };

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

function ensureLoaded() {
  if (cache.loaded) return;
  cache.loaded = true;

  // Prioridade: conteúdo inline no .env > arquivo
  if (config.mapTraining) {
    cache.training = config.mapTraining;
  } else {
    try {
      cache.training = loadFile(config.mapTrainingFile);
      if (cache.training) console.log("[maps] treino:", config.mapTrainingFile);
    } catch (err) {
      console.warn("[maps] treino inválido:", err.message);
    }
  }

  if (config.mapX4) {
    cache.x4 = config.mapX4;
  } else {
    try {
      cache.x4 = loadFile(config.mapX4File);
      if (cache.x4) console.log("[maps] x4:", config.mapX4File);
    } catch (err) {
      console.warn("[maps] x4 inválido:", err.message);
    }
  }
}

function stadiumForPlayerCount(count) {
  ensureLoaded();
  if (count <= 1) {
    return cache.training || cache.x4 || null;
  }
  return cache.x4 || cache.training || null;
}

let lastStadiumKey = null;

function applyStadium(room, count) {
  const stadium = stadiumForPlayerCount(count);
  const key = count <= 1 ? "training" : "x4";
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
  cache.x4 = null;
  lastStadiumKey = null;
  ensureLoaded();
}

module.exports = { applyStadium, stadiumForPlayerCount, reloadMaps };
