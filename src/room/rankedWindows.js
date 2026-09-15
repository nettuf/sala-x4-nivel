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

function upcomingMessage(window, formatLabel) {
  return `Ranqueada em 15 min (${formatClock(window.startHour, window.startMinute)}–${formatClock(window.endHour, window.endMinute)}, Brasília). Formato oficial desta sala: ${formatLabel}.`;
}

function startedMessage(window, formatLabel) {
  return `Ranqueada aberta até ${formatClock(window.endHour, window.endMinute)}. Só vale ${formatLabel} que começar nesta janela.`;
}

function joinMessage(window, formatLabel) {
  return `Ranqueada rolando até ${formatClock(window.endHour, window.endMinute)}. Só vale ${formatLabel} que começar agora.`;
}

function createRankedAnnouncer({ announce, formatLabel, now = () => new Date(), intervalMs = 5000 } = {}) {
  const seen = new Set();

  function tick(date = now()) {
    const live = activeWindow(date);
    if (live && !seen.has(live.key)) {
      seen.add(live.key);
      if (typeof announce === "function") announce(startedMessage(live.window, formatLabel));
      return live;
    }
    const upcoming = upcomingWindow(date);
    if (upcoming && !seen.has(upcoming.key)) {
      seen.add(upcoming.key);
      if (typeof announce === "function") announce(upcomingMessage(upcoming.window, formatLabel));
      return upcoming;
    }
    return null;
  }

  function start() {
    const timer = setInterval(() => tick(), intervalMs);
    if (typeof timer.unref === "function") timer.unref();
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
  createRankedAnnouncer,
};
