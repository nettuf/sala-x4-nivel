const config = require("../config");
const { findPlayer, parseDurationToMs, formatDuration, connToIp } = require("../utils");
const { createBan, deactivateBan } = require("../db/bans");
const { createMute, unmute, findActiveMute } = require("../db/mutes");
const { getPlayerStats, setSelectedTitle } = require("../db/stats");
const {
  TITLES,
  STAFF_TITLES,
  listUnlocked,
  isUnlocked,
  resolveTitle,
  getTitleById,
  reqLabel,
  chatColor,
  formatChatPrefix,
} = require("../titles");

function helpText(isAdmin) {
  const base = [
    "!help — comandos",
    "!bb — sair da sala",
    "!discord — convite do Discord",
    "!stats — estatísticas",
    "!cargos — emblemas desbloqueados",
    "!cargo <id|n> — escolher emblema",
    "!afk / !back — AFK voluntário",
    "!t <msg> — chat do time",
    "!ids — lista id dos jogadores",
    "!streak — sequência de vitórias atual",
    "!unis — uniformes disponíveis",
    "!uni <kit> — capitão/admin troca o uniforme do time",
    "Choose (8+): capitão usa número / top / random / bottom",
  ];
  if (!isAdmin) return base.join("\n");
  return [
    ...base,
    "!ban <#id|nick> [tempo] [motivo] — tempo: 30m, 2h, 1d, perm",
    "!unban <auth|conn>",
    "!mute <#id|nick> <tempo> [motivo]",
    "!unmute <#id|nick|auth>",
  ].join("\n");
}

