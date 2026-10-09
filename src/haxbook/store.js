function storeRedeemUrl(statsUrl) {
  const url = new URL(String(statsUrl || ""));
  url.pathname = url.pathname.replace(/\/stats\/?$/, "") + "/store/redeem";
  url.search = "";
  return url.toString();
}

function normalizeStoreCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function roomCodeFromStatsUrl(statsUrl) {
  try {
    const parts = new URL(String(statsUrl || "")).pathname.split("/").filter(Boolean);
    const rooms = parts.indexOf("rooms");
    return rooms >= 0 && parts[rooms + 1] ? parts[rooms + 1] : "";
  } catch {
    return "";
  }
}

function isUntilLive(until, now = Date.now()) {
  if (!until) return true;
  const target = Date.parse(until);
  if (!Number.isFinite(target)) return false;
  return target > now;
}

function liveStoreEffects(store, now = Date.now()) {
  if (!store || typeof store !== "object") return null;
  const chatColor = String(store.chatColor || "").trim();
  const emoji = String(store.emoji || "").trim();
  const joinTemplate = String(store.joinTemplate || "").trim();
  const goalTemplate = String(store.goalTemplate || "").trim();
  const gifRoom = String(store.gifRoom || "").trim();
  const live = {
    chatColor: chatColor && isUntilLive(store.chatColorUntil, now) ? chatColor : null,
    emoji: emoji && isUntilLive(store.emojiUntil, now) ? emoji : null,
    joinTemplate: joinTemplate && isUntilLive(store.joinUntil, now) ? joinTemplate : null,
    goalTemplate: goalTemplate && isUntilLive(store.goalUntil, now) ? goalTemplate : null,
    gifRoom: gifRoom || null,
  };
  if (!live.chatColor && !live.emoji && !live.joinTemplate && !live.goalTemplate && !live.gifRoom) return null;
  return live;
}

function parseStoreColor(hex) {
  const raw = String(hex || "").trim();
  const match = /^#?([0-9A-Fa-f]{6})$/.exec(raw);
  return match ? Number.parseInt(match[1], 16) : null;
}

function formatStoreTemplate(template, nick) {
  return String(template || "").replaceAll("{nick}", String(nick || "").trim() || "?");
}

function storeGoalPhrase(scorerName, goalTemplate) {
  if (!goalTemplate) return null;
  return formatStoreTemplate(goalTemplate, scorerName);
}

const JOIN_HIGHLIGHT_MS = 60 * 1000;

const VIP_JOIN_LINES = [
  "⭐ {nick} entrou no campo... e o clima esquentou!",
  "🔥 Olha o {nick} aí, torcida brasileira!",
  "✨ Que momento! {nick} acaba de pisar no gramado.",
  "⭐ Chama que ela vem! {nick} tá na área.",
  "🔥 Abre a cortina do espetáculo, {nick} chegou!",
  "✨ Segura o homem! {nick} já tá no gramado.",
  "⭐ Silêncio na arena, {nick} acabou de entrar.",
  "🔥 Parem as máquinas! {nick} está na sala.",
  "✨ {nick} chegou para dar aula de futebol.",
  "⭐ Atenção, zaga adversária: {nick} entrou no jogo!",
  "🔥 O homem, a fera, a máquina: {nick} tá na área!",
];

const VIP_GOAL_LINES = [
  "⭐ É MAAASSA! É gol do {nick}!",
  "🔥 NO FUNDO DO MAAASCO! Golço de {nick}!",
  "✨ SAAAABE DE QUEM? Do {nick}, o nome dele!",
  "⭐ QUE AINDA LÁ DENTRO! {nick} guardou mais um!",
  "🔥 PODE ENTRAR QUE A CASA É SUA! Gol de {nick}!",
  "✨ ACORDA O CORUJÃO! {nick} mandou no gaveteiro!",
  "⭐ Apenas {nick}, o terror dos goleiros!",
  "🔥 {nick} guardou com categoria!",
  "✨ Que pintura de {nick}! Aceita que dói menos.",
  "⭐ Chuta de lá que {nick} resolve de cá!",
  "🔥 {nick} colocou a bola onde a coruja dorme!",
  "✨ Pode carimbar que o gol foi do {nick}!",
];

