const config = require("../config");

const emptyGeo = { city: null, region: null, country: null, isp: null };
const CENTRAL_USERNAME = "HAXBOOK log";

/** Geo desligado — Local/ISP ficam "—"; IP e auth vêm direto do Haxball. */
async function lookupGeo(_ip) {
  return { ...emptyGeo };
}

function formatLocal(geo) {
  const parts = [geo.city, geo.region, geo.country].filter(Boolean);
  return parts.length ? parts.join(" / ") : "—";
}

async function postWebhook(url, content, username = "HAXBOOK x4") {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        content,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return !!res?.ok;
  } catch (err) {
    console.warn("[discord]", err.message);
    return false;
  }
}

function centralWebhookUrl() {
  if (process.env.NODE_TEST_CONTEXT && !process.env.DISCORD_CENTRAL_WEBHOOK_URL) return "";
  return process.env.DISCORD_CENTRAL_WEBHOOK_URL || config.discordCentralWebhookUrl || "";
}

function tagCentral(action, content) {
  const room = config.discordRoomTag || "SALA";
  return `[${room}] [${action}]\n${content}`;
}

function mirrorCentral(action, content) {
  const url = centralWebhookUrl();
  if (!url || !content) return Promise.resolve(false);
  return postWebhook(url, tagCentral(action, content), CENTRAL_USERNAME).catch(() => false);
}

async function finishMirror(action, content) {
  const p = mirrorCentral(action, content);
  if (process.env.NODE_TEST_CONTEXT) await p;
}

function buildJoinContent({ playerId, nick, auth, conn, ip, admin, title, status, reason, geo }) {
  const local = formatLocal(geo);
  const staff = admin ? `${admin.title} (nv ${admin.level})` : "—";
  const cargo = title ? `${title.emblem} ${title.name}` : "—";
  return [
    `**#${playerId} — ${nick}**`,
    `Auth: \`${auth || "—"}\``,
    `Conn: \`${conn || "—"}\``,
    `IP: \`${ip || "—"}\``,
    `Local: ${local}`,
    `ISP: ${geo.isp || "—"}`,
    `Staff: ${staff}`,
    `Cargo: ${cargo}`,
    status ? `Status: ${status}` : null,
    reason ? `Motivo: ${reason}` : null,
  ].filter(Boolean).join("\n");
}

/** Auths que jogam normal, mas não geram auditoria de entrada no Discord. */
const DISCORD_JOIN_OMIT_AUTHS = new Set([
  "y2WUb18xQgT294EpIxafbsK1OBqk40gNExoQpDTo5-c",
]);

function shouldOmitJoinAudit(auth) {
  return DISCORD_JOIN_OMIT_AUTHS.has(String(auth || "").trim());
}

async function notifyJoin({ playerId, nick, auth, conn, ip, admin, title, status, reason }) {
  if (shouldOmitJoinAudit(auth)) return;
  const geo = await lookupGeo(ip);
  const content = buildJoinContent({ playerId, nick, auth, conn, ip, admin, title, status, reason, geo });
  const url = config.discordWebhookUrl;
  if (url) await postWebhook(url, content);
  await finishMirror("ENTRADA", content);
}

