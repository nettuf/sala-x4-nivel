const config = require("../config");
const { findPlayer, parseDurationToMs, formatDuration, connToIp, kickReason, parseWhisper } = require("../utils");
const { resolvePlayerAuth } = require("../room/playerAuth");
const { isRandomKitArg, parseTeamRef } = require("../room/uniforms");
const { createBan, deactivateBan } = require("../db/bans");
const { getAdmin } = require("../db/players");
const { notifyBan } = require("../discord/webhook");
const { createMute, unmute, findActiveMute } = require("../db/mutes");
const {
  getPlayerStats,
  setSelectedTitle,
  formatStatusCard,
  emptyPlayerStats,
  getLeaderboard,
  formatTop5,
} = require("../db/stats");
const { formatCurrentStreak, formatBestStreak } = require("../room/streak");
const { formatBetLine, pickTeaseLine, pickPraiseLine, resolveTeaseTarget } = require("../room/bet");
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

const RANKING_CMDS = {
  gols: { stat: "goals", title: "⚽ Top 5 gols" },
  gol: { stat: "goals", title: "⚽ Top 5 gols" },
  goals: { stat: "goals", title: "⚽ Top 5 gols" },
  topgols: { stat: "goals", title: "⚽ Top 5 gols" },
  assists: { stat: "assists", title: "🎯 Top 5 assistências" },
  assist: { stat: "assists", title: "🎯 Top 5 assistências" },
  assistencias: { stat: "assists", title: "🎯 Top 5 assistências" },
  golcontra: { stat: "own_goals", title: "🤦 Top 5 gols contra" },
  gc: { stat: "own_goals", title: "🤦 Top 5 gols contra" },
  owngoal: { stat: "own_goals", title: "🤦 Top 5 gols contra" },
  owngoals: { stat: "own_goals", title: "🤦 Top 5 gols contra" },
  cs: { stat: "cs", title: "🧤 Top 5 clean sheets" },
  cleansheet: { stat: "cs", title: "🧤 Top 5 clean sheets" },
  cleansheets: { stat: "cs", title: "🧤 Top 5 clean sheets" },
};

function playerHelpLines({
  isAdmin = false,
  canChangeUni = false,
  onField = false,
  canAfk = true,
  isAfk = false,
  canChoose = false,
} = {}) {
  const lines = [
    "!ajuda — lista de comandos",
    "!bb — sair da sala",
    "!discord — convite do Discord",
    "!site — stats e rankings no Haxbook",
    "!status / !stats — estatísticas (jogos, gols, CS, MVP, WR, cargo)",
    "!cargos — emblemas desbloqueados",
    "!cargo <id|n> — escolher emblema",
  ];
  if (isAfk) lines.push("!voltar — sair do AFK");
  else if (canAfk) lines.push("!afk — ficar AFK / voltar");
  lines.push("!afks — ver quem está AFK");
  if (onField) lines.push("!t <msg> — chat do time");
  lines.push(
    "!ids — lista id dos jogadores",
    "@nick msg — mensagem privada (ou @#id)",
    "!gols !assists !golcontra !cs — top 5",
    "!streak — streak atual · !topstreak — recorde da sala",
    "!bet — aposta na Haxbooket",
    "!provocar [#id|nick] — zoação de quem entregou",
    "!elogiar [#id|nick] — elogio de craque",
    "!unis — uniformes disponíveis"
  );
  if (canChangeUni) {
    lines.push("!uni <kit> — troca o uniforme do time");
    lines.push("!uni random — sorteia o uniforme do time");
  }
  if (canChoose) {
    lines.push("Pick: número | top | random | bottom");
  }
  if (isAdmin) {
    lines.push("!ajudaadm — comandos de admin");
  }
  return lines;
}

function playerHelpText(opts) {
  return playerHelpLines(opts).join("\n");
}

function adminHelpText() {
  return [
    "!ajudaadm — comandos de admin",
    "!ban <#id|nick> [tempo] [motivo] — tempo: 30m, 2h, 1d, perm",
    "!banauth <auth> [tempo] [motivo] — bane pela auth (mesmo fora da sala)",
    "!unban <auth|conn>",
    "!unbanauth <auth>",
    "Staff na sala também vê os PVs (@nick)",
    "!mute <#id|nick> <tempo> [motivo]",
    "!unmute <#id|nick|auth>",
    "!uni red|blue <kit> — troca o uniforme de um time",
    "!uni random — sorteia os dois times",
    "!uni red|blue random — sorteia um lado",
    "!uni reset — volta os uniformes ao padrão",
  ].join("\n");
}

