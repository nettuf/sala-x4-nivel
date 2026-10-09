function playerStatusUrl(statsUrl) {
  const url = new URL(String(statsUrl || ""));
  url.pathname = url.pathname.replace(/\/stats\/?$/, "") + "/player-status";
  url.search = "";
  return url.toString();
}

function uniqueAuths(auths) {
  const out = [];
  for (const auth of auths || []) {
    const trimmed = String(auth || "").trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= 40) break;
  }
  return out;
}

async function fetchPlayerSiteStatus({
  statsUrl,
  apiKey,
  auths,
  fetchImpl = globalThis.fetch,
} = {}) {
  const list = uniqueAuths(auths);
  if (!statsUrl || !apiKey || !list.length) {
    return { ok: false, players: {} };
  }
  let url;
  try {
    url = playerStatusUrl(statsUrl);
  } catch {
    return { ok: false, players: {} };
  }
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ auths: list }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, players: {}, status: response.status };
    }
    return { ok: true, players: body.players || {} };
  } catch (error) {
    return { ok: false, players: {}, message: error?.message };
  }
}

function rankedTopUrl(statsUrl) {
  const url = new URL(String(statsUrl || ""));
  url.pathname = url.pathname.replace(/\/stats\/?$/, "") + "/ranked-top";
  url.search = "";
  return url.toString();
}

async function fetchRankedTop({ statsUrl, apiKey, fetchImpl = globalThis.fetch } = {}) {
  if (!statsUrl || !apiKey) return null;
  let url;
  try {
    url = rankedTopUrl(statsUrl);
  } catch {
    return null;
  }
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.players)) return null;
    return body.players
      .map((player) => ({
        nick: String(player?.nick || "").replace(/\s+/g, " ").trim(),
        rankTier: player?.rankTier || "CHALLENGER",
        elo: Number(player?.elo),
      }))
      .filter((player) => player.nick)
      .slice(0, 5);
  } catch {
    return null;
  }
}

function gameIsLive(room, match) {
  try {
    if (room?.getScores?.()) return true;
  } catch {
    /* ignore */
  }
  return typeof match?.isRunning === "function" && !!match.isRunning();
}

module.exports = {
  playerStatusUrl,
  uniqueAuths,
  fetchPlayerSiteStatus,
  fetchRankedTop,
  gameIsLive,
};
