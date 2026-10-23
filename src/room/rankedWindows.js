const TIME_ZONE = "America/Sao_Paulo";
const WINDOWS = [
  { startHour: 15, startMinute: 0, endHour: 16, endMinute: 0 },
  { startHour: 19, startMinute: 0, endHour: 20, endMinute: 0 },
];

function saoPauloParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function minutesOfDay(parts) {
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function windowStartMinutes(window) {
  return window.startHour * 60 + window.startMinute;
}

function windowEndMinutes(window) {
  return window.endHour * 60 + window.endMinute;
}

function formatClock(hour, minute) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function windowKey(parts, window) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}-${formatClock(window.startHour, window.startMinute)}`;
}

function activeWindow(date = new Date()) {
  const parts = saoPauloParts(date);
  const now = minutesOfDay(parts);
  const window = WINDOWS.find((item) => now >= windowStartMinutes(item) && now < windowEndMinutes(item));
  return window ? { window, parts, key: `started-${windowKey(parts, window)}` } : null;
}

function upcomingWindow(date = new Date()) {
  const parts = saoPauloParts(date);
  const now = minutesOfDay(parts);
  const window = WINDOWS.find((item) => {
    const start = windowStartMinutes(item);
    return now >= start - 15 && now < start - 14;
  });
  return window ? { window, parts, key: `upcoming-${windowKey(parts, window)}` } : null;
}

function fiveMinuteWindow(date = new Date()) {
  const parts = saoPauloParts(date);
  const now = minutesOfDay(parts);
  const window = WINDOWS.find((item) => {
    const start = windowStartMinutes(item);
    return now >= start - 5 && now < start - 4;
  });
  return window ? { window, parts, key: `prefetch5-${windowKey(parts, window)}` } : null;
}

function upcomingMessage(window, formatLabel) {
  return `Ranqueada em 15 min (${formatClock(window.startHour, window.startMinute)}–${formatClock(window.endHour, window.endMinute)}, Brasília). Formato oficial desta sala: ${formatLabel}.`;
}

function startedMessage(window, formatLabel) {
  return `Ranqueada aberta até ${formatClock(window.endHour, window.endMinute)}. Só vale ${formatLabel} que começar nesta janela.`;
}

function joinMessage(window, formatLabel) {
  return `Ranqueada rolando até ${formatClock(window.endHour, window.endMinute)}. Só vale ${formatLabel} que começar agora.`;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];
const RANK_FACE = {
  IRON: ["⬛", "FERRO"],
  BRONZE: ["🟫", "BRONZE"],
  SILVER: ["⬜", "PRATA"],
  GOLD: ["🟨", "OURO"],
  PLATINUM: ["🟩", "PLATINA"],
  DIAMOND: ["🟦", "DIAMANTE"],
};

function rankedMark(rankTier) {
  const raw = String(rankTier || "UNRANKED").trim().toUpperCase();
  if (raw === "MASTER") return "[🟪MESTRE]";
  if (raw === "CHALLENGER") return "[🟥DESAFIANTE]";
  const match = raw.match(/^(IRON|BRONZE|SILVER|GOLD|PLATINUM|DIAMOND)_([1-5])$/);
  if (!match) return "[🟧UNRANKED]";
  const face = RANK_FACE[match[1]];
  return `[${face[0]}${face[1]} ${ROMAN[Number(match[2])]}]`;
}

function rankedChatHead({ linked, rankTier, siteEmblem, storeEmoji } = {}) {
  let head = linked ? rankedMark(rankTier) : "[🔳DESVINCULADO]";
  if (storeEmoji) head += `[${storeEmoji}]`;
  if (linked && siteEmblem) head += `[${siteEmblem}]`;
  return head;
}

function formatTop5(players) {
  const lines = ["Top 5"];
  for (const player of (players || []).slice(0, 5)) {
    const nick = String(player?.nick || "").replace(/\s+/g, " ").trim();
    if (!nick) continue;
    const elo = Number(player.elo);
    const eloText = Number.isFinite(elo) ? ` · ${elo}` : "";
    lines.push(`${rankedMark(player.rankTier || "CHALLENGER")} ${nick}${eloText}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

