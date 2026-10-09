const config = require("../config");
const { findPlayer, parseDurationToMs, formatDuration, connToIp, kickReason, resolveWhisper } = require("../utils");
const { resolvePlayerAuth } = require("../room/playerAuth");
const { isRandomKitArg, parseTeamRef, isColorKit, listColorPage } = require("../room/uniforms");
const { createBan, deactivateBan, listActiveBans } = require("../db/bans");
const { getAdmin, setAdmin, removeAdmin, generateLoginCode, createRoleCode, consumeRoleCode, peekRoleCode, searchPlayers } = require("../db/players");
const { notifyBan, notifyUnban, notifyStaffAudit, notifyCallAdm, notifyMute, notifyUnmute } = require("../discord/webhook");
const { createMute, unmute, findActiveMute, listActiveMutes } = require("../db/mutes");
const {
  getPlayerStats,
  setSelectedTitle,
  grantGiftedTitle,
  revokeGiftedTitle,
  transferPlayerStats,
  formatStatusCard,
  emptyPlayerStats,
  getLeaderboard,
  formatTop5,
  resetPlayerCareer,
} = require("../db/stats");
const { hallLines } = require("../db/hall");
const { formatCurrentStreak, formatBestStreak, formatTopStreaks } = require("../room/streak");
const { formatBetLine, formatViadoLine, pickTeaseLine, pickPraiseLine, resolveTeaseTarget } = require("../room/bet");
const { normalizeLinkCode, linkHaxballAuth } = require("../haxbook/authLink");
const { fetchPlayerSiteStatus } = require("../haxbook/playerStatus");
const { rankedChatHead } = require("../room/rankedWindows");
const {
  redeemStoreCode,
  liveStoreEffects,
  parseStoreColor,
  formatStoreTemplate,
  JOIN_HIGHLIGHT_MS,
  pickVipJoinPhrase,
  normalizeStoreCode,
  roomCodeFromStatsUrl,
} = require("../haxbook/store");
const {
  TITLES,
  STAFF_TITLES,
  listUnlocked,
  listUnlockedGift,
  isUnlocked,
  resolveTitle,
  getTitleById,
  reqLabel,
  formatTitleCatalog,
  chatColor,
  formatChatPrefix,
  formatChatHead,
  formatChatBody,
  resolveSiteTitle,
  resolveEloTitle,
  JOKE_TITLES,
  STREAK_TITLE,
  wearsStreakTitle,
  hasGiftedTitle,
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
  mvp: { stat: "mvps", title: "⭐ Top 5 MVPs" },
  mvps: { stat: "mvps", title: "⭐ Top 5 MVPs" },
  cs: { stat: "cs", title: "🧤 Top 5 clean sheets" },
  cleansheet: { stat: "cs", title: "🧤 Top 5 clean sheets" },
  cleansheets: { stat: "cs", title: "🧤 Top 5 clean sheets" },
  jogos: { stat: "games", title: "🎮 Top 5 jogos" },
  jogo: { stat: "games", title: "🎮 Top 5 jogos" },
  games: { stat: "games", title: "🎮 Top 5 jogos" },
  vitorias: { stat: "wins", title: "🏆 Top 5 vitórias" },
  vitoria: { stat: "wins", title: "🏆 Top 5 vitórias" },
  wins: { stat: "wins", title: "🏆 Top 5 vitórias" },
  hattricks: { stat: "hat_tricks", title: "⚽⚽⚽ Top 5 hat-tricks" },
  hattrick: { stat: "hat_tricks", title: "⚽⚽⚽ Top 5 hat-tricks" },
  ht: { stat: "hat_tricks", title: "⚽⚽⚽ Top 5 hat-tricks" },
  wom: { stat: "woms", title: "💩 Top 5 WoM" },
  woms: { stat: "woms", title: "💩 Top 5 WoM" },
  worstofmatch: { stat: "woms", title: "💩 Top 5 WoM" },
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
    "— Sala —",
    "!bb · !discord · !site · !video · !ids · !calladm · !gif",
  ];
  if (isAfk) lines.push("!voltar — sair do AFK");
  else if (canAfk) lines.push("!afk — ficar AFK / voltar");
  lines.push("!afks — quem está AFK");
  lines.push("!vincular CÓDIGO — sincronizar conta Haxbook");
  lines.push("!ativar CÓDIGO — cosmético da loja (haxbook.com.br/loja)");
  lines.push("@nick msg — mensagem privada");
  if (onField) lines.push("t <msg> — chat do time");
  if (isAdmin) lines.push("% <msg> — chat só de staff");
  lines.push(
    "— Categorias —",
    "!status / !stats — vitórias, gols, hat-tricks, CS, MVP, WR",
    "!hall — hall da fama",
    "!cargos · !listacargos · !cargo — emblemas",
    "!unis — uniformes · !cores1 · !cores2",
    "!zoeira — zoeiras da sala",
    "!ranking — tops e streak",
    "!calladm <motivo> — chamar staff no Discord",
    "!gif — Chefe de graça, ou vale da loja nesta sala"
  );
  if (canChangeUni) {
    lines.push("!uni <kit> — uniforme do time (capitão/admin)");
  }
  if (canChoose) lines.push("Pick: número | top | random | bottom");
  if (isAdmin) lines.push("!ajudaadm — comandos de admin");
  return lines;
}

function zoeiraHelpLines() {
  return [
    "— Zoeira —",
    "!bet — aposta na Haxbooket",
    "!viado — viraram viado (contador)",
    "!provocar [#id|nick] — zoação de quem entregou",
    "!elogiar [#id|nick] — elogio de craque",
    "!roleta <#id|nick> — 50/50: mute 3min em você ou no alvo (15min na sala)",
    "!gordo [#id|nick] — cargo 🍔 Gordo por 5min",
    "!aura / !ego [#id|nick] — cargo 🗿 Aura por 5min",
  ];
}

function rankingHelpLines() {
  return [
    "— Ranking —",
    "!gols !assists !vitorias !hattricks — top 5",
    "!golcontra !cs !jogos !mvp !wom — top 5",
    "!streak — streak atual",
    "!topstreak — 5 maiores da sala",
  ];
}