function createCommandHandler(room, ctx) {
  /** @type {Map<number, number>} */
  const lastAfkCommandAt = new Map();
  /** @type {Map<number, number>} */
  const lastBetAt = new Map();
  const lastTeaseAt = new Map();
  const lastPraiseAt = new Map();
  const BET_COOLDOWN_MS = 8000;
  const TEASE_COOLDOWN_MS = 8000;

  function resolveAuth(player) {
    return resolvePlayerAuth(player, ctx.auths, room.getPlayerList());
  }

  const noAuthMsg = "Entre logado no Haxball (não como guest) para stats e cargos.";

  /** Staff não pune staff de nível igual ou maior. */
  function canModerate(actor, target) {
    const targetAdmin = ctx.admins.get(target.id);
    if (!targetAdmin) return true;
    return (actor?.level || 0) > (targetAdmin.level || 0);
  }

  function forgetPlayer(playerId) {
    lastAfkCommandAt.delete(playerId);
    lastBetAt.delete(playerId);
    lastTeaseAt.delete(playerId);
    lastPraiseAt.delete(playerId);
  }

  async function loadTitleForPlayer(player) {
    const adminLevel = ctx.admins.get(player.id)?.level || 0;
    const auth = resolveAuth(player);
    if (!auth) {
      const title = resolveTitle({}, null, adminLevel);
      ctx.titles.set(player.id, title);
      return title;
    }
    const stats = (await getPlayerStats(auth)) || {};
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

  /** @returns {boolean} true se consumiu a mensagem (era PV) */
  function handleWhisper(player, message) {
    const parsed = parseWhisper(message);
    if (!parsed) return false;

    if (!parsed.body) {
      room.sendAnnouncement(
        "Uso: @nick mensagem  ·  ou @#id mensagem (veja !ids)",
        player.id,
        0xe74c3c,
        "normal",
        1
      );
      return true;
    }

    const target = findPlayer(room, parsed.mention);
    if (!target) {
      room.sendAnnouncement(
        "Jogador não encontrado para o PV. Use nick único ou @#id.",
        player.id,
        0xe74c3c,
        "normal",
        1
      );
      return true;
    }
    if (target.id === player.id) {
      room.sendAnnouncement("Não dá para mandar PV para você mesmo.", player.id, 0xe74c3c, "normal", 1);
      return true;
    }

    const color = chatColor(ctx.titles.get(player.id));
    room.sendAnnouncement(
      `📩 PV de @${player.name}: ${parsed.body}`,
      target.id,
      color,
      "bold",
      1
    );
    room.sendAnnouncement(
      `📩 PV para @${target.name}: ${parsed.body}`,
      player.id,
      color,
      "bold",
      1
    );
    ctx.chatLog?.push({
      nick: player.name,
      text: parsed.body,
      kind: "pv",
      to: target.name,
    });

    const spy = `📩 PV @${player.name} → @${target.name}: ${parsed.body}`;
    const online = new Set(room.getPlayerList().map((p) => p.id));
    for (const adminId of ctx.admins?.keys?.() || []) {
      if (adminId === player.id || adminId === target.id || !online.has(adminId)) continue;
      room.sendAnnouncement(spy, adminId, color, "bold", 1);
    }
    return true;
  }

  async function handle(player, message) {
    const text = String(message || "").trim();
    if (!text.startsWith("!")) return false;

    const parts = text.slice(1).split(/\s+/);
    const cmd = (parts[0] || "").toLowerCase();
    const args = parts.slice(1);
    const admin = ctx.admins.get(player.id);

    if (cmd === "help" || cmd === "comandos" || cmd === "ajuda") {
      const scores = typeof room.getScores === "function" ? room.getScores() : null;
      const inOfficial = !!ctx.match?.isCompetitive?.();
      const isAfk = !!ctx.afk?.isAfk?.(player.id);
      const captains = ctx.uniforms?.captains?.() || {};
      const canChangeUni = !!(
        admin ||
        (player.team && captains[player.team] === player.id)
      );
      const cap = ctx.choose?.isActive?.() ? ctx.choose.currentCaptain?.() : null;
      room.sendAnnouncement(
        playerHelpText({
          isAdmin: !!admin,
          canChangeUni,
          onField: player.team !== 0,
          canAfk: isAfk || !(player.team !== 0 && scores && inOfficial),
          isAfk,
          canChoose: !!(cap && cap.id === player.id),
        }),
        player.id,
        0xecf0f1,
        "small",
        1
      );
      return true;
    }

    if (cmd === "ajudaadm" || cmd === "helpadm" || cmd === "comandosadm") {
      if (!admin) return true;
      room.sendAnnouncement(adminHelpText(), player.id, 0xecf0f1, "small", 1);
      return true;
    }

    if (cmd === "bb") {
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

    if (cmd === "site" || cmd === "haxbook" || cmd === "statsweb") {
      const url = config.siteUrl;
      room.sendAnnouncement(`🌐 Stats, rankings e mais: ${url}`, null, 0x1abc9c, "bold", 1);
      return true;
    }

    if (cmd === "afk") {
      // Vale tanto para o !afk quanto para quem o bot tirou por estar parado.
      if (ctx.afk?.isAfk(player.id)) {
        ctx.afk.setAfk(player, false);
        return true;
      }
      const scores = typeof room.getScores === "function" ? room.getScores() : null;
      const inOfficial = !!ctx.match?.isCompetitive?.();
      if (player.team !== 0 && scores && inOfficial) {
        room.sendAnnouncement(
          "Não pode usar !afk no 4v4. Saia do time ou aguarde o jogo terminar.",
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
      ctx.afk?.setAfk(player, true);
      return true;
    }

    if (cmd === "afks") {
      const list = room
        .getPlayerList()
        .filter((p) => p.id !== 0 && ctx.afk?.isAfk(p.id))
        .map((p) => p.name);
      room.sendAnnouncement(
        list.length ? `😴 AFKs (${list.length}): ${list.join(" · ")}` : "Ninguém está AFK.",
        player.id,
        0xbdc3c7,
        "normal",
        1
      );
      return true;
    }

    if (cmd === "back" || cmd === "voltar") {
      if (!ctx.afk?.isAfk(player.id)) {
        room.sendAnnouncement("Você não está AFK. Use !afk.", player.id, 0xbdc3c7, "normal", 1);
        return true;
      }
      ctx.afk.setAfk(player, false);
      return true;
    }

    if (cmd === "t" || cmd === "team") {
      if (peekMute(player)) {
        room.sendAnnouncement(
          "Você está mutado — !t também está bloqueado. Outros comandos com ! seguem liberados.",
          player.id,
          0xe67e22,
          "bold",
          2
        );
        return true;
      }
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
      ctx.chatLog?.push({ nick: player.name, text: body, kind: "team" });
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
        `Uniformes: ${ctx.uniforms?.listText() || "-"}\nAtual: ${ctx.uniforms?.describe() || "-"}\nUse !uni <kit> ou !uni random (capitão ou admin)`,
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
          `Uso: !uni <kit> · !uni random · admin: !uni red|blue <kit|random> · !uni reset — veja !unis`,
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

      if (args.some((a) => isRandomKitArg(a))) {
        const teamToken = args.find((a) => parseTeamRef(a));
        const result = ctx.uniforms.randomizeRequest({
          player,
          isAdmin: !!admin,
          teamRef: teamToken || null,
        });
        if (!result.ok) {
          room.sendAnnouncement(result.error, player.id, 0xe74c3c, "bold", 2);
          return true;
        }
        if (result.mode === "both") {
          room.sendAnnouncement(
            `${player.name} sorteou: 🔴 ${result.red.name}  vs  🔵 ${result.blue.name}`,
            null,
            0xf1c40f,
            "bold",
            1
          );
        } else {
          room.sendAnnouncement(
            `${player.name} sorteou ${result.kit.name} no time ${result.team === 1 ? "🔴" : "🔵"}`,
            null,
            result.team === 1 ? 0xe74c3c : 0x3498db,
            "bold",
            1
          );
        }
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
      room.sendAnnouncement(formatCurrentStreak(n), player.id, 0xf1c40f, "bold", 1);
      return true;
    }

    if (cmd === "topstreak" || cmd === "recordstreak" || cmd === "melhorstreak" || cmd === "maxstreak") {
      const best = ctx.streak?.getBest?.() ?? ctx.roomStats?.snapshot?.()?.bestStreak ?? 0;
      const current = ctx.streak?.get?.() ?? 0;
      const holders =
        ctx.streak?.getBestHolders?.() ??
        ctx.roomStats?.snapshot?.()?.bestStreakHolders ??
        [];
      room.sendAnnouncement(formatBestStreak(best, current, holders), player.id, 0xf1c40f, "bold", 1);
      return true;
    }

    const ranking = RANKING_CMDS[cmd];
    if (ranking) {
      const fetchTop = ctx.getLeaderboard || getLeaderboard;
      const board = await fetchTop(ranking.stat);
      const text = board?.unavailable
        ? "Rankings indisponíveis no momento."
        : formatTop5(ranking.title, board?.rows);
      room.sendAnnouncement(text, player.id, 0xf1c40f, "bold", 1);
      return true;
    }

    if (cmd === "bet" || cmd === "aposta") {
      const now = Date.now();
      const elapsed = now - (lastBetAt.get(player.id) || 0);
      if (elapsed < BET_COOLDOWN_MS) {
        const left = Math.ceil((BET_COOLDOWN_MS - elapsed) / 1000);
        room.sendAnnouncement(
          `Espere ${left}s para apostar de novo.`,
          player.id,
          0xf1c40f,
          "normal",
          1
        );
        return true;
      }
      lastBetAt.set(player.id, now);
      const count = ctx.roomStats?.recordBet?.()?.bets ?? 1;
      room.sendAnnouncement(formatBetLine(count), null, 0xe67e22, "bold", 1);
      return true;
    }

    if (cmd === "provocar" || cmd === "provoca" || cmd === "entregou") {
      const now = Date.now();
      const elapsed = now - (lastTeaseAt.get(player.id) || 0);
      if (elapsed < TEASE_COOLDOWN_MS) {
        const left = Math.ceil((TEASE_COOLDOWN_MS - elapsed) / 1000);
        room.sendAnnouncement(
          `Espere ${left}s para zoar de novo.`,
          player.id,
          0xf1c40f,
          "normal",
          1
        );
        return true;
      }
      const mention = args.join(" ").trim();
      const target = resolveTeaseTarget(room, player, mention || null);
      if (!target) {
        room.sendAnnouncement(
          mention
            ? "Jogador não encontrado. Uso: !provocar ou !provocar <#id|nick>"
            : "Ninguém na sala pra zoar.",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      lastTeaseAt.set(player.id, now);
      room.sendAnnouncement(pickTeaseLine(target.name), null, 0xe67e22, "bold", 1);
      return true;
    }

    if (cmd === "elogiar" || cmd === "elogio" || cmd === "craque") {
      const now = Date.now();
      const elapsed = now - (lastPraiseAt.get(player.id) || 0);
      if (elapsed < TEASE_COOLDOWN_MS) {
        const left = Math.ceil((TEASE_COOLDOWN_MS - elapsed) / 1000);
        room.sendAnnouncement(
          `Espere ${left}s para elogiar de novo.`,
          player.id,
          0xf1c40f,
          "normal",
          1
        );
        return true;
      }
      const mention = args.join(" ").trim();
      const target = resolveTeaseTarget(room, player, mention || null);
      if (!target) {
        room.sendAnnouncement(
          mention
            ? "Jogador não encontrado. Uso: !elogiar ou !elogiar <#id|nick>"
            : "Ninguém na sala pra elogiar.",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      lastPraiseAt.set(player.id, now);
      room.sendAnnouncement(pickPraiseLine(target.name), null, 0xf1c40f, "bold", 1);
      return true;
    }

    if (cmd === "status" || cmd === "stats" || cmd === "stat" || cmd === "elo") {
      const target = args.length ? findPlayer(room, args.join(" ")) : player;
      if (!target) {
        room.sendAnnouncement(
          "Jogador não encontrado. Use !status ou !status <nick|#id>",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      const auth = resolvePlayerAuth(target, ctx.auths, room.getPlayerList());
      if (!auth) {
        room.sendAnnouncement(
          target.id === player.id ? noAuthMsg : `${target.name} está sem auth (guest).`,
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      const s = (await getPlayerStats(auth)) || emptyPlayerStats();
      const adminLevel = ctx.admins.get(target.id)?.level || 0;
      const title = resolveTitle(s, s.selected_title, adminLevel);
      room.sendAnnouncement(formatStatusCard(target.name, s, title), player.id, title.color, "bold", 1);
      return true;
    }

    if (cmd === "cargos" || cmd === "emblemas" || cmd === "titles") {
      const auth = resolveAuth(player);
      if (!auth) {
        room.sendAnnouncement(noAuthMsg, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const stats = (await getPlayerStats(auth)) || {};
      const adminLevel = ctx.admins.get(player.id)?.level || 0;
      const unlocked = listUnlocked(stats, adminLevel);
      const activeId = resolveTitle(stats, stats.selected_title, adminLevel).id;
      const lines = unlocked.map((t, i) => {
        const mark = t.id === activeId ? "✓" : "·";
        return `${mark} ${i + 1}. ${t.emblem} ${t.name} (${t.id}) [${reqLabel(t.req, t)}]`;
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
      const auth = resolveAuth(player);
      if (!auth) {
        room.sendAnnouncement(noAuthMsg, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const raw = args[0];
      if (!raw) {
        room.sendAnnouncement("Uso: !cargo <id|número> — veja !cargos", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const stats = (await getPlayerStats(auth)) || {};
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
      const ok = await setSelectedTitle(auth, title.id);
      if (!ok) {
        room.sendAnnouncement("Falha ao salvar cargo (Supabase?).", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      ctx.titles.set(player.id, title);
      room.sendAnnouncement(
        `Cargo ativo: ${title.emblem} ${title.name}`,
        player.id,
        title.color,
        "bold",
        2
      );
      return true;
    }

    if (!admin) {
      if (["ban", "unban", "banauth", "unbanauth", "mute", "unmute"].includes(cmd)) {
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
      if (!canModerate(admin, target)) {
        room.sendAnnouncement("Você não pode banir esse cargo.", player.id, 0xe74c3c, "bold", 2);
        return true;
      }
      const reason = reasonParts.join(" ") || "Sem motivo";
      const endsAt = ms == null ? null : new Date(Date.now() + ms).toISOString();
      const auth = resolveAuth(target);
      const conn = target.conn || ctx.conns?.get(target.id) || null;
      const ip = connToIp(conn);
      const bannedBy = resolveAuth(player) || player.name;
      const saved = await createBan({
        auth,
        conn,
        ip,
        nick: target.name,
        reason,
        bannedBy,
        endsAt,
      });
      notifyBan({
        nick: target.name,
        auth,
        conn,
        ip,
        reason,
        duration: formatDuration(ms),
        endsAt,
        bannedBy: player.name,
        source: saved ? "!ban" : "!ban (sem banco)",
      }).catch(() => {});
      if (!saved) {
        // Banco fora: tira o jogador agora, mas avisa que o ban não vai persistir.
        room.sendAnnouncement(
          "Ban não registrado (banco fora) — apliquei só o kick. Repita quando voltar.",
          player.id,
          0xe74c3c,
          "bold",
          2
        );
        room.kickPlayer(target.id, kickReason(`Kick: ${reason}`), false);
        return true;
      }
      room.kickPlayer(target.id, kickReason(`Ban (${formatDuration(ms)}): ${reason}`), false);
      room.sendAnnouncement(
        `${target.name} banido por ${player.name} (${formatDuration(ms)})`,
        null,
        0xe74c3c,
        "bold",
        2
      );
      return true;
    }

    if (cmd === "banauth") {
      const auth = String(args[0] || "").trim();
      if (!auth) {
        room.sendAnnouncement(
          "Uso: !banauth <auth> [tempo] [motivo] — tempo: 30m, 2h, 1d, perm",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
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
      const target =
        room.getPlayerList().find((p) => p.id !== 0 && resolveAuth(p) === auth) || null;
      if (target && !canModerate(admin, target)) {
        room.sendAnnouncement("Você não pode banir esse cargo.", player.id, 0xe74c3c, "bold", 2);
        return true;
      }
      if (!target) {
        const targetAdmin = await getAdmin(auth);
        if (targetAdmin && (admin.level || 0) <= (targetAdmin.level || 0)) {
          room.sendAnnouncement("Você não pode banir esse cargo.", player.id, 0xe74c3c, "bold", 2);
          return true;
        }
      }
      const conn = target ? target.conn || ctx.conns?.get(target.id) || null : null;
      const ip = connToIp(conn);
      const nick = target?.name || null;
      const saved = await createBan({
        auth,
        conn,
        ip,
        nick,
        reason,
        bannedBy: resolveAuth(player) || player.name,
        endsAt,
      });
      notifyBan({
        nick: nick || "fora da sala",
        auth,
        conn,
        ip,
        reason,
        duration: formatDuration(ms),
        endsAt,
        bannedBy: player.name,
        source: saved ? "!banauth" : "!banauth (sem banco)",
      }).catch(() => {});
      if (!saved) {
        if (target) {
          room.sendAnnouncement(
            "Ban não registrado (banco fora) — apliquei só o kick. Repita quando voltar.",
            player.id,
            0xe74c3c,
            "bold",
            2
          );
          room.kickPlayer(target.id, kickReason(`Kick: ${reason}`), false);
        } else {
          room.sendAnnouncement(
            "Ban por auth não registrado (banco fora).",
            player.id,
            0xe74c3c,
            "bold",
            2
          );
        }
        return true;
      }
      if (target) {
        room.kickPlayer(target.id, kickReason(`Ban (${formatDuration(ms)}): ${reason}`), false);
      }
      room.sendAnnouncement(
        `${nick || "Jogador"} banido por auth por ${player.name} (${formatDuration(ms)})`,
        null,
        0xe74c3c,
        "bold",
        2
      );
      room.sendAnnouncement("Ban por auth registrado.", player.id, 0x2ecc71, "normal", 1);
      return true;
    }

    if (cmd === "unban") {
      const key = args[0];
      if (!key) {
        room.sendAnnouncement("Uso: !unban <auth|conn>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      // conn é hex (par); auth do Haxball é base64url. Se não achar, tenta a outra coluna.
      const looksConn = /^[0-9a-f]+$/i.test(key) && key.length % 2 === 0;
      let n = looksConn
        ? await deactivateBan({ conn: key })
        : await deactivateBan({ auth: key });
      if (!n) {
        n = looksConn
          ? await deactivateBan({ auth: key })
          : await deactivateBan({ conn: key });
      }
      room.sendAnnouncement(n ? `Unban ok (${n}).` : "Nenhum ban ativo.", player.id, 0x2ecc71, "normal", 1);
      return true;
    }

    if (cmd === "unbanauth") {
      const auth = String(args[0] || "").trim();
      if (!auth) {
        room.sendAnnouncement("Uso: !unbanauth <auth>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const n = await deactivateBan({ auth });
      room.sendAnnouncement(
        n ? `Unban por auth ok (${n}).` : "Nenhum ban ativo para essa auth.",
        player.id,
        0x2ecc71,
        "normal",
        1
      );
      return true;
    }

    if (cmd === "mute") {
      const target = findPlayer(room, args[0]);
      const ms = parseDurationToMs(args[1]);
      if (!target || ms == null) {
        room.sendAnnouncement("Uso: !mute <#id|nick> <tempo> [motivo]", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      if (!canModerate(admin, target)) {
        room.sendAnnouncement("Você não pode mutar esse cargo.", player.id, 0xe74c3c, "bold", 2);
        return true;
      }
      const reason = args.slice(2).join(" ") || "Sem motivo";
      const endsAt = new Date(Date.now() + ms).toISOString();
      await createMute({
        auth: resolveAuth(target),
        nick: target.name,
        reason,
        mutedBy: resolveAuth(player) || player.name,
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
      const auth = (target && resolveAuth(target)) || args[0];
      if (!auth) {
        room.sendAnnouncement("Uso: !unmute <#id|nick|auth>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      await unmute(auth);
      if (target) ctx.mutes.delete(target.id);
      else {
        // Unmute por auth: limpa o cache de quem está na sala com essa auth.
        for (const [id, cached] of ctx.auths.entries()) {
          if (cached === auth) ctx.mutes.delete(id);
        }
      }
      // Nunca ecoa auth no chat público.
      room.sendAnnouncement(
        target ? `${target.name} não está mais mutado.` : "Unmute aplicado.",
        target ? null : player.id,
        0x2ecc71,
        "normal",
        1
      );
      return true;
    }

    return false;
  }

  async function isMuted(player) {
    const cached = peekMute(player);
    if (cached) return cached;
    const auth = resolveAuth(player);
    if (!auth) return null;
    const m = await findActiveMute(auth);
    if (!m) return null;
    const endsAt = new Date(m.ends_at).getTime();
    ctx.mutes.set(player.id, { endsAt, reason: m.reason });
    return { endsAt, reason: m.reason };
  }

  function peekMute(player) {
    const cached = ctx.mutes.get(player.id);
    if (!cached) return null;
    if (Date.now() < cached.endsAt) return cached;
    ctx.mutes.delete(player.id);
    return null;
  }

  function applyAdminLook(player, adminRow) {
    if (!adminRow) return;
    if (adminRow.level >= 1) {
      room.setPlayerAdmin(player.id, true);
    }
  }

  return {
    handle,
    isMuted,
    peekMute,
    forgetPlayer,
    applyAdminLook,
    loadTitleForPlayer,
    formatPlayerChat,
    handleWhisper,
    playerHelpText,
    adminHelpText,
    playerHelpLines,
  };
}

module.exports = { createCommandHandler };
