const DEFAULT_CLOSE_MS = 20_000;

function marketsBase(statsUrl) {
  try {
    const url = new URL(statsUrl);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/stats\/?$/i, "").replace(/\/+$/, "");
    if (!/\/api\/webhooks\/servers\/[^/]+\/rooms\/[^/]+$/i.test(url.pathname)) return "";
    return `${url.toString().replace(/\/$/, "")}/haxbooket/markets`;
  } catch {
    return "";
  }
}

function marketParticipants(players) {
  return (players || [])
    .filter(
      (p) =>
        p &&
        p.id !== 0 &&
        (p.team === 1 || p.team === 2 || p.team === "RED" || p.team === "BLUE")
    )
    .map((p) => {
      const participant = {
        nickname: String(p.name || p.nickname || ""),
        auth: p.auth || null,
        team: p.team === 1 || p.team === "RED" ? "RED" : "BLUE",
      };
      if (Object.prototype.hasOwnProperty.call(p, "goals")) {
        const goals = Number(p.goals);
        participant.goals = Number.isFinite(goals) ? Math.max(0, Math.trunc(goals)) : 0;
      }
      return participant;
    });
}

function winnerLabel(team) {
  return team === 1 || team === "RED" ? "RED" : team === 2 || team === "BLUE" ? "BLUE" : null;
}

function formatCoins(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function summaryLine(summary) {
  if (!summary || summary.status === "OPEN") return "";
  const red = summary.red || {};
  const blue = summary.blue || {};
  return `🎰 Haxbooket fechada · 🔴 ${formatCoins(red.totalStake)} coins (${Number(summary.redOdd || 0).toFixed(2)}x) · 🔵 ${formatCoins(blue.totalStake)} coins (${Number(summary.blueOdd || 0).toFixed(2)}x)`;
}

async function request(url, apiKey, { method = "GET", body, fetchImpl = globalThis.fetch, timeoutMs = 3500, retryDelayMs = 250 } = {}) {
  if (!url || !apiKey || typeof fetchImpl !== "function") return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method,
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: body == null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
      if (typeof response.json !== "function") return {};
      return await response.json().catch(() => ({}));
    } catch (err) {
      if (attempt === 1) {
        console.warn("[haxbooket]", err?.message || err);
        return null;
      }
      if (retryDelayMs > 0) await new Promise((resolve) => {
        const timer = setTimeout(resolve, retryDelayMs);
        if (typeof timer.unref === "function") timer.unref();
      });
    }
  }
  return null;
}

function createHaxbooket(room, { statsUrl, apiKey, fetchImpl } = {}) {
  const base = marketsBase(statsUrl);
  let current = null;
  let queue = Promise.resolve();

  function enqueue(task) {
    queue = queue.then(task, task).catch((err) => {
      console.warn("[haxbooket]", err?.message || err);
      return null;
    });
  }

  function clearTimer(state) {
    if (state?.timer) clearTimeout(state.timer);
    if (state) state.timer = null;
  }

  function announce(summary, state) {
    if (!state || state.announced) return;
    const line = summaryLine(summary);
    if (!line) return;
    state.announced = true;
    try {
      room.sendAnnouncement(line, null, 0xf1c40f, "bold", 2);
    } catch {
      /* jogo nunca depende do anúncio */
    }
  }

  async function fetchSummary(state) {
    if (!state || state !== current || state.terminal === "VOID") return null;
    const summary = await request(`${base}/${encodeURIComponent(state.matchId)}/summary`, apiKey, { fetchImpl });
    if (!summary) return null;
    announce(summary, state);
    if (summary.status === "OPEN") {
      const closesAt = Date.parse(summary.closesAt || state.closesAt || "");
      const delay = Number.isFinite(closesAt) ? Math.max(250, closesAt - Date.now() + 50) : 1000;
      clearTimer(state);
      state.timer = setTimeout(() => enqueue(() => fetchSummary(state)), delay);
      if (typeof state.timer.unref === "function") state.timer.unref();
    } else clearTimer(state);
    return summary;
  }

  function scheduleSummary(state, closesAt) {
    if (!state || state !== current || state.terminal) return;
    state.closesAt = closesAt || state.closesAt;
    const closeTime = Date.parse(state.closesAt || "");
    const delay = Number.isFinite(closeTime)
      ? Math.max(250, Math.min(DEFAULT_CLOSE_MS, closeTime - Date.now() + 50))
      : DEFAULT_CLOSE_MS;
    clearTimer(state);
    state.timer = setTimeout(() => enqueue(() => fetchSummary(state)), delay);
    if (typeof state.timer.unref === "function") state.timer.unref();
  }

  function open({ matchId, participants, startedAt } = {}) {
    if (!base || !apiKey || !matchId) return false;
    if (current && !current.terminal) voidMarket("nova-partida");
    const state = {
      matchId,
      participants: marketParticipants(participants),
      sent: new Set(),
      terminal: null,
      timer: null,
      announced: false,
      closesAt: null,
    };
    current = state;
    enqueue(async () => {
      const summary = await request(`${base}/start`, apiKey, {
        method: "POST",
        body: { matchId, startedAt: startedAt || new Date().toISOString(), participants: state.participants },
        fetchImpl,
      });
      if (!summary || state !== current || state.terminal) return;
      scheduleSummary(state, summary?.closesAt);
      try {
        room.sendAnnouncement("🎰 Mercado aberto! Aposte em www.haxbook.com.br/bet antes do fechamento.", null, 0xf1c40f, "bold", 1);
      } catch {
        /* ignore */
      }
    });
    return true;
  }

  function event(type, { winner = null, reason, participants } = {}) {
    const state = current;
    if (!state || state.sent.has(type) || (state.terminal && type !== state.terminal)) return false;
    state.sent.add(type);
    if (type === "VOID" || type === "FINISHED") {
      state.terminal = type;
      clearTimer(state);
    }
    const body = {
      eventId: `${state.matchId}:${type.toLowerCase()}`,
      type,
      winner: winnerLabel(winner),
      reason,
    };
    if (participants) body.participants = marketParticipants(participants);
    enqueue(async () => {
      await request(`${base}/${encodeURIComponent(state.matchId)}/events`, apiKey, {
        method: "POST",
        body,
        fetchImpl,
      });
      if (type === "GOAL" || type === "FINISHED") await fetchSummary(state);
    });
    return true;
  }

  function goal(team) {
    return event("GOAL", { winner: team, reason: "primeiro-gol" });
  }

  function voidMarket(reason = "partida-anulada") {
    return event("VOID", { reason });
  }

  function finish(winner, participants) {
    return event("FINISHED", { winner, reason: winnerLabel(winner) ? "fim-valido" : "empate", participants });
  }

  return {
    open,
    goal,
    void: voidMarket,
    finish,
    activeMatchId: () => current?.matchId || null,
    wait: () => queue,
  };
}

module.exports = {
  marketsBase,
  marketParticipants,
  summaryLine,
  request,
  createHaxbooket,
};
