const config = require("../config");

const emptyGeo = { city: null, region: null, country: null, isp: null };

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

async function notifyJoin({ playerId, nick, auth, conn, ip, admin, title }) {
  const url = config.discordWebhookUrl;
  if (!url) return;

  const geo = await lookupGeo(ip);
  const local = formatLocal(geo);
  const staff = admin ? `${admin.title} (nv ${admin.level})` : "—";
  const cargo = title ? `${title.emblem} ${title.name}` : "—";

  const content = [
    `**#${playerId} — ${nick}**`,
    `Auth: \`${auth || "—"}\``,
    `Conn: \`${conn || "—"}\``,
    `IP: \`${ip || "—"}\``,
    `Local: ${local}`,
    `ISP: ${geo.isp || "—"}`,
    `Staff: ${staff}`,
    `Cargo: ${cargo}`,
  ].join("\n");

  await postWebhook(url, content);
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

  return postWebhook(url, content);
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

  return postWebhook(url, content);
}

async function notifyStaffAudit({ title, lines, webhookUrl } = {}) {
  const url = webhookUrl || config.discordBanWebhookUrl;
  if (!url) return false;
  if (!webhookUrl && process.env.NODE_TEST_CONTEXT) return false;
  const content = [title, ...(lines || [])].filter(Boolean).join("\n");
  return postWebhook(url, content);
}

module.exports = { notifyJoin, notifyBan, notifyUnban, notifyStaffAudit, lookupGeo, postWebhook };