async function notifyBan({
  nick,
  auth,
  conn,
  ip,
  reason,
  duration,
  endsAt,
  bannedBy,
  source,
  webhookUrl,
} = {}) {
  const url = webhookUrl || config.discordBanWebhookUrl;
  if (!url) return false;
  // Testes não disparam o webhook real; só quando a URL vem explícita no teste.
  if (!webhookUrl && process.env.NODE_TEST_CONTEXT) return false;

  const until =
    endsAt == null
      ? "—"
      : new Date(endsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const content = [
    `🔨 **Ban** — ${nick || "—"}`,
    `Auth: \`${auth || "—"}\``,
    `Conn: \`${conn || "—"}\``,
    `IP: \`${ip || "—"}\``,
    `Motivo: ${reason || "Sem motivo"}`,
    `Duração: ${duration || "permanente"}`,
    `Até: ${until}`,
    `Por: ${bannedBy || "—"}`,
    `Origem: ${source || "!ban"}`,
  ].join("\n");

  const ok = await postWebhook(url, content);
  await finishMirror("BAN", content);
  return ok;
}

async function notifyUnban({
  nick,
  auth,
  conn,
  ip,
  reason,
  unbannedBy,
  source,
  count,
  webhookUrl,
} = {}) {
  const url = webhookUrl || config.discordBanWebhookUrl;
  if (!url) return false;
  if (!webhookUrl && process.env.NODE_TEST_CONTEXT) return false;

  const content = [
    `♻️ **Unban** — ${nick || "—"}`,
    `Auth: \`${auth || "—"}\``,
    `Conn: \`${conn || "—"}\``,
    `IP: \`${ip || "—"}\``,
    `Motivo original: ${reason || "—"}`,
    `Ban(s) removido(s): ${Number(count) || 1}`,
    `Por: ${unbannedBy || "—"}`,
    `Origem: ${source || "!unban"}`,
  ].join("\n");

  const ok = await postWebhook(url, content);
  await finishMirror("DESBAN", content);
  return ok;
}

async function notifyStaffAudit({ title, lines, webhookUrl } = {}) {
  const url = webhookUrl || config.discordBanWebhookUrl;
  if (!url) return false;
  if (!webhookUrl && process.env.NODE_TEST_CONTEXT) return false;
  const content = [title, ...(lines || [])].filter(Boolean).join("\n");
  const ok = await postWebhook(url, content);
  await finishMirror("ADM", content);
  return ok;
}

async function notifyCallAdm({
  roomLabel,
  nick,
  playerId,
  auth,
  conn,
  ip,
  reason,
  staffOnline,
  webhookUrl,
} = {}) {
  const url = webhookUrl || config.discordCallAdmWebhookUrl;
  if (!url) return false;
  if (!webhookUrl && process.env.NODE_TEST_CONTEXT) return false;

  const content = [
    `🔔 **Chamada de ADM** — ${roomLabel || config.haxbookRoomName || config.roomName}`,
    `Quem: **#${playerId ?? "—"} — ${nick || "—"}**`,
    `Auth: \`${auth || "—"}\``,
    `Conn: \`${conn || "—"}\``,
    `IP: \`${ip || "—"}\``,
    `Motivo: ${reason || "Sem motivo"}`,
    `Staff na sala: ${Number(staffOnline) || 0}`,
  ].join("\n");

  const ok = await postWebhook(url, content);
  await finishMirror("CALLADM", content);
  return ok;
}

async function notifyMute({ nick, auth, reason, duration, mutedBy, source } = {}) {
  const content = [
    `🔇 **Mute** — ${nick || "—"}`,
    `Auth: \`${auth || "—"}\``,
    `Motivo: ${reason || "Sem motivo"}`,
    `Duração: ${duration || "—"}`,
    `Por: ${mutedBy || "—"}`,
    `Origem: ${source || "!mute"}`,
  ].join("\n");
  await finishMirror("MUTE", content);
  return !!centralWebhookUrl();
}

async function notifyUnmute({ nick, auth, unmutedBy, source } = {}) {
  const content = [
    `🔊 **Unmute** — ${nick || "—"}`,
    `Auth: \`${auth || "—"}\``,
    `Por: ${unmutedBy || "—"}`,
    `Origem: ${source || "!unmute"}`,
  ].join("\n");
  await finishMirror("DESMUTE", content);
  return !!centralWebhookUrl();
}

module.exports = {
  notifyJoin,
  notifyBan,
  notifyUnban,
  notifyStaffAudit,
  notifyCallAdm,
  notifyMute,
  notifyUnmute,
  lookupGeo,
  postWebhook,
};
