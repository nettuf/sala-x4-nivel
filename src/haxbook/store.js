function storeRedeemUrl(statsUrl) {
  const url = new URL(String(statsUrl || ""));
  url.pathname = url.pathname.replace(/\/stats\/?$/, "") + "/store/redeem";
  url.search = "";
  return url.toString();
}

function normalizeStoreCode(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function isUntilLive(until, now = Date.now()) {
  if (!until) return true;
  const target = Date.parse(until);
  return !Number.isFinite(target) || target > now;
}

function liveStoreEffects(store, now = Date.now()) {
  if (!store || typeof store !== "object") return null;
  const chatColor = String(store.chatColor || "").trim();
  const emoji = String(store.emoji || "").trim();
  const joinTemplate = String(store.joinTemplate || "").trim();
  const goalTemplate = String(store.goalTemplate || "").trim();
  const live = {
    chatColor: chatColor && isUntilLive(store.chatColorUntil, now) ? chatColor : null,
    emoji: emoji && isUntilLive(store.emojiUntil, now) ? emoji : null,
    joinTemplate: joinTemplate && isUntilLive(store.joinUntil, now) ? joinTemplate : null,
    goalTemplate: goalTemplate && isUntilLive(store.goalUntil, now) ? goalTemplate : null,
  };
  if (!live.chatColor && !live.emoji && !live.joinTemplate && !live.goalTemplate) return null;
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
    };
  } catch {
    return { ok: false, message: "Não deu para ativar. Tente de novo." };
  }
}

module.exports = {
  storeRedeemUrl,
  normalizeStoreCode,
  isUntilLive,
  liveStoreEffects,
  parseStoreColor,
  formatStoreTemplate,
  storeGoalPhrase,
  redeemStoreCode,
};
