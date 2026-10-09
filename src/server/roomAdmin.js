const { createBan, deactivateBan } = require("../db/bans");
const { createMute, unmute } = require("../db/mutes");
const { connToIp, kickReason, formatDuration } = require("../utils");
const { withIdentity } = require("../room/playerAuth");
const config = require("../config");
const { createRoleCode, generateLoginCode } = require("../db/players");
const { notifyBan, notifyUnmute, notifyMute, notifyUnban, notifyStaffAudit } = require("../discord/webhook");

let control = null;

function setRoomControl(next) {
  control = next || null;
}

function getRoomControl() {
  return control;
}

function normalizeAuth(raw) {
  const auth = String(raw || "").trim();
  if (!auth || auth.length > 128 || /\s/.test(auth)) return null;
  return auth;
}

function banMs(minutes) {
  if (minutes == null || minutes === "") return null;
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 525600) * 60000;
}

function muteMs(minutes) {
  if (minutes == null || minutes === "") return 15 * 60000;
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return 15 * 60000;
  return Math.min(n, 525600) * 60000;
}

function findByAuth(room, ctx, auth) {
  return (
    room.getPlayerList().find((p) => {
      if (!p || p.id === 0) return false;
      const known = withIdentity(p, {
        auths: ctx.auths,
        conns: ctx.conns,
        livePlayers: room.getPlayerList(),
      });
      return known.auth === auth;
    }) || null
  );
}

function createLobbyRoomAdmin(room, ctx) {
  return {
    async ban({ auth, minutes, reason = "Discord" } = {}) {
      const key = normalizeAuth(auth);
      if (!key) return { ok: false, error: "auth inválida" };
      const ms = banMs(minutes);
      const endsAt = ms == null ? null : new Date(Date.now() + ms).toISOString();
      const target = findByAuth(room, ctx, key);
      const known = target
        ? withIdentity(target, {
            auths: ctx.auths,
            conns: ctx.conns,
            livePlayers: room.getPlayerList(),
          })
        : { auth: key };
      const conn = known.conn || null;
      const saved = await createBan({
        auth: key,
        conn,
        ip: connToIp(conn),
        nick: known.name || null,
        reason,
        bannedBy: "discord",
        endsAt,
      });
      if (!saved) return { ok: false, error: "ban não gravou (banco fora)" };
      if (target) {
        room.kickPlayer(target.id, kickReason(`Ban (${formatDuration(ms)}): ${reason}`), false);
      }
      notifyBan({
        nick: known.name || "fora da sala",
        auth: key,
        conn,
        ip: connToIp(conn),
        reason,
        duration: formatDuration(ms),
        endsAt,
        bannedBy: "Discord",
        source: "/ban",
      }).catch(() => {});
      return { ok: true, online: !!target, duration: formatDuration(ms) };
    },

    async unban({ auth } = {}) {
      const key = normalizeAuth(auth);
      if (!key) return { ok: false, error: "auth inválida" };
      const rows = await deactivateBan({ auth: key });
      if (rows[0]) {
        notifyUnban({
          nick: rows[0].nick,
          auth: rows[0].auth || key,
          conn: rows[0].conn,
          ip: rows[0].ip,
          reason: rows[0].reason,
          unbannedBy: "Discord",
          source: "/unban",
          count: rows.length,
        }).catch(() => {});
      }
      return { ok: true, count: rows.length };
    },

    async mute({ auth, minutes, reason = "Discord" } = {}) {
      const key = normalizeAuth(auth);
      if (!key) return { ok: false, error: "auth inválida" };
      const ms = muteMs(minutes);
      const endsAt = new Date(Date.now() + ms).toISOString();
      const target = findByAuth(room, ctx, key);
      await createMute({
        auth: key,
        nick: target?.name || null,
        reason,
        mutedBy: "discord",
        endsAt,
      });
      if (target) ctx.mutes.set(target.id, { endsAt: Date.now() + ms, reason });
      notifyMute({
        nick: target?.name,
        auth: key,
        reason,
        duration: formatDuration(ms),
        mutedBy: "Discord",
        source: "/mute",
      }).catch(() => {});
      return { ok: true, online: !!target, duration: formatDuration(ms) };
    },

    async unmute({ auth } = {}) {
      const key = normalizeAuth(auth);
      if (!key) return { ok: false, error: "auth inválida" };
      await unmute(key);
      const target = findByAuth(room, ctx, key);
      if (target) ctx.mutes.delete(target.id);
      for (const [id, cached] of ctx.auths.entries()) {
        if (cached === key) ctx.mutes.delete(id);
      }
      notifyUnmute({
        nick: target?.name,
        auth: key,
        unmutedBy: "Discord",
        source: "/unmute",
      }).catch(() => {});
      return { ok: true, online: !!target };
    },

    async call({ message } = {}) {
      const text = String(message || "").trim();
      if (!text) return { ok: false, error: "mensagem vazia" };
      if (text.length > 300) return { ok: false, error: "mensagem longa demais" };
      room.sendAnnouncement(text, null, 0x2ecc71, "bold", 1);
      return { ok: true };
    },

    status() {
      const people = room.getPlayerList().filter((p) => p && p.id !== 0);
      return {
        ok: true,
        players: people.length,
        max: config.maxPlayers,
        link: /^https:\/\/\S+$/.test(String(ctx.roomLink || "").trim()) ? String(ctx.roomLink).trim() : null,
        list: people.map((p) => ({
          id: p.id,
          name: p.name,
          place: p.team === 1 ? "vermelho" : p.team === 2 ? "azul" : "spec",
        })),
      };
    },

    async login({ level, by } = {}) {
      const grantLevel = Math.floor(Number(level));
      if (![1, 2, 3].includes(grantLevel)) return { ok: false, error: "nível inválido" };
      const who = String(by || "").trim().slice(0, 120);
      if (!who) return { ok: false, error: "informe quem gerou" };
      const meta = config.adminLevels[grantLevel] || { title: `nv.${grantLevel}` };
      let created = null;
      for (let i = 0; i < 6 && !created; i++) {
        created = await createRoleCode({
          code: generateLoginCode(),
          level: grantLevel,
          title: meta.title,
          createdBy: who,
        });
      }
      if (!created) return { ok: false, error: "não deu para gerar a senha" };
      notifyStaffAudit({
        title: "🔑 **Login gerado**",
        lines: [
          `Por: ${who}`,
          `Nível: ${grantLevel} ${meta.title}`,
          "Origem: Discord /login",
        ],
      }).catch(() => {});
      return { ok: true, code: created.code, level: grantLevel, title: meta.title };
    },
  };
}

function attachRoomAdminRoutes(app, auth) {
  function run(action) {
    return async (req, res) => {
      const api = getRoomControl();
      if (!api) return res.status(503).json({ ok: false, error: "sala offline" });
      try {
        const result = await api[action](req.body || {});
        const status = result?.ok ? 200 : 400;
        return res.status(status).json(result);
      } catch (err) {
        console.warn("[room-admin]", action, err?.message || err);
        return res.status(500).json({ ok: false, error: err.message || "falha" });
      }
    };
  }

  app.get("/status", auth, run("status"));
  app.post("/login", auth, run("login"));
  app.post("/ban", auth, run("ban"));
  app.post("/unban", auth, run("unban"));
  app.post("/mute", auth, run("mute"));
  app.post("/unmute", auth, run("unmute"));
  app.post("/call", auth, run("call"));
}

module.exports = {
  setRoomControl,
  getRoomControl,
  attachRoomAdminRoutes,
  createLobbyRoomAdmin,
  normalizeAuth,
  banMs,
  muteMs,
};