function playerHelpText(opts) {
  return playerHelpLines(opts).join("\n");
}

function zoeiraHelpText() {
  return zoeiraHelpLines().join("\n");
}

function rankingHelpText() {
  return rankingHelpLines().join("\n");
}

function parseCallAdmReason(cmd, args) {
  const first = String(args[0] || "").toLowerCase();
  if (cmd === "calladm" || cmd === "chamaadm" || cmd === "calladmin") {
    return args.join(" ").trim();
  }
  if (cmd === "call" && ["adm", "admin", "staff"].includes(first)) {
    return args.slice(1).join(" ").trim();
  }
  return null;
}

/**
 * Quem está em campo no 4v4 ao vivo não usa !afk — só cai AFK se ficar ocioso.
 * Spec, treino, warmup e lobby/choose: pode.
 */
function canVoluntaryAfk(player, room, ctx) {
  if (!player || player.team === 0) return true;
  if (!ctx?.match?.isCompetitive?.()) return true;
  const scores = typeof room?.getScores === "function" ? room.getScores() : null;
  if (!scores) return true;
  return false;
}

const MOD_LIST_PAGE_SIZE = 6;
const MOD_ADMIN_CMDS = new Set([
  "adm",
  "admin",
  "ban",
  "banlist",
  "unban",
  "banauth",
  "unbanauth",
  "mute",
  "mutelist",
  "unmute",
  "verstats",
  "buscarplayer",
  "buscarjogador",
  "findplayer",
]);