function createRankedAnnouncer({
  announce,
  formatLabel,
  now = () => new Date(),
  intervalMs = 5000,
  players,
  tell,
  fetchTop,
} = {}) {
  const seen = new Set();
  const told = new Map();
  let cache = { slot: null, players: [] };
  let loading = null;

  function claim(playerId, key) {
    if (!playerId || !key) return false;
    let bag = told.get(key);
    if (!bag) told.set(key, (bag = new Set()));
    if (bag.has(playerId)) return false;
    bag.add(playerId);
    return true;
  }

  function listFor(slot) {
    if (cache.slot !== slot || !cache.players.length) return "";
    return formatTop5(cache.players);
  }

  function ensureCached(slot) {
    if (cache.slot === slot && cache.players.length) return null;
    if (typeof fetchTop !== "function") return null;
    if (loading) return loading;
    loading = Promise.resolve()
      .then(() => fetchTop())
      .then((rows) => {
        if (!Array.isArray(rows) || !rows.length) return;
        cache = { slot, players: rows };
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function rememberPresent(key) {
    if (typeof players !== "function") return;
    for (const player of players() || []) {
      if (player?.id) claim(player.id, key);
    }
  }

  async function openWindow(live, date) {
    if (seen.has(live.key)) return;
    seen.add(live.key);
    const slot = windowKey(live.parts, live.window);
    const pending = ensureCached(slot);
    if (pending) await pending;
    const still = activeWindow(date);
    if (!still || still.key !== live.key) return;
    rememberPresent(live.key);
    if (typeof announce !== "function") return;
    const head = startedMessage(live.window, formatLabel);
    const list = listFor(slot);
    announce(list ? `${head}\n${list}` : head);
  }

  function tick(date = now()) {
    const live = activeWindow(date);
    if (live) {
      if (!seen.has(live.key)) void openWindow(live, date);
      return live;
    }
    const upcoming = upcomingWindow(date);
    if (upcoming && !seen.has(upcoming.key)) {
      seen.add(upcoming.key);
      if (typeof announce === "function") announce(upcomingMessage(upcoming.window, formatLabel));
      void ensureCached(windowKey(upcoming.parts, upcoming.window));
      return upcoming;
    }
    const soon = fiveMinuteWindow(date);
    if (soon && !seen.has(soon.key)) {
      seen.add(soon.key);
      const slot = windowKey(soon.parts, soon.window);
      if (!(cache.slot === slot && cache.players.length)) void ensureCached(slot);
      return soon;
    }
    return null;
  }

  async function greet(playerId, date = now()) {
    const live = activeWindow(date);
    if (!live || !playerId || typeof tell !== "function") return;
    if (!claim(playerId, live.key)) return;
    const slot = windowKey(live.parts, live.window);
    const pending = ensureCached(slot);
    if (pending) await pending;
    const still = activeWindow(date);
    if (!still || still.key !== live.key) return;
    const list = listFor(slot);
    const head = joinMessage(live.window, formatLabel);
    tell(playerId, list ? `${head}\n${list}` : head);
  }

  function start() {
    const timer = setInterval(() => tick(), intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    tick();
    return {
      stop() {
        clearInterval(timer);
      },
      tick,
    };
  }

  return {
    start,
    tick,
    greet,
    isLive(date = now()) {
      return !!activeWindow(date);
    },
    joinLine(date = now()) {
      const live = activeWindow(date);
      return live ? joinMessage(live.window, formatLabel) : null;
    },
  };
}

module.exports = {
  TIME_ZONE,
  WINDOWS,
  saoPauloParts,
  activeWindow,
  upcomingWindow,
  upcomingMessage,
  startedMessage,
  joinMessage,
  rankedMark,
  rankedChatHead,
  formatTop5,
  createRankedAnnouncer,
};
