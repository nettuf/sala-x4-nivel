const config = require("../config");
const { postWebhook } = require("./webhook");

const DISCORD_CONTENT_LIMIT = 1900;
const LINE_MAX = 280;

function chatWebhookUrl() {
  if (process.env.NODE_TEST_CONTEXT && !process.env.DISCORD_CHAT_WEBHOOK_URL) return "";
  return config.discordChatWebhookUrl;
}

function formatChatClock(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });
}

function sanitizeDiscord(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LINE_MAX)
    .replace(/@/g, "@\u200b");
}

function formatChatLine({ at, nick, text, kind, to } = {}) {
  const clock = formatChatClock(at);
  const who = sanitizeDiscord(nick) || "—";
  const body = sanitizeDiscord(text);
  if (kind === "pv") return `[${clock}] ${who} → ${sanitizeDiscord(to)}: ${body}`;
  if (kind === "team") return `[${clock}] [TEAM] ${who}: ${body}`;
  return `[${clock}] ${who}: ${body}`;
}

/**
 * Acumula o chat e manda em lote ao Discord — o handler da sala não espera a rede.
 */
function createChatLogger({ url, flushMs, post } = {}) {
  const hook = url === undefined ? chatWebhookUrl() : url;
  const interval = Number(flushMs ?? config.discordChatFlushMs) || 4000;
  const send = post || ((content) => postWebhook(hook, content, "HAXBOOK x4 chat"));
  const queue = [];
  let timer = null;
  let sending = false;

  function queuedSize() {
    return queue.reduce((n, line) => n + line.length + 1, 0);
  }

  function schedule() {
    if (timer || !hook) return;
    timer = setTimeout(() => {
      timer = null;
      flush().catch(() => {});
    }, interval);
    if (typeof timer.unref === "function") timer.unref();
  }

  function push(entry) {
    if (!hook) return;
    const text = String(entry?.text || "").trim();
    if (!text) return;
    queue.push(formatChatLine({ at: new Date(), ...entry, text }));
    if (queuedSize() >= DISCORD_CONTENT_LIMIT || queue.length >= 25) {
      flush().catch(() => {});
      return;
    }
    schedule();
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!hook || sending || !queue.length) return false;
    sending = true;
    const batch = [];
    let size = 0;
    while (queue.length) {
      const next = queue[0];
      if (batch.length && size + next.length + 1 > DISCORD_CONTENT_LIMIT) break;
      batch.push(queue.shift());
      size += next.length + 1;
    }
    try {
      await send(batch.join("\n"));
      return true;
    } catch (err) {
      console.warn("[chat-log]", err.message);
      return false;
    } finally {
      sending = false;
      if (queue.length) schedule();
    }
  }

  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    queue.length = 0;
  }

  return { push, flush, stop, queued: () => queue.length };
}

module.exports = { createChatLogger, formatChatLine, formatChatClock };