function createCommandHandler(room, ctx) {
  /** @type {Map<number, number>} */
  const lastAfkCommandAt = new Map();

  async function loadTitleForPlayer(player) {
    const adminLevel = ctx.admins.get(player.id)?.level || 0;
    if (!player?.auth) {
      const title = resolveTitle({}, null, adminLevel);
      ctx.titles.set(player.id, title);
      return title;
    }
    const stats = (await getPlayerStats(player.auth)) || {};
    const title = resolveTitle(stats, stats.selected_title, adminLevel);
    ctx.titles.set(player.id, title);
    return title;
  }

  function formatPlayerChat(player, message) {
    const title = ctx.titles.get(player.id);
    return {
      line: `${formatChatPrefix(title)}${player.name}: ${message}`,
      color: chatColor(title),
    };
  }

  async function handle(player, message) {
    const text = String(message || "").trim();
    if (!text.startsWith("!")) return false;

    const parts = text.slice(1).split(/\s+/);
    const cmd = (parts[0] || "").toLowerCase();
    const args = parts.slice(1);
    const admin = ctx.admins.get(player.id);

    if (cmd === "help" || cmd === "comandos") {
      room.sendAnnouncement(helpText(!!admin), player.id, 0xecf0f1, "small", 1);
      return true;
    }

    if (cmd === "bb") {
      room.sendAnnouncement(`${player.name} saiu. Até mais!`, null, 0xbdc3c7, "normal", 1);
      try {
        room.kickPlayer(player.id, "Até mais!", false);
      } catch {
        /* ignore */
      }
      return true;
    }

    if (cmd === "discord" || cmd === "dc") {
      const url = config.discordInviteUrl;
      room.sendAnnouncement(`Entre em nosso Discord: ${url}`, null, 0x5865f2, "bold", 1);
      return true;
    }

    if (cmd === "afk") {
      if (ctx.afk?.isVoluntary(player.id)) {
        room.sendAnnouncement("Já está AFK. Use !back", player.id, 0xf1c40f, "normal", 1);
        return true;
      }
      const roomCount = room.getPlayerList().filter((p) => p.id !== 0).length;
      const scores = typeof room.getScores === "function" ? room.getScores() : null;
      const soloTraining =
        roomCount === 1 &&
        player.team !== 0 &&
        !ctx.match?.isCompetitive?.();
      if (player.team !== 0 && scores && !soloTraining) {
        room.sendAnnouncement(
          "Não pode usar !afk dentro da partida. Saia do time ou aguarde o jogo terminar.",
          player.id,
          0xe74c3c,
          "bold",
          2
        );
        return true;
      }
      const cooldown = config.afkCommandCooldownMs || 10000;
      const elapsed = Date.now() - (lastAfkCommandAt.get(player.id) || 0);
      if (elapsed < cooldown) {
        const left = Math.ceil((cooldown - elapsed) / 1000);
        room.sendAnnouncement(
          `Espere ${left}s para usar !afk de novo.`,
          player.id,
          0xf1c40f,
          "normal",
          1
        );
        return true;
      }
      lastAfkCommandAt.set(player.id, Date.now());
      ctx.afk?.setVoluntary(player, true);
      return true;
    }

    if (cmd === "back" || cmd === "voltar") {
      if (!ctx.afk?.isVoluntary(player.id)) {
        room.sendAnnouncement("Você não está AFK.", player.id, 0xbdc3c7, "normal", 1);
        return true;
      }
      ctx.afk.setVoluntary(player, false);
      return true;
    }

    if (cmd === "t" || cmd === "team") {
      if (player.team === 0) {
        room.sendAnnouncement("Chat de time só em campo.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const body = args.join(" ").trim();
      if (!body) {
        room.sendAnnouncement("Uso: !t <mensagem>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const emoji = player.team === 1 ? "🔴" : "🔵";
      const color = player.team === 1 ? 0xe74c3c : 0x3498db;
      for (const p of room.getPlayerList()) {
        if (p.team === player.team) {
          room.sendAnnouncement(`${emoji} [TEAM] ${player.name}: ${body}`, p.id, color, "bold", 1);
        }
      }
      return true;
    }

    if (cmd === "ids" || cmd === "id") {
      const list = room
        .getPlayerList()
        .filter((p) => p.id !== 0)
        .map((p) => `#${p.id} ${p.name}`)
        .join(" | ");
      room.sendAnnouncement(list || "Ninguém na sala.", player.id, 0xecf0f1, "small", 1);
      return true;
    }

    if (["unis", "uniformes", "kits", "camisas"].includes(cmd)) {
      room.sendAnnouncement(
        `Uniformes: ${ctx.uniforms?.listText() || "-"}\nAtual: ${ctx.uniforms?.describe() || "-"}\nUse !uni <kit> (capitão ou admin)`,
        player.id,
        0xecf0f1,
        "small",
        1
      );
      return true;
    }

    if (cmd === "uni" || cmd === "uniforme" || cmd === "camisa") {
      if (!ctx.uniforms) return true;

      if (!args.length) {
        room.sendAnnouncement(
          `Uso: !uni <kit> · admin: !uni red|blue <kit> · !uni reset — veja !unis`,
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }

      if (["reset", "padrao", "padrão"].includes(args[0].toLowerCase())) {
        if (!admin) {
          room.sendAnnouncement("Só admin reseta os uniformes.", player.id, 0xe74c3c, "normal", 1);
          return true;
        }
        ctx.uniforms.reset();
        room.sendAnnouncement("Uniformes voltaram ao padrão.", null, 0xbdc3c7, "normal", 1);
        return true;
      }

      const teamRef = args.length > 1 ? args[0] : null;
      const kitId = args.length > 1 ? args[1] : args[0];
      const result = ctx.uniforms.change({
        player,
        isAdmin: !!admin,
        teamRef,
        kitId,
      });

      if (!result.ok) {
        room.sendAnnouncement(result.error, player.id, 0xe74c3c, "bold", 2);
        return true;
      }

      room.sendAnnouncement(
        `${player.name} vestiu ${result.kit.name} no time ${result.team === 1 ? "🔴" : "🔵"}`,
        null,
        result.team === 1 ? 0xe74c3c : 0x3498db,
        "bold",
        1
      );
      return true;
    }

    if (cmd === "streak" || cmd === "streaks") {
      const n = ctx.streak?.get?.() ?? 0;
      room.sendAnnouncement(
        n > 0 ? `🔁 Streak atual: ${n} (vencedores no vermelho)` : "🔁 Sem streak no momento.",
        player.id,
        0xf1c40f,
        "bold",
        1
      );
      return true;
    }

    if (cmd === "stats" || cmd === "stat" || cmd === "elo") {
      if (!player.auth) {
        room.sendAnnouncement("Sem auth — stats indisponível.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const s = await getPlayerStats(player.auth);
      if (!s) {
        room.sendAnnouncement("Sem partidas registradas ainda.", player.id, 0xbdc3c7, "normal", 1);
        return true;
      }
      const adminLevel = ctx.admins.get(player.id)?.level || 0;
      const title = resolveTitle(s, s.selected_title, adminLevel);
      room.sendAnnouncement(
        `${title.emblem} ${player.name}: ${s.games}J ${s.wins}V ${s.draws}E ${s.losses}D | ${s.goals}G ${s.assists}A ${s.mvps || 0}MVP ${s.own_goals}GC`,
        player.id,
        title.color,
        "bold",
        1
      );
      return true;
    }

    if (cmd === "cargos" || cmd === "emblemas" || cmd === "titles") {
      if (!player.auth) {
        room.sendAnnouncement("Sem auth.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const stats = (await getPlayerStats(player.auth)) || {};
      const adminLevel = ctx.admins.get(player.id)?.level || 0;
      const unlocked = listUnlocked(stats, adminLevel);
      const activeId = resolveTitle(stats, stats.selected_title, adminLevel).id;
      const lines = unlocked.map((t, i) => {
        const mark = t.id === activeId ? "✓" : "·";
        return `${mark} ${i + 1}. ${t.emblem}${t.name} (${t.id}) [${reqLabel(t.req, t)}]`;
      });
      const total = TITLES.length + STAFF_TITLES.filter((t) => adminLevel >= t.level).length;
      room.sendAnnouncement(
        `Seus cargos (${unlocked.length}/${total}):\n${lines.join("\n")}\nUse !cargo <id|n> — só um ativo`,
        player.id,
        0xecf0f1,
        "small",
        1
      );
      return true;
    }

    if (cmd === "cargo" || cmd === "emblema" || cmd === "title") {
      if (!player.auth) {
        room.sendAnnouncement("Sem auth.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const raw = args[0];
      if (!raw) {
        room.sendAnnouncement("Uso: !cargo <id|número> — veja !cargos", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const stats = (await getPlayerStats(player.auth)) || {};
      const adminLevel = ctx.admins.get(player.id)?.level || 0;
      const unlocked = listUnlocked(stats, adminLevel);
      let title = null;
      if (/^\d+$/.test(raw)) {
        title = unlocked[Number(raw) - 1] || null;
      } else {
        title = getTitleById(String(raw).toLowerCase());
      }
      if (!title) {
        room.sendAnnouncement("Cargo inválido.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      if (!isUnlocked(stats, title.id, adminLevel)) {
        room.sendAnnouncement(
          `Bloqueado. Precisa: ${reqLabel(title.req, title)}`,
          player.id,
          0xe67e22,
          "bold",
          2
        );
        return true;
      }
      const ok = await setSelectedTitle(player.auth, title.id);
      if (!ok) {
        room.sendAnnouncement("Falha ao salvar cargo (Supabase?).", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      ctx.titles.set(player.id, title);
      room.sendAnnouncement(
        `Cargo ativo: ${title.emblem} ${title.name}`,
        null,
        title.color,
        "bold",
        2
      );
      return true;
    }

    if (!admin) {
      if (["ban", "unban", "mute", "unmute"].includes(cmd)) {
        room.sendAnnouncement("Sem permissão.", player.id, 0xe74c3c, "bold", 2);
        return true;
      }
      return false;
    }

    if (cmd === "ban") {
      const target = findPlayer(room, args[0]);
      if (!target) {
        room.sendAnnouncement("Uso: !ban <#id|nick> [tempo] [motivo]", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      let durationRaw = args[1];
      let reasonParts = args.slice(2);
      let ms = parseDurationToMs(durationRaw);
      if (durationRaw && ms === null && durationRaw !== "perm" && durationRaw !== "permanente") {
        reasonParts = args.slice(1);
        durationRaw = "perm";
        ms = null;
      }
      const reason = reasonParts.join(" ") || "Sem motivo";
      const endsAt = ms == null ? null : new Date(Date.now() + ms).toISOString();
      await createBan({
        auth: target.auth || null,
        conn: target.conn || null,
        ip: connToIp(target.conn),
        nick: target.name,
        reason,
        bannedBy: player.auth || player.name,
        endsAt,
      });
      room.kickPlayer(target.id, `Ban (${formatDuration(ms)}): ${reason}`, false);
      room.sendAnnouncement(
        `${target.name} banido por ${player.name} (${formatDuration(ms)})`,
        null,
        0xe74c3c,
        "bold",
        2
      );
      return true;
    }

    if (cmd === "unban") {
      const key = args[0];
      if (!key) {
        room.sendAnnouncement("Uso: !unban <auth|conn>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const byAuth = key.length > 20;
      const n = byAuth
        ? await deactivateBan({ auth: key })
        : await deactivateBan({ conn: key });
      room.sendAnnouncement(n ? `Unban ok (${n}).` : "Nenhum ban ativo.", player.id, 0x2ecc71, "normal", 1);
      return true;
    }

    if (cmd === "mute") {
      const target = findPlayer(room, args[0]);
      const ms = parseDurationToMs(args[1]);
      if (!target || ms == null) {
        room.sendAnnouncement("Uso: !mute <#id|nick> <tempo> [motivo]", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const reason = args.slice(2).join(" ") || "Sem motivo";
      const endsAt = new Date(Date.now() + ms).toISOString();
      await createMute({
        auth: target.auth,
        nick: target.name,
        reason,
        mutedBy: player.auth || player.name,
        endsAt,
      });
      ctx.mutes.set(target.id, { endsAt: Date.now() + ms, reason });
      room.sendAnnouncement(
        `${target.name} mutado ${formatDuration(ms)} por ${player.name}`,
        null,
        0xf39c12,
        "bold",
        2
      );
      return true;
    }

    if (cmd === "unmute") {
      const target = findPlayer(room, args[0]);
      const auth = target?.auth || args[0];
      if (!auth) {
        room.sendAnnouncement("Uso: !unmute <#id|nick|auth>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      await unmute(auth);
      if (target) ctx.mutes.delete(target.id);
      room.sendAnnouncement(`Unmute: ${target?.name || auth}`, null, 0x2ecc71, "normal", 1);
      return true;
    }

    return false;
  }

  async function isMuted(player) {
    const cached = ctx.mutes.get(player.id);
    if (cached) {
      if (Date.now() < cached.endsAt) return cached;
      ctx.mutes.delete(player.id);
    }
    if (!player.auth) return null;
    const m = await findActiveMute(player.auth);
    if (!m) return null;
    const endsAt = new Date(m.ends_at).getTime();
    ctx.mutes.set(player.id, { endsAt, reason: m.reason });
    return { endsAt, reason: m.reason };
  }

  function applyAdminLook(player, adminRow) {
    if (!adminRow) return;
    const meta = config.adminLevels[adminRow.level] || config.adminLevels[1];
    room.sendAnnouncement(
      `${meta.emblem} ${meta.title} ${player.name} entrou.`,
      null,
      meta.color,
      "bold",
      1
    );
    if (adminRow.level >= 3) {
      room.setPlayerAdmin(player.id, true);
    }
  }

  return { handle, isMuted, applyAdminLook, loadTitleForPlayer, formatPlayerChat, helpText };
}

module.exports = { createCommandHandler };