function parseModListPage(args) {
  const n = Number(String(args[0] || "").trim());
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function formatNickAuthList({ label, emoji, result, nextCmd }) {
  if (result.unavailable) return "Lista indisponível (banco fora).";
  if (!result.total) return `Nenhum ${label} ativo.`;
  const header = `${emoji} ${label} ${result.page}/${result.pages} (${result.total})`;
  const lines = result.rows.map((row) => {
    const nick = row.nick || "sem nick";
    const auth = row.auth || row.conn || "—";
    return `${nick} · ${auth}`;
  });
  const parts = [header, ...lines];
  if (result.page < result.pages) parts.push(`${nextCmd} ${result.page + 1}`);
  return parts.join("\n");
}

function formatPlayerSearch(result, query) {
  if (result?.unavailable) return "Busca indisponível (banco fora).";
  const rows = result?.rows || [];
  if (!rows.length) return `Nenhum jogador encontrado para "${query}".`;
  return [
    `🔎 Jogadores encontrados (${rows.length}):`,
    ...rows.map((row, index) => {
      const nick = row.nick || "sem nick";
      const joins = Number(row.join_count) || 0;
      return `${index + 1}. ${nick} · ${row.auth} · ${joins} entrada(s)`;
    }),
  ].join("\n");
}

function adminHelpText(level = 0) {
  const lines = [
    "— Admin —",
    "!ajudaadm — este menu",
    "!adm — liga ou tira a estrela amarela",
    "— Ban —",
    "!ban <#id|nick> [tempo] [motivo] — 30m, 2h, 1d, perm",
    "!banauth <auth> [tempo] [motivo]",
    "!banlist [pág] · !unban <auth|conn> · !unbanauth <auth>",
    "— Mute —",
    "!mute <#id|nick> <tempo> [motivo]",
    "!mutelist [pág] · !unmute <#id|nick|auth>",
    "— Uni / Stats —",
    "!uni red|blue <kit|random> · !uni random · !uni reset",
    "!verstats <#id|nick>",
    "% <msg> — chat de staff · staff vê os PVs",
  ];
  if ((level || 0) >= 3) {
    lines.push(
      "— Staff sênior —",
      "!gerlogin <1-3> — senha de cargo de uso único",
      "!login <senha> — ativa o cargo",
      "!revoke <#id|nick|auth> — tira o cargo de staff",
      "!buscarplayer <auth|nickname> — acha auth no histórico",
      "!moverstats <authAlvo> <authAntiga> — soma stats da conta antiga na atual"
    );
  }
  if ((level || 0) >= 4) {
    lines.push(
      "— Chefe —",
      "!parca <#id|nick> — dá 🐋 Parça do Baleia (fixo)",
      "!tirarparca <#id|nick> — remove o cargo",
      "!provocaradm <texto> — provoca com texto livre",
      "!gif — marca 15s de replay; vai no Discord no apito"
    );
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
  /** @type {Map<number, number>} */
  const lastCallAdmAt = new Map();
  /** @type {Map<string, number>} */
  const lastLookupAt = new Map();
  let lastFunRoomAt = 0;
  let lastRoletaAt = 0;
  let lastBaleioAt = 0;
  const BALEIO_TRIGGER = "😎👍";
  const BALEIO_LINE = "BaleioBOT: 😎👍";
  const BALEIO_COLOR = 0xffffff;
  const BALEIO_CD_MS = config.baleioReactMs || 10 * 60 * 1000;
  const FUN_PLAYER_MS = config.cmdPublicPlayerMs || 25000;
  const CALL_ADM_MS = config.callAdmCooldownMs || 3 * 60 * 1000;
  const FUN_ROOM_MS = config.cmdPublicRoomMs || 15000;
  const LOOKUP_MS = config.cmdLookupPlayerMs || 10000;
  const JOKE_CD_MS = config.tempTitleCooldownMs || 15 * 60 * 1000;
  const JOKE_MS = config.tempTitleMs || 5 * 60 * 1000;
  const ROLETA_MS = config.roletaMuteMs || 3 * 60 * 1000;
  const ROLETA_CD_MS = config.roletaCooldownMs || 15 * 60 * 1000;
  /** @type {Map<string, { kind: string, title: object, endsAt: number, previous: object|null }>} */
  const jokeTitles = new Map();
  /** @type {Map<string, number>} kind → last cast (cooldown da sala, não por jogador) */
  const lastJokeCastAt = new Map();

  function resolveAuth(player) {
    return resolvePlayerAuth(player, ctx.auths, room.getPlayerList());
  }

  function ensureSiteStatusMap() {
    if (!ctx.siteStatus) ctx.siteStatus = new Map();
    return ctx.siteStatus;
  }

  function siteTitleFor(player) {
    const auth = resolveAuth(player);
    if (!auth) return null;
    return resolveSiteTitle(ensureSiteStatusMap().get(auth));
  }

  function eloTitleFor(player) {
    const auth = resolveAuth(player);
    if (!auth) return null;
    return resolveEloTitle(ensureSiteStatusMap().get(auth));
  }

  function storeEffectsFor(player, now = clock()) {
    const auth = resolveAuth(player);
    if (!auth) return null;
    return liveStoreEffects(ensureSiteStatusMap().get(auth)?.store, now);
  }

  function playerHasGifCredit(player) {
    const bound = String(storeEffectsFor(player)?.gifRoom || "").trim().toLowerCase();
    if (!bound) return false;
    return bound === roomCodeFromStatsUrl(config.haxbookStatsUrl).toLowerCase();
  }

  function applyStoreEffects(auth, store) {
    if (!auth) return;
    const map = ensureSiteStatusMap();
    const current = map.get(auth) || { vip: false, booster: false, elo: null, rating: null, store: null };
    map.set(auth, { ...current, store: store || null });
  }

  const joinHighlightAt = new Map();

  function announceStoreJoin(player, opts = {}) {
    const auth = resolveAuth(player);
    if (!auth) return false;
    const now = clock();
    const last = joinHighlightAt.get(auth) || 0;
    if (!opts.force && now - last < JOIN_HIGHLIGHT_MS) return false;
    const row = ensureSiteStatusMap().get(auth);
    const store = liveStoreEffects(row?.store, now);
    let text = null;
    let color = 0xf1c40f;
    if (store?.joinTemplate) {
      text = formatStoreTemplate(store.joinTemplate, player.name);
      const parsed = parseStoreColor(store.chatColor);
      if (Number.isFinite(parsed)) color = parsed;
    } else if (row?.vip || row?.booster) {
      text = pickVipJoinPhrase(player.name);
      if (!row.vip) color = 0xc39bd3;
    }
    if (!text) return false;
    joinHighlightAt.set(auth, now);
    room.sendAnnouncement(text, null, color, "bold", 1);
    return true;
  }

  async function syncSiteStatus(players) {
    const auths = [...new Set((players || []).map((p) => resolveAuth(p)).filter(Boolean))];
    if (!auths.length) return;
    if (!config.haxbookStatsUrl || !config.haxbookApiKey) {
      console.warn("[site-status] sem HAXBOOK_STATS_URL ou HAXBOOK_API_KEY");
      return;
    }
    const result = await fetchPlayerSiteStatus({
      statsUrl: config.haxbookStatsUrl,
      apiKey: config.haxbookApiKey,
      auths,
    });
    if (!result.ok) {
      console.warn(
        "[site-status]",
        result.status ? `HTTP ${result.status}` : result.message || "falhou"
      );
      return;
    }
    const map = ensureSiteStatusMap();
    for (const auth of auths) {
      const row = result.players[auth] || { vip: false, booster: false, elo: null, rating: null };
      const rating = Number(row.rating);
      map.set(auth, {
        vip: !!row.vip,
        booster: !!row.booster,
        elo: row.elo || null,
        rating: Number.isFinite(rating) && rating >= 1 ? rating : null,
        store: row.store || null,
        linked: row.linked === true,
        rankTier: row.rankTier || null,
      });
    }
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
      `🎰 Roleta: ${player.name} apontou pra ${target.name}. Caiu em ${loser.name} — mudo 3min.`,
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
    lastCallAdmAt.delete(playerId);
    ctx.gifClip?.forget?.(playerId);
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

  async function showPlayerStatusCard(viewer, target) {
    const auth = resolvePlayerAuth(target, ctx.auths, room.getPlayerList());
    if (!auth) {
      room.sendAnnouncement(
        target.id === viewer.id ? noAuthMsg : `${target.name} está sem auth (guest).`,
        viewer.id,
        0xe74c3c,
        "normal",
        1
      );
      return true;
    }
    if (blockLookup(viewer, "stats")) return true;
    const s = (await getPlayerStats(auth)) || emptyPlayerStats();
    const adminLevel = ctx.admins.get(target.id)?.level || 0;
    const title = resolveTitle(s, s.selected_title, adminLevel);
    room.sendAnnouncement(formatStatusCard(target.name, s, title), viewer.id, title.color, "bold", 1);
    return true;
  }

  async function refreshEnteringSpec(player) {
    if (!player?.id) return;
    await loadTitleForPlayer(player);
    await syncSiteStatus([player]);
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

  function chatSpeaker(player, title) {
    const live = room.getPlayerList().find((p) => p.id === player.id);
    const name = live?.name ?? player.name;
    let head = "";
    if (typeof ctx.rankedLive === "function" && ctx.rankedLive()) {
      const auth = resolveAuth(player);
      const row = auth ? ensureSiteStatusMap().get(auth) : null;
      head = rankedChatHead({
        linked: row?.linked === true,
        rankTier: row?.rankTier,
        siteEmblem: row?.linked === true ? siteTitleFor(player)?.emblem : "",
        storeEmoji: storeEffectsFor(player)?.emoji,
      });
    } else {
      head = formatChatHead(title, siteTitleFor(player), eloTitleFor(player), storeEffectsFor(player)?.emoji);
    }
    if (ctx.afk?.isAfk?.(player.id)) head += "[AFK]";
    return head ? `${head} ${name}` : name;
  }

  function chatNick(player) {
    const live = room.getPlayerList().find((p) => p.id === player.id);
    const name = live?.name ?? player.name;
    return ctx.afk?.isAfk?.(player.id) ? `[AFK] ${name}` : name;
  }

  function isBaleioTrigger(message) {
    return String(message || "").replace(/\s+/g, "") === BALEIO_TRIGGER;
  }

  /** Responde 😎👍 como player. Cooldown da sala; em silêncio se ainda não deu. */
  function maybeBaleioChat(message) {
    if (!isBaleioTrigger(message)) return null;
    const now = clock();
    if (cooldownLeftSec(lastBaleioAt, BALEIO_CD_MS, now) > 0) return null;
    lastBaleioAt = now;
    return { line: BALEIO_LINE, color: BALEIO_COLOR };
  }

  function formatPlayerChat(player, message) {
    const title = displayTitle(player, ensureTitlesMap().get(player.id));
    const live = room.getPlayerList().find((p) => p.id === player.id);
    const team = live?.team ?? player.team;
    return {
      line: `${chatSpeaker(player, title)}: ${formatChatBody(title, message)}`,
      color: chatColor(
        title,
        team,
        siteTitleFor(player),
        eloTitleFor(player),
        parseStoreColor(storeEffectsFor(player)?.chatColor)
      ),
    };
  }

  /** @returns {boolean} true se consumiu a mensagem (era PV) */
  function handleWhisper(player, message) {
    const parsed = resolveWhisper(room, message);
    if (!parsed) return false;

    if (!parsed.body) {
      room.sendAnnouncement(
        "Uso: @nick mensagem  ·  nick com espaço: @nome completo msg",
        player.id,
        0xe74c3c,
        "normal",
        1
      );
      return true;
    }

    const target = parsed.target;
    if (!target) {
      room.sendAnnouncement(
        "Jogador não encontrado para o PV. Confira o nick ou use !ids.",
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

    const color = 0x5dade2;
    room.sendAnnouncement(
      `📩 PV de @${player.name}: ${parsed.body}`,
      target.id,
      color,
      "normal",
      1
    );
    room.sendAnnouncement(
      `📩 PV para @${target.name}: ${parsed.body}`,
      player.id,
      color,
      "normal",
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
      room.sendAnnouncement(spy, adminId, color, "normal", 1);
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
        room.sendAnnouncement(`${emoji} [TEAM] ${chatNick(player)}: ${body}`, p.id, color, "normal", 1);
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
    const line = `👑 [ADM] ${chatNick(player)}: ${body}`;
    const online = new Set(room.getPlayerList().map((p) => p.id));
    for (const adminId of ctx.admins.keys()) {
      if (!online.has(adminId)) continue;
      room.sendAnnouncement(line, adminId, 0x9b59b6, "normal", 1);
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

    if (MOD_ADMIN_CMDS.has(cmd) && !admin) {
      room.sendAnnouncement("Sem permissão.", player.id, 0xe74c3c, "bold", 2);
      return true;
    }

    if (cmd === "gif" || cmd === "clip") {
      const auth = resolvePlayerAuth(player, ctx.auths, room.getPlayerList());
      const staffLevel = admin?.level || 0;
      const paidCredit = staffLevel < 4 && playerHasGifCredit(player);
      const result =
        ctx.gifClip?.request?.(player, { auth, staffLevel, paidCredit }) || {
          ok: false,
          reason: "not-live",
        };
      if (result.reason === "staff-only") {
        room.sendAnnouncement("!gif só o Chefe (nv.4) por enquanto.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      if (result.reason === "not-live") {
        room.sendAnnouncement(
          "!gif só na partida ou nos 20s depois do apito (não no treino).",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      if (result.reason === "empty") {
        room.sendAnnouncement("Espera a jogada uns 2s pra ter clip.", player.id, 0xf1c40f, "normal", 1);
        return true;
      }
      if (result.reason === "player-cd" || result.reason === "room-cd") {
        room.sendAnnouncement(
          `Espere ${formatJokeWait(result.wait || 1)} pra pedir GIF de novo.`,
          player.id,
          0xf1c40f,
          "normal",
          1
        );
        return true;
      }
      if (result.reason === "match-full") {
        room.sendAnnouncement("Já tem 3 GIFs nessa partida.", player.id, 0xf1c40f, "normal", 1);
        return true;
      }
      if (result.queued) {
        return true;
      }
      return true;
    }

    const callAdmReason = parseCallAdmReason(cmd, args);
    if (callAdmReason !== null) {
      if (callAdmReason.length < 3) {
        room.sendAnnouncement(
          "Uso: !calladm <motivo> — explique o que aconteceu.",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      const now = clock();
      const left = cooldownLeftSec(lastCallAdmAt.get(player.id), CALL_ADM_MS, now);
      if (left > 0) {
        room.sendAnnouncement(
          `Espere ${formatJokeWait(left)} pra chamar ADM de novo.`,
          player.id,
          0xf1c40f,
          "normal",
          1
        );
        return true;
      }
      lastCallAdmAt.set(player.id, now);
      const auth = resolvePlayerAuth(player, ctx.auths, room.getPlayerList());
      const conn = player.conn || ctx.conns?.get(player.id) || null;
      const online = room.getPlayerList();
      const staffOnline = [...(ctx.admins?.keys?.() || [])].filter((id) =>
        online.some((p) => p.id === id)
      ).length;
      const sent = await notifyCallAdm({
        roomLabel: config.haxbookRoomName || config.roomName,
        nick: player.name,
        playerId: player.id,
        auth,
        conn,
        ip: connToIp(conn),
        reason: callAdmReason,
        staffOnline,
      });
      if (!sent && !process.env.NODE_TEST_CONTEXT) {
        lastCallAdmAt.delete(player.id);
        room.sendAnnouncement("Não deu pra chamar o ADM agora. Tenta de novo.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      room.sendAnnouncement(
        "🔔 ADM chamado no Discord. Explique o caso quando alguém entrar.",
        player.id,
        0x2ecc71,
        "bold",
        1
      );
      for (const adminId of ctx.admins?.keys?.() || []) {
        if (!online.some((p) => p.id === adminId) || adminId === player.id) continue;
        room.sendAnnouncement(
          `🔔 ${player.name} chamou ADM: ${callAdmReason}`,
          adminId,
          0xe67e22,
          "bold",
          2
        );
      }
      return true;
    }

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
        "normal",
        1
      );
      return true;
    }

    if (cmd === "zoeira" || cmd === "zoeiras" || cmd === "zoera" || cmd === "zueira") {
      room.sendAnnouncement(zoeiraHelpText(), player.id, 0xecf0f1, "normal", 1);
      return true;
    }

    if (cmd === "ranking" || cmd === "rankings" || cmd === "tops") {
      room.sendAnnouncement(rankingHelpText(), player.id, 0xecf0f1, "normal", 1);
      return true;
    }

    if (cmd === "ajudaadm" || cmd === "helpadm" || cmd === "comandosadm") {
      if (!admin) return true;
      room.sendAnnouncement(adminHelpText(admin.level), player.id, 0xecf0f1, "normal", 1);
      return true;
    }

    if (cmd === "adm" || cmd === "admin") {
      toggleUiAdminStar(player);
      return true;
    }

    if (cmd === "bb") {
      try {
        ctx.selfLeaves?.add(player.id);
        room.kickPlayer(player.id, "Até mais!", false);
      } catch {
        ctx.selfLeaves?.delete(player.id);
      }
      return true;
    }

    if (cmd === "discord" || cmd === "dc") {
      if (blockPublicFun(player)) return true;
      const url = config.discordInviteUrl;
      room.sendAnnouncement(`Entre em nosso Discord: ${url}`, null, 0x5865f2, "bold", 1);
      return true;
    }

    if (cmd === "video" || cmd === "clips") {
      if (blockPublicFun(player)) return true;
      room.sendAnnouncement(
        `🎬 Veja os melhores clips do mês: ${config.clipsVideoUrl}`,
        null,
        0xe74c3c,
        "bold",
        1
      );
      return true;
    }

    if (cmd === "site" || cmd === "haxbook" || cmd === "statsweb") {
      if (blockPublicFun(player)) return true;
      const url = config.siteUrl;
      room.sendAnnouncement(`🌐 Stats, rankings e mais: ${url}`, null, 0x1abc9c, "bold", 1);
      return true;
    }

    if (cmd === "ativar" || cmd === "activate" || cmd === "redeem") {
      const auth = resolveAuth(player);
      if (!auth) {
        room.sendAnnouncement(noAuthMsg, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const code = normalizeStoreCode(args.join(""));
      if (!code) {
        room.sendAnnouncement("Uso: !ativar CÓDIGO — compre em haxbook.com.br/loja", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      if (blockLookup(player, "ativar")) return true;
      const redeem = ctx.redeemStoreCode || ((payload) => redeemStoreCode({
        statsUrl: config.haxbookStatsUrl,
        apiKey: config.haxbookApiKey,
        fetchImpl: ctx.fetch,
        ...payload,
      }));
      const result = await redeem({ code, auth });
      if (!result?.ok) {
        room.sendAnnouncement(result?.message || "Não deu para ativar esse código.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      applyStoreEffects(auth, result.store);
      if (result.roomReset) {
        const wiped = await resetPlayerCareer(auth);
        room.sendAnnouncement(result.message || "Carreira desta sala zerada.", player.id, 0x2ecc71, "bold", 1);
        if (!wiped) {
          room.sendAnnouncement("Não consegui zerar a carreira desta sala. Chame um admin.", player.id, 0xe74c3c, "normal", 1);
        }
        return true;
      }
      room.sendAnnouncement(result.message || "Ativo por 1 dia.", player.id, 0x2ecc71, "bold", 1);
      announceStoreJoin(player, { force: true });
      return true;
    }

    if (cmd === "vincular" || cmd === "sincronizar" || cmd === "link") {
      const auth = resolveAuth(player);
      if (!auth) {
        room.sendAnnouncement(noAuthMsg, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const code = normalizeLinkCode(args.join(""));
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
        room.sendAnnouncement("Uso: !vincular CÓDIGO — gere o código no seu perfil Haxbook.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      if (blockLookup(player, "vincular")) return true;
      const submit = ctx.linkHaxballAuth || ((payload) => linkHaxballAuth({
        ...payload,
        statsUrl: config.haxbookStatsUrl,
        apiKey: config.haxbookApiKey,
      }));
      const result = await submit({ code, auth, nickname: player.name });
      let message = "Não foi possível sincronizar agora. Tente novamente.";
      let color = 0xe74c3c;
      if (result?.ok) {
        message = "Auth sincronizada com sua conta Haxbook.";
        color = 0x2ecc71;
      } else if (result?.code === "HAXBALL_AUTH_ALREADY_LINKED") {
        message = "Esta auth já pertence a outra conta. Procure o suporte no site.";
      } else if ([
        "INVALID_CHALLENGE",
        "CHALLENGE_EXPIRED",
        "CHALLENGE_ALREADY_USED",
        "HAXBALL_LINK_CODE_INVALID",
        "HAXBALL_LINK_CODE_EXPIRED",
        "HAXBALL_LINK_CODE_ALREADY_USED",
      ].includes(result?.code)) {
        message = "Código inválido, expirado ou já utilizado. Gere outro no site.";
      } else if (result?.code === "CONFIG_UNAVAILABLE") {
        message = "Sincronização indisponível nesta sala.";
      }
      room.sendAnnouncement(message, player.id, color, "bold", 2);
      return true;
    }

    if (cmd === "afk") {
      if (ctx.afk?.isAfk(player.id)) {
        ctx.afk.setAfk(player, false);
        return true;
      }
      if (!canVoluntaryAfk(player, room, ctx)) {
        room.sendAnnouncement(
          "Não pode usar !afk no 4v4. Só sai do campo se ficar ocioso.",
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
        `Times/comunidades: ${ctx.uniforms?.listText() || "-"}\nCores: !cores1 · !cores2\nAtual: ${ctx.uniforms?.describe() || "-"}\nUse !uni <kit>, !<cor> ou !uni random (capitão ou admin)`,
        player.id,
        0xecf0f1,
        "small",
        1
      );
      return true;
    }

    if (cmd === "cores1" || cmd === "cores2") {
      const page = cmd === "cores1" ? 1 : 2;
      const text = listColorPage(page);
      if (!text) {
        room.sendAnnouncement("Página de cores inválida.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      room.sendAnnouncement(
        `Cores ${page}/2: ${text}\nUse !<cor> ou !uni <cor> (capitão ou admin)`,
        player.id,
        0xecf0f1,
        "small",
        1
      );
      return true;
    }

    if (ctx.uniforms && isColorKit(cmd)) {
      const result = ctx.uniforms.change({
        player,
        isAdmin: !!admin,
        kitId: cmd,
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
      const board =
        ctx.streak?.getTopStreaks?.() ??
        ctx.roomStats?.snapshot?.()?.bestStreaks ??
        [];
      const text = board.length
        ? formatTopStreaks(board)
        : formatBestStreak(
            ctx.streak?.getBest?.() ?? ctx.roomStats?.snapshot?.()?.bestStreak ?? 0,
            ctx.streak?.get?.() ?? 0,
            ctx.streak?.getBestHolders?.() ?? ctx.roomStats?.snapshot?.()?.bestStreakHolders ?? []
          );
      room.sendAnnouncement(text, player.id, 0xf1c40f, "bold", 1);
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

    if (cmd === "parca" || cmd === "parcado" || cmd === "parcadobaleia") {
      if ((admin?.level || 0) < 4) {
        room.sendAnnouncement("Só o Chefe pode dar o cargo Parça do Baleia.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const target = findPlayer(room, args.join(" "));
      if (!target) {
        room.sendAnnouncement("Uso: !parca <#id|nick>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const auth = resolveAuth(target);
      if (!auth) {
        room.sendAnnouncement(noAuthMsg, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const stats = (await getPlayerStats(auth)) || {};
      if (hasGiftedTitle(stats, "parca")) {
        room.sendAnnouncement(`${target.name} já tem 🐋 Parça do Baleia.`, player.id, 0xf1c40f, "normal", 1);
        return true;
      }
      const ok = await grantGiftedTitle(auth, "parca");
      if (!ok) {
        room.sendAnnouncement("Não deu para salvar o cargo.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      await loadTitleForPlayer(target);
      room.sendAnnouncement(
        `${target.name} ganhou 🐋 Parça do Baleia. Use !cargo parca se quiser usar.`,
        target.id,
        0x5dade2,
        "normal",
        1
      );
      if (target.id !== player.id) {
        room.sendAnnouncement(
          `🐋 Parça do Baleia concedido a ${target.name}. Não equipa sozinho — a pessoa usa !cargo parca.`,
          player.id,
          0x5dade2,
          "normal",
          1
        );
      }
      return true;
    }

    if (cmd === "tirarparca" || cmd === "removerparca") {
      if ((admin?.level || 0) < 4) {
        room.sendAnnouncement("Só o Chefe pode tirar o cargo Parça do Baleia.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const target = findPlayer(room, args.join(" "));
      if (!target) {
        room.sendAnnouncement("Uso: !tirarparca <#id|nick>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const auth = resolveAuth(target);
      if (!auth) {
        room.sendAnnouncement(noAuthMsg, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const stats = (await getPlayerStats(auth)) || {};
      if (!hasGiftedTitle(stats, "parca")) {
        room.sendAnnouncement(`${target.name} não tem Parça do Baleia.`, player.id, 0xf1c40f, "normal", 1);
        return true;
      }
      const ok = await revokeGiftedTitle(auth, "parca");
      if (!ok) {
        room.sendAnnouncement("Não deu para remover o cargo.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      if (stats.selected_title === "parca") {
        await setSelectedTitle(auth, null);
      }
      await loadTitleForPlayer(target);
      room.sendAnnouncement(
        `🐋 Parça do Baleia removido de ${target.name}.`,
        player.id,
        0x5dade2,
        "normal",
        1
      );
      if (target.id !== player.id) {
        room.sendAnnouncement("Seu cargo 🐋 Parça do Baleia foi removido.", target.id, 0x5dade2, "normal", 1);
      }
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

    if (cmd === "hall" || cmd === "halldafama" || cmd === "mural") {
      if (blockLookup(player, "hall")) return true;
      const lines = await hallLines();
      for (const line of lines) {
        room.sendAnnouncement(line, player.id, 0xf1c40f, "bold", 1);
      }
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
      return showPlayerStatusCard(player, target);
    }

    if (cmd === "verstats") {
      if (!args.length) {
        room.sendAnnouncement("Uso: !verstats <#id|nick> — veja !ids", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const target = findPlayer(room, args.join(" "));
      if (!target) {
        room.sendAnnouncement(
          "Jogador não encontrado. Uso: !verstats <#id|nick>",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      return showPlayerStatusCard(player, target);
    }

    if (cmd === "listacargos" || cmd === "todososcargos" || cmd === "cargoslista") {
      if (blockLookup(player, "catalog")) return true;
      room.sendAnnouncement(formatTitleCatalog(), player.id, 0xecf0f1, "normal", 1);
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
      const total = TITLES.length + STAFF_TITLES.filter((t) => adminLevel >= t.level).length + listUnlockedGift(stats).length;
      room.sendAnnouncement(
        `Seus cargos (${unlocked.length}/${total}):\n${lines.join("\n")}\nUse !cargo <id|n> — só um ativo`,
        player.id,
        0xecf0f1,
        "normal",
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

    if (cmd === "banlist") {
      const result = await listActiveBans({
        page: parseModListPage(args),
        pageSize: MOD_LIST_PAGE_SIZE,
      });
      room.sendAnnouncement(
        formatNickAuthList({
          label: "ban",
          emoji: "🚫",
          result,
          nextCmd: "!banlist",
        }),
        player.id,
        0xecf0f1,
        "small",
        1
      );
      return true;
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

    if (cmd === "mutelist") {
      const result = await listActiveMutes({
        page: parseModListPage(args),
        pageSize: MOD_LIST_PAGE_SIZE,
      });
      room.sendAnnouncement(
        formatNickAuthList({
          label: "mute",
          emoji: "🔇",
          result,
          nextCmd: "!mutelist",
        }),
        player.id,
        0xecf0f1,
        "small",
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
      notifyMute({
        nick: target.name,
        auth: resolveAuth(target),
        reason,
        duration: formatDuration(ms),
        mutedBy: player.name,
        source: "!mute",
      });
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
      notifyUnmute({
        nick: target?.name,
        auth,
        unmutedBy: player.name,
        source: "!unmute",
      });
      room.sendAnnouncement(
        target ? `${target.name} não está mais mutado.` : "Unmute aplicado.",
        target ? null : player.id,
        0x2ecc71,
        "normal",
        1
      );
      return true;
    }

    if (cmd === "gerlogin" || cmd === "criarlogin" || cmd === "novologin") {
      if ((admin?.level || 0) < 3) {
        room.sendAnnouncement("Só Gerente e Chefe podem gerar login.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const grantLevel = Math.floor(Number(args[0]));
      if (!Number.isInteger(grantLevel) || grantLevel < 1 || grantLevel > 4) {
        room.sendAnnouncement(
          "Uso: !gerlogin <nível> — 1 Estagiário, 2 Moderador, 3 Gerente",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      if (grantLevel >= admin.level) {
        room.sendAnnouncement(
          `Você só pode gerar login abaixo do seu cargo (até nv.${admin.level - 1}).`,
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      const meta = config.adminLevels[grantLevel] || { title: `nv.${grantLevel}`, emblem: "🛠️" };
      const createdBy = resolveAuth(player) || player.name;
      let created = null;
      for (let i = 0; i < 6 && !created; i++) {
        created = await createRoleCode({
          code: generateLoginCode(),
          level: grantLevel,
          title: meta.title,
          createdBy,
        });
      }
      if (!created) {
        room.sendAnnouncement("Não deu para gerar a senha.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      room.sendAnnouncement(
        `Senha de uso único (nv.${grantLevel} ${meta.title}): ${created.code}\nA pessoa usa: !login ${created.code}`,
        player.id,
        0x2ecc71,
        "normal",
        1
      );
      notifyStaffAudit({
        title: "🔑 **Login gerado**",
        lines: [
          `Por: ${player.name} \`${createdBy}\``,
          `Nível: ${grantLevel} ${meta.title}`,
          `Origem: !gerlogin`,
        ],
      });
      return true;
    }

    if (cmd === "login") {
      const auth = resolveAuth(player);
      if (!auth) {
        room.sendAnnouncement(noAuthMsg, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const senha = args[0];
      if (!senha) {
        room.sendAnnouncement("Uso: !login <senha>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const peeked = await peekRoleCode(senha);
      if (!peeked || peeked.used_by) {
        room.sendAnnouncement("Senha inválida ou já usada.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const current = ctx.admins.get(player.id) || (await getAdmin(auth));
      if (current && (current.level || 0) >= peeked.level) {
        room.sendAnnouncement(`Você já tem cargo nv.${current.level}.`, player.id, 0xf1c40f, "normal", 1);
        return true;
      }
      const used = await consumeRoleCode(senha, auth);
      if (!used) {
        room.sendAnnouncement("Senha inválida ou já usada.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const meta = config.adminLevels[used.level] || { title: used.title, emblem: "🛠️" };
      const row = await setAdmin(auth, used.level, used.title || meta.title, used.created_by);
      if (!row) {
        room.sendAnnouncement("Não deu para salvar o cargo.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      ctx.admins.set(player.id, row);
      applyAdminLook(player, row);
      await loadTitleForPlayer(player);
      room.sendAnnouncement(
        `Cargo ativo: ${meta.emblem || ""} ${row.title} (nv.${used.level})`.replace(/\s+/g, " ").trim(),
        player.id,
        0x2ecc71,
        "normal",
        1
      );
      notifyStaffAudit({
        title: "✅ **Login usado**",
        lines: [
          `Usou: ${player.name} \`${auth}\``,
          `Nível: ${used.level} ${row.title}`,
          `Gerado por: \`${used.created_by || "—"}\``,
          `Origem: !login`,
        ],
      });
      return true;
    }

    if (cmd === "revoke" || cmd === "tiraradm" || cmd === "removeradm") {
      if ((admin?.level || 0) < 3) {
        room.sendAnnouncement("Só Gerente e Chefe podem tirar cargo de staff.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const ref = args.join(" ").trim();
      if (!ref) {
        room.sendAnnouncement("Uso: !revoke <#id|nick|auth>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const target = findPlayer(room, ref);
      const targetAuth = (target && resolveAuth(target)) || ref;
      if (!targetAuth) {
        room.sendAnnouncement("Jogador/auth não encontrado.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const targetRow = (target && ctx.admins.get(target.id)) || (await getAdmin(targetAuth));
      if (!targetRow) {
        room.sendAnnouncement("Essa pessoa não é staff.", player.id, 0xf1c40f, "normal", 1);
        return true;
      }
      if ((targetRow.level || 0) >= admin.level) {
        room.sendAnnouncement("Você não pode tirar um cargo igual ou maior que o seu.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const ok = await removeAdmin(targetAuth);
      if (!ok) {
        room.sendAnnouncement("Não deu para remover o cargo.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const live =
        target ||
        room.getPlayerList().find((p) => p.id !== 0 && resolveAuth(p) === targetAuth) ||
        null;
      if (live) {
        ctx.admins.delete(live.id);
        try {
          room.setPlayerAdmin(live.id, false);
        } catch {
          /* ignore */
        }
        await loadTitleForPlayer(live);
      }
      const who = target?.name || targetAuth;
      room.sendAnnouncement(`Cargo de staff removido: ${who}.`, player.id, 0x2ecc71, "normal", 1);
      notifyStaffAudit({
        title: "🚫 **Revoke de staff**",
        lines: [
          `Alvo: ${who} \`${targetAuth}\``,
          `Cargo antigo: nv.${targetRow.level} ${targetRow.title || ""}`,
          `Por: ${player.name} \`${resolveAuth(player) || player.name}\``,
          `Origem: !revoke`,
        ],
      });
      return true;
    }

    if (cmd === "buscarplayer" || cmd === "buscarjogador" || cmd === "findplayer") {
      if ((admin?.level || 0) < 3) {
        room.sendAnnouncement("Só Gerente e Chefe podem buscar auths.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const query = args.join(" ").trim();
      if (!query) {
        room.sendAnnouncement("Uso: !buscarplayer <auth|nickname>", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const findPlayers = ctx.searchPlayers || searchPlayers;
      const result = await findPlayers(query);
      room.sendAnnouncement(formatPlayerSearch(result, query), player.id, 0xecf0f1, "small", 1);
      return true;
    }

    if (cmd === "moverstats" || cmd === "transfstats" || cmd === "transferirstats" || cmd === "somarstats") {
      if ((admin?.level || 0) < 3) {
        notifyStaffAudit({
          title: "⛔ **Transferência de stats negada**",
          lines: [
            `Por: ${player.name} \`${resolveAuth(player) || player.name}\``,
            `Sala: ${config.roomName}`,
            `Motivo: permissão insuficiente`,
          ],
        });
        room.sendAnnouncement("Só Gerente e Chefe podem transferir stats.", player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const targetAuth = String(args[0] || "").trim();
      const sourceAuth = String(args[1] || "").trim();
      if (!targetAuth || !sourceAuth) {
        room.sendAnnouncement(
          "Uso: !moverstats <authAlvo> <authAntiga> — transfere tudo e zera a antiga",
          player.id,
          0xe74c3c,
          "normal",
          1
        );
        return true;
      }
      const result = await transferPlayerStats(targetAuth, sourceAuth);
      if (!result.ok) {
        notifyStaffAudit({
          title: "❌ **Falha ao transferir stats**",
          lines: [
            `Alvo: \`${targetAuth}\``,
            `Antiga: \`${sourceAuth}\``,
            `Por: ${player.name} \`${resolveAuth(player) || player.name}\``,
            `Sala: ${config.roomName}`,
            `Motivo: ${result.reason || "erro desconhecido"}`,
          ],
        });
        const why =
          result.reason === "same"
            ? "Auth alvo e antiga são iguais."
            : "Não deu para transferir as stats.";
        room.sendAnnouncement(why, player.id, 0xe74c3c, "normal", 1);
        return true;
      }
      const a = result.before.target;
      const s = result.before.source;
      const n = result.after;
      for (const p of room.getPlayerList()) {
        if (p.id === 0) continue;
        const pa = resolveAuth(p);
        if (pa === targetAuth || pa === sourceAuth) await loadTitleForPlayer(p);
      }
      room.sendAnnouncement(
        [
          `Stats transferidas para a auth atual; a auth antiga foi zerada.`,
          `Jogos ${Number(a.games) || 0}+${Number(s.games) || 0}=${n.games} · Gols ${Number(a.goals) || 0}+${Number(s.goals) || 0}=${n.goals} · Assist ${Number(a.assists) || 0}+${Number(s.assists) || 0}=${n.assists} · CS ${Number(a.cs) || 0}+${Number(s.cs) || 0}=${n.cs} · MVP ${Number(a.mvps) || 0}+${Number(s.mvps) || 0}=${n.mvps}`,
        ].join("\n"),
        player.id,
        0x2ecc71,
        "normal",
        1
      );
      notifyStaffAudit({
        title: "📊 **Stats transferidas**",
        lines: [
          `Alvo: \`${targetAuth}\``,
          `Antiga: \`${sourceAuth}\``,
          `Jogos: ${Number(a.games) || 0}+${Number(s.games) || 0}=${n.games}`,
          `Gols: ${Number(a.goals) || 0}+${Number(s.goals) || 0}=${n.goals}`,
          `Demais: vitórias ${Number(a.wins) || 0}+${Number(s.wins) || 0}=${n.wins} · assistências ${Number(a.assists) || 0}+${Number(s.assists) || 0}=${n.assists} · CS ${Number(a.cs) || 0}+${Number(s.cs) || 0}=${n.cs} · MVP ${Number(a.mvps) || 0}+${Number(s.mvps) || 0}=${n.mvps}`,
          `Conta antiga após transferência: jogos 0 · gols 0 · assistências 0 · CS 0 · MVP 0`,
          `Por: ${player.name} \`${resolveAuth(player) || player.name}\``,
          `Sala: ${config.roomName}`,
          `Origem: !moverstats`,
        ],
      });
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

  function setNativeAdminStar(player, enabled) {
    if (!player || player.id === 0) return;
    try {
      room.setPlayerAdmin(player.id, enabled);
    } catch {
      /* ignore */
    }
    const live = room.getPlayerList().find((p) => p.id === player.id);
    if (live) live.admin = enabled;
    player.admin = enabled;
  }

  function toggleUiAdminStar(player) {
    const live = room.getPlayerList().find((p) => p.id === player.id) || player;
    const next = !live.admin;
    setNativeAdminStar(player, next);
    room.sendAnnouncement(
      next ? "Estrela ligada. !adm de novo desliga." : "Estrela desligada.",
      player.id,
      next ? 0xf1c40f : 0x95a5a6,
      "normal",
      1
    );
  }

  function applyAdminLook(player, adminRow) {
    if (!player || !adminRow) return;
    setNativeAdminStar(player, false);
  }

  function stripForeignAdminStar(player) {
    if (!player || player.id === 0 || !player.admin) return;
    if (ctx.admins.has(player.id)) return;
    setNativeAdminStar(player, false);
  }

  return {
    handle,
    isMuted,
    peekMute,
    forgetPlayer,
    applyAdminLook,
    stripForeignAdminStar,
    loadTitleForPlayer,
    refreshEnteringSpec,
    syncSiteStatus,
    siteTitleFor,
    storeEffectsFor,
    announceStoreJoin,
    formatPlayerChat,
    maybeBaleioChat,
    handleWhisper,
    handleTeamChat,
    handleStaffChat,
    playerHelpText,
    adminHelpText,
    playerHelpLines,
    zoeiraHelpText,
    rankingHelpText,
  };
}

module.exports = {
  createCommandHandler,
  canVoluntaryAfk,
  formatNickAuthList,
  parseModListPage,
};