const VIP_ASSIST_LINES = [
  "⭐ Que visão! Passe açucarado de {nick}.",
  "🔥 {nick} serviu em bandeja de ouro!",
  "✨ Garçom! {nick} deixou na cara do gol.",
  "⭐ {nick} achou um passe onde não passava nem vento!",
  "🔥 Toca no {nick} que ele resolve o passe!",
  "✨ Que assistência de {nick}! Só teve o trabalho de empurrar.",
  "⭐ {nick} colocou a bola com a mão!",
];

const VIP_CS_LINES = [
  "⭐ FECHOU A FIRMA! {nick} terminou sem levar gol!",
  "🔥 Passa nada! {nick} trancou a baliza hoje.",
  "✨ Muro de concreto! {nick} deixou a zaga inviolável.",
  "⭐ Hoje não! {nick} colocou o cadeado no gol.",
  "🔥 {nick} operou milagres e saiu de campo zerado!",
  "✨ Podem tentar, mas o gol de {nick} tá blindado!",
];

function pickVipLine(lines, nick) {
  const line = lines[Math.floor(Math.random() * lines.length)] || "";
  return formatStoreTemplate(line, nick);
}

function vipStatusPhrase(lines, name, status) {
  if (!status?.vip && !status?.booster) return null;
  return pickVipLine(lines, name);
}

function pickVipJoinPhrase(nick) {
  return pickVipLine(VIP_JOIN_LINES, nick);
}

function vipGoalPhrase(name, status) {
  return vipStatusPhrase(VIP_GOAL_LINES, name, status);
}

function vipAssistPhrase(name, status) {
  return vipStatusPhrase(VIP_ASSIST_LINES, name, status);
}

function vipCleanSheetPhrase(name, status) {
  return vipStatusPhrase(VIP_CS_LINES, name, status);
}

async function redeemStoreCode({
  statsUrl,
  apiKey,
  code,
  auth,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalized = normalizeStoreCode(code);
  const linked = String(auth || "").trim();
  if (!normalized) return { ok: false, message: "Código inválido." };
  if (!linked) return { ok: false, message: "Entre logado no Haxball (não como guest) para ativar." };
  if (!statsUrl || !apiKey || typeof fetchImpl !== "function") {
    return { ok: false, message: "Loja indisponível nesta sala." };
  }
  let url;
  try {
    url = storeRedeemUrl(statsUrl);
  } catch {
    return { ok: false, message: "Loja indisponível nesta sala." };
  }
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ code: normalized, auth: linked }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: body.message || "Não deu para ativar esse código.",
        status: response.status,
      };
    }
    return {
      ok: true,
      message: body.message || "Ativo por 1 dia.",
      store: body.store || null,
      roomReset: body.roomReset === true,
    };
  } catch {
    return { ok: false, message: "Não deu para ativar. Tente de novo." };
  }
}

function storeConsumeGifUrl(statsUrl) {
  const url = new URL(String(statsUrl || ""));
  url.pathname = url.pathname.replace(/\/stats\/?$/, "") + "/store/consume-gif";
  url.search = "";
  return url.toString();
}

async function consumeStoreGif({
  statsUrl,
  apiKey,
  auth,
  fetchImpl = globalThis.fetch,
} = {}) {
  const linked = String(auth || "").trim();
  if (!linked) return { ok: false, message: "Entre logado no Haxball (não como guest) para ativar." };
  if (!statsUrl || !apiKey || typeof fetchImpl !== "function") {
    return { ok: false, message: "GIF indisponível nesta sala." };
  }
  let url;
  try {
    url = storeConsumeGifUrl(statsUrl);
  } catch {
    return { ok: false, message: "GIF indisponível nesta sala." };
  }
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ auth: linked }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) {
      return { ok: false, message: body.message || "Sem vale GIF nesta sala.", store: body.store || null };
    }
    return { ok: true, message: body.message || "Vale GIF usado.", store: body.store || null };
  } catch {
    return { ok: false, message: "Não deu para usar o vale GIF." };
  }
}

module.exports = {
  storeRedeemUrl,
  roomCodeFromStatsUrl,
  normalizeStoreCode,
  isUntilLive,
  liveStoreEffects,
  parseStoreColor,
  formatStoreTemplate,
  storeGoalPhrase,
  JOIN_HIGHLIGHT_MS,
  pickVipJoinPhrase,
  vipGoalPhrase,
  vipAssistPhrase,
  vipCleanSheetPhrase,
  redeemStoreCode,
  storeConsumeGifUrl,
  consumeStoreGif,
};
