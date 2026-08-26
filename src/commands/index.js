const config = require("../config");
const { findPlayer, parseDurationToMs, formatDuration, connToIp, kickReason, parseWhisper } = require("../utils");
const { resolvePlayerAuth } = require("../room/playerAuth");
const { isRandomKitArg, parseTeamRef } = require("../room/uniforms");
const { createBan, deactivateBan } = require("../db/bans");
const { getAdmin } = require("../db/players");
const { notifyBan, notifyUnban } = require("../discord/webhook");
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
const { formatBetLine, formatViadoLine, pickTeaseLine, pickPraiseLine, resolveTeaseTarget } = require("../room/bet");
const {
  TITLES,
  STAFF_TITLES,
  listUnlocked,
  isUnlocked,
  resolveTitle,
  getTitleById,
  reqLabel,
  formatTitleCatalog,
  chatColor,
  formatChatPrefix,
  formatChatBody,
  JOKE_TITLES,
  STREAK_TITLE,
  wearsStreakTitle,
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
    "!listacargos — todos os emblemas e como desbloquear",
    "!cargo <id|n> — escolher emblema",
  ];
  if (isAfk) lines.push("!voltar — sair do AFK");
  else if (canAfk) lines.push("!afk — ficar AFK / voltar");
  lines.push("!afks — ver quem está AFK");
  if (onField) lines.push("t <msg> — chat do time");
  if (isAdmin) lines.push("% <msg> — chat só de staff");
  lines.push(
    "!ids — lista id dos jogadores",
    "@nick msg — mensagem privada (ou @#id)",
    "!gols !assists !golcontra !cs — top 5",
    "!streak — streak atual · !topstreak — recorde da sala",
    "!bet — aposta na Haxbooket",
    "!viado — viraram viado (contador)",
    "!provocar [#id|nick] — zoação de quem entregou",
    "!elogiar [#id|nick] — elogio de craque",
    "!roleta <#id|nick> — 50/50: mute 1min em você ou no alvo (15min na sala)",
    "!gordo [#id|nick] — cargo 🍔 Gordo por 20min",
    "!aura / !ego [#id|nick] — cargo 🗿 Aura por 20min",
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

/** Specs que o capitão pode puxar (AFK no spec não conta). */
function eligibleSpecCount(room, afk) {
  return (room?.getPlayerList?.() || []).filter(
    (p) => p.id !== 0 && p.team === 0 && !afk?.isAfk?.(p.id)
  ).length;
}

/**
 * !afk no 4v4 ao vivo só se tiver gente no spec pra repor.
 * Antes da partida (sem placar) ou em treino/choose: sempre pode.
 * No spec, ou pra sair do AFK, também sempre pode.
 */
function canVoluntaryAfk(player, room, ctx) {
  if (!player || player.team === 0) return true;
  if (!ctx?.match?.isCompetitive?.()) return true;
  const scores = typeof room?.getScores === "function" ? room.getScores() : null;
  if (!scores) return true;
  return eligibleSpecCount(room, ctx.afk) > 0;
}

function adminHelpText(level = 0) {
  const lines = [
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
    "% <msg> — chat só de staff",
  ];
  if ((level || 0) >= 4) {
    lines.push("!provocaradm <texto> — provoca com texto livre (só Chefe)");
  }
  return lines.join("\n");
}

function cooldownLeftSec(lastAt, ms, now) {
  const left = ms - (now - (Number(lastAt) || 0));
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function createCommandHandler(room, ctx) {
  const clock = typeof ctx.now === "function" ? ctx.now : () => Date.now();
  /** @type {Map<number, number>} */
  const lastAfkCommandAt = new Map();
  /** @type {Map<number, number>} */
  const lastFunPlayerAt = new Map();
  /** @type {Map<string, number>} */
  const lastLookupAt = new Map();
  let lastFunRoomAt = 0;
  let lastRoletaAt = 0;
  const FUN_PLAYER_MS = config.cmdPublicPlayerMs || 25000;
  const FUN_ROOM_MS = config.cmdPublicRoomMs || 15000;
  const LOOKUP_MS = config.cmdLookupPlayerMs || 10000;
  const JOKE_CD_MS = config.tempTitleCooldownMs || 15 * 60 * 1000;
  const JOKE_MS = config.tempTitleMs || 20 * 60 * 1000;
  const ROLETA_MS = config.roletaMuteMs || 60 * 1000;
  const ROLETA_CD_MS = config.roletaCooldownMs || 15 * 60 * 1000;
  /** @type {Map<string, { kind: string, title: object, endsAt: number, previous: object|null }>} */
  const jokeTitles = new Map();
  /** @type {Map<string, number>} kind → last cast (cooldown da sala, não por jogador) */
  const lastJokeCastAt = new Map();

  function resolveAuth(player) {
    return resolvePlayerAuth(player, ctx.auths, room.getPlayerList());
  }

  function jokeSubjectKey(player) {
    return resolveAuth(player) || `id:${player.id}`;
  }

  function ensureTitlesMap() {
    if (!ctx.titles) ctx.titles = new Map();
    return ctx.titles;
  }

  function peekJoke(player, now = clock()) {
    const key = jokeSubjectKey(player);
    const cur = jokeTitles.get(key);
    if (!cur) return null;
    if (cur.endsAt <= now) {
      jokeTitles.delete(key);
      const titles = ensureTitlesMap();
      if (cur.previous) titles.set(player.id, cur.previous);
      else if (titles.get(player.id)?.kind === "joke") titles.delete(player.id);
      return null;
    }
    return cur;
  }

  function wearJoke(player, baseTitle) {
    const joke = peekJoke(player);
    if (joke) {
      if (baseTitle && baseTitle.kind !== "joke") joke.previous = baseTitle;
      ensureTitlesMap().set(player.id, joke.title);
      return joke.title;
    }
    const real = baseTitle?.kind === "joke" ? null : baseTitle;
    if (real) ensureTitlesMap().set(player.id, real);
    return ensureTitlesMap().get(player.id) || real;
  }

  /** Overlay 🔥 se o vermelho está streakando (≥3) e o jogador está no red sem AFK. */
  function displayTitle(player, baseTitle) {
    const worn = wearJoke(player, baseTitle);
    const live = room.getPlayerList().find((p) => p.id === player.id) || player;
    const streak = typeof ctx.streak?.get === "function" ? ctx.streak.get() : 0;
    const afk = !!ctx.afk?.isAfk?.(player.id);
    if (wearsStreakTitle(streak, live.team, afk)) return STREAK_TITLE;
    return worn;
  }

  function formatJokeWait(leftSec) {
    if (leftSec >= 60) return `${Math.ceil(leftSec / 60)}min`;
    return `${leftSec}s`;
  }

  function applyRoleta(player, args) {
    const mention = args.join(" ").trim();
    if (!mention) {
      room.sendAnnouncement("Uso: !roleta <#id|nick>", player.id, 0xe74c3c, "normal", 1);
      return true;
    }
    const target = findPlayer(room, mention);
    if (!target) {
      room.sendAnnouncement("Jogador não encontrado. Uso: !roleta <#id|nick>", player.id, 0xe74c3c, "normal", 1);
      return true;
    }
    if (target.id === player.id) {
      room.sendAnnouncement("Marca outra pessoa. A roleta é você contra o alvo.", player.id, 0xe74c3c, "normal", 1);
      return true;
    }
    const now = clock();
    const left = cooldownLeftSec(lastRoletaAt, ROLETA_CD_MS, now);
    if (left > 0) {
      room.sendAnnouncement(
        `A roleta só gira de novo em ${formatJokeWait(left)}.`,
        player.id,
        0xf1c40f,
        "normal",
        1
      );
      return true;
    }
    const rng = typeof ctx.random === "function" ? Number(ctx.random()) : Math.random();
    const loser = rng < 0.5 ? player : target;
    lastRoletaAt = now;
    const endsAt = Date.now() + ROLETA_MS;
    const existing = ctx.mutes.get(loser.id);
    if (!existing || existing.endsAt < endsAt) {
      ctx.mutes.set(loser.id, { endsAt, reason: "roleta" });
    }
    room.sendAnnouncement(
      `🎰 Roleta: ${player.name} apontou pra ${target.name}. Caiu em ${loser.name} — mudo 1min.`,
      null,
      0x9b59b6,
      "bold",
      2
    );
    return true;
  }

  async function applyJokeTitle(player, args, kind) {
    const spec = JOKE_TITLES[kind];
    const mention = args.join(" ").trim();
    const target = resolveTeaseTarget(room, player, mention || null);
    if (!target) {
      room.sendAnnouncement(
        mention
          ? `Jogador não encontrado. Uso: !${kind} ou !${kind} <#id|nick>`
          : `Ninguém na sala pra virar ${spec.name}.`,
        player.id,
        0xe74c3c,
        "normal",
        1
      );
      return true;
    }
    const now = clock();
    const active = peekJoke(target, now);
    if (active) {
      room.sendAnnouncement(
        `${target.name} já está com ${active.title.emblem} ${active.title.name} — espere acabar antes de usar !${kind}.`,
        player.id,
        0xf1c40f,
        "normal",
        1
      );
      return true;
    }
    const left = cooldownLeftSec(lastJokeCastAt.get(kind), JOKE_CD_MS, now);
    if (left > 0) {
      room.sendAnnouncement(
        `Espere ${formatJokeWait(left)} para usar !${kind} de novo.`,
        player.id,
        0xf1c40f,
        "normal",
        1
      );
      return true;
    }
    lastJokeCastAt.set(kind, now);
    const previous = peekJoke(target)?.previous || ensureTitlesMap().get(target.id) || null;
    const safePrev = previous?.kind === "joke" ? null : previous;
    jokeTitles.set(jokeSubjectKey(target), {
      kind,
      title: spec,
      endsAt: now + JOKE_MS,
      previous: safePrev,
    });
    wearJoke(target, spec);
    const line =
      kind === "gordo"
        ? `${player.name} invocou o CaçadorDeGordo 🍔 em ${target.name}`
        : `${player.name} deu a bênção do ProdLuz 🗿 para ${target.name}`;
    room.sendAnnouncement(line, null, spec.color, "bold", 1);
    return true;
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
    lastFunPlayerAt.delete(playerId);
    for (const key of [...lastLookupAt.keys()]) {
      if (key.startsWith(`${playerId}:`)) lastLookupAt.delete(key);
    }
  }

  function tellWait(player, left) {
    room.sendAnnouncement(
      `Espere ${left}s pra não floodar o chat.`,
      player.id,
      0xf1c40f,
      "normal",
      1
    );
    return true;
  }

  /** !bet !viado !provocar !elogiar !discord !site — um anúncio público por vez na sala. */
  function blockPublicFun(player) {
    const now = clock();
    const left = Math.max(
      cooldownLeftSec(lastFunPlayerAt.get(player.id), FUN_PLAYER_MS, now),
      cooldownLeftSec(lastFunRoomAt, FUN_ROOM_MS, now)
    );
    if (left > 0) return tellWait(player, left);
    lastFunPlayerAt.set(player.id, now);
    lastFunRoomAt = now;
    return false;
  }

  /** Rankings/stats privados: o mesmo jogador não dispara o mesmo tipo em sequência. */
  function blockLookup(player, kind) {
    const now = clock();
    const key = `${player.id}:${kind}`;
    const left = cooldownLeftSec(lastLookupAt.get(key), LOOKUP_MS, now);
    if (left > 0) return tellWait(player, left);
    lastLookupAt.set(key, now);
    return false;
  }

  async function loadTitleForPlayer(player) {
    const adminLevel = ctx.admins.get(player.id)?.level || 0;
    const auth = resolveAuth(player);
    if (!auth) {
      const title = resolveTitle({}, null, adminLevel);
      return wearJoke(player, title) || title;
    }
    const stats = (await getPlayerStats(auth)) || {};
    const title = resolveTitle(stats, stats.selected_title, adminLevel);
    return wearJoke(player, title) || title;
  }

  function formatPlayerChat(player, message) {
    const title = displayTitle(player, ensureTitlesMap().get(player.id));
    const live = room.getPlayerList().find((p) => p.id === player.id);
    const team = live?.team ?? player.team;
    return {
      line: `${formatChatPrefix(title)}${player.name}: ${formatChatBody(title, message)}`,
      color: chatColor(title, team),
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

    const live = room.getPlayerList().find((p) => p.id === player.id);
    const color = chatColor(displayTitle(player, ctx.titles.get(player.id)), live?.team ?? player.team);
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

  /** `t mensagem` — só o time. `t` sozinho (sem espaço) é chat normal. */
  function handleTeamChat(player, message) {
    const raw = String(message || "").replace(/^\s+/, "");
    if (!raw.startsWith("t ") && !raw.startsWith("t\t")) return false;
    const body = raw.slice(1).trim();
    if (peekMute(player)) {
      room.sendAnnouncement(
        "Você está mutado — chat de time também está bloqueado. Comandos com ! seguem liberados.",
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
    if (!body) {
      room.sendAnnouncement("Uso: t <mensagem>", player.id, 0xe74c3c, "normal", 1);
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

  /** `%mensagem` — só quem tem cargo de admin. */
  function handleStaffChat(player, message) {
    const raw = String(message || "").trim();
    if (!raw.startsWith("%")) return false;
    const body = raw.slice(1).trim();
    const admin = ctx.admins.get(player.id);
    if (!admin) {
      room.sendAnnouncement("Chat com % é só para staff.", player.id, 0xe74c3c, "normal", 1);
      return true;
    }
    if (peekMute(player)) {
      room.sendAnnouncement(
        "Você está mutado — chat de staff também está bloqueado.",
        player.id,
        0xe67e22,
        "bold",
        2
      );
      return true;
    }
    if (!body) {
      room.sendAnnouncement("Uso: % <mensagem>", player.id, 0xe74c3c, "normal", 1);
      return true;
    }
    const line = `👑 [ADM] ${player.name}: ${body}`;
    const online = new Set(room.getPlayerList().map((p) => p.id));
    for (const adminId of ctx.admins.keys()) {
      if (!online.has(adminId)) continue;
      room.sendAnnouncement(line, adminId, 0x9b59b6, "bold", 1);
    }
    ctx.chatLog?.push({ nick: player.name, text: body, kind: "staff" });
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
          isAfk,
          canAfk: canVoluntaryAfk(player, room, ctx),
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
      room.sendAnnouncement(adminHelpText(admin.level), player.id, 0xecf0f1, "small", 1);
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
      if (blockPublicFun(player)) return true;
      const url = config.discordInviteUrl;
      room.sendAnnouncement(`Entre em nosso Discord: ${url}`, null, 0x5865f2, "bold", 1);
      return true;
    }

    if (cmd === "site" || cmd === "haxbook" || cmd === "statsweb") {
      if (blockPublicFun(player)) return true;
      const url = config.siteUrl;
      room.sendAnnouncement(`🌐 Stats, rankings e mais: ${url}`, null, 0x1abc9c, "bold", 1);
      return true;
    }

    if (cmd === "afk") {
      // Sair do AFK sempre pode. Entrar: no 4v4 ao vivo só com gente no spec.
      if (ctx.afk?.isAfk(player.id)) {
        ctx.afk.setAfk(player, false);
        return true;
      }
      if (!canVoluntaryAfk(player, room, ctx)) {
        room.sendAnnouncement(
          "Não pode usar !afk no 4v4 sem gente no spec. Só antes da partida ou se tiver spec pra repor.",
          player.id,
          0xe74c3c,
          "normal",
          1
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
      if (blockLookup(player, "streak")) return true;
      const n = ctx.streak?.get?.() ?? 0;
      room.sendAnnouncement(formatCurrentStreak(n), player.id, 0xf1c40f, "bold", 1);
      return true;
    }

    if (cmd === "topstreak" || cmd === "recordstreak" || cmd === "melhorstreak" || cmd === "maxstreak") {
      if (blockLookup(player, "topstreak")) return true;
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
      if (blockLookup(player, ranking.stat)) return true;
      const fetchTop = ctx.getLeaderboard || getLeaderboard;
      const board = await fetchTop(ranking.stat);
      const text = board?.unavailable
        ? "Rankings indisponíveis no momento."
        : formatTop5(ranking.title, board?.rows);
      room.sendAnnouncement(text, player.id, 0xf1c40f, "bold", 1);
      return true;
    }

    if (cmd === "bet" || cmd === "aposta") {
      if (blockPublicFun(player)) return true;
      const count = ctx.roomStats?.recordBet?.()?.bets ?? 1;
      room.sendAnnouncement(formatBetLine(count), null, 0xe67e22, "bold", 1);
      return true;
    }

    if (cmd === "viado" || cmd === "viados") {
      if (blockPublicFun(player)) return true;
      const count = ctx.roomStats?.recordViado?.()?.viados ?? 1;
      room.sendAnnouncement(formatViadoLine(count), null, 0x9b59b6, "bold", 1);
      return true;
    }

    if (cmd === "provocaradm" || cmd === "provoadm") {
      if ((admin?.level || 0) < 4) {
        room.sendAnnouncement("Só o Chefe pode usar !provocaradm.", player.id, 0xe74c3c, "bold", 2);
        return true;
      }
      const body = args.join(" ").trim();
      if (!body) {
        room.sendAnnouncement("Uso: !provocaradm <texto>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const line = body.startsWith("🎲") ? body : `🎲 ${body}`;
      room.sendAnnouncement(line, null, 0xe67e22, "bold", 1);
      return true;
    }

    if (cmd === "roleta" || cmd === "roletar") {
      return applyRoleta(player, args);
    }

    if (cmd === "provocar" || cmd === "provoca" || cmd === "entregou") {
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
      if (blockPublicFun(player)) return true;
      room.sendAnnouncement(pickTeaseLine(target.name), null, 0xe67e22, "bold", 1);
      return true;
    }

    if (cmd === "elogiar" || cmd === "elogio" || cmd === "craque") {
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
      if (blockPublicFun(player)) return true;
      room.sendAnnouncement(pickPraiseLine(target.name), null, 0xf1c40f, "bold", 1);
      return true;
    }

    if (cmd === "gordo") {
      return applyJokeTitle(player, args, "gordo");
    }

    if (cmd === "aura" || cmd === "ego") {
      return applyJokeTitle(player, args, "aura");
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
      if (blockLookup(player, "stats")) return true;
      const s = (await getPlayerStats(auth)) || emptyPlayerStats();
      const adminLevel = ctx.admins.get(target.id)?.level || 0;
      const title = resolveTitle(s, s.selected_title, adminLevel);
      room.sendAnnouncement(formatStatusCard(target.name, s, title), player.id, title.color, "bold", 1);
      return true;
    }

    if (cmd === "listacargos" || cmd === "todososcargos" || cmd === "cargoslista") {
      if (blockLookup(player, "catalog")) return true;
      room.sendAnnouncement(formatTitleCatalog(), player.id, 0xecf0f1, "small", 1);
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
      wearJoke(player, title);
      const joke = peekJoke(player);
      room.sendAnnouncement(
        joke
          ? `Cargo salvo: ${title.emblem} ${title.name}. No chat ainda vale ${joke.title.emblem} ${joke.title.name}.`
          : `Cargo ativo: ${title.emblem} ${title.name}`,
        player.id,
        (joke?.title || title).color,
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
      let rows = looksConn
        ? await deactivateBan({ conn: key })
        : await deactivateBan({ auth: key });
      if (!rows.length) {
        rows = looksConn
          ? await deactivateBan({ auth: key })
          : await deactivateBan({ conn: key });
      }
      const n = rows.length;
      if (n) {
        const ban = rows[0];
        notifyUnban({
          nick: ban.nick,
          auth: ban.auth || (!looksConn ? key : null),
          conn: ban.conn || (looksConn ? key : null),
          ip: ban.ip,
          reason: ban.reason,
          unbannedBy: player.name,
          source: "!unban",
          count: n,
        }).catch(() => {});
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
      const rows = await deactivateBan({ auth });
      const n = rows.length;
      if (n) {
        const ban = rows[0];
        notifyUnban({
          nick: ban.nick,
          auth: ban.auth || auth,
          conn: ban.conn,
          ip: ban.ip,
          reason: ban.reason,
          unbannedBy: player.name,
          source: "!unbanauth",
          count: n,
        }).catch(() => {});
      }
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
    handleTeamChat,
    handleStaffChat,
    playerHelpText,
    adminHelpText,
    playerHelpLines,
  };
}

module.exports = { createCommandHandler, canVoluntaryAfk };
