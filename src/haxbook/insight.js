function insightUrl(statsUrl) {
  const base = String(statsUrl || "").replace(/\/+$/, "");
  return base ? `${base}/insight` : "";
}

async function fetchRoomInsight(statsUrl, apiKey, opts = {}) {
  const url = insightUrl(statsUrl);
  if (!url || !apiKey) return null;
  const fetchImpl = opts.fetch || globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 3500;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response?.ok) return null;
    const body = await response.json();
    const message = String(body?.message || "")
      .replace(/[\r\n\x00-\x1f\x7f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
    return message ? { type: String(body?.type || "INFO"), message } : null;
  } catch (err) {
    console.warn("[haxbook] insight", err?.message || err);
    return null;
  }
}

function createPostMatchInsights(room, opts = {}) {
  const statsUrl = opts.statsUrl || "";
  const apiKey = opts.apiKey || "";
  const random = opts.random || Math.random;
  const delayMs = opts.delayMs ?? 1800;
  const minMatches = Math.max(1, Number(opts.minMatches) || 2);
  const maxMatches = Math.max(minMatches, Number(opts.maxMatches) || 3);
  let remaining = nextGap();
  let busy = false;
  let lastMessage = "";

  function nextGap() {
    return minMatches + Math.floor(random() * (maxMatches - minMatches + 1));
  }

  function onOfficialMatch() {
    if (!insightUrl(statsUrl) || !apiKey) return false;
    remaining -= 1;
    if (remaining > 0 || busy) return false;
    remaining = nextGap();
    busy = true;
    const timer = setTimeout(async () => {
      try {
        const insight = await fetchRoomInsight(statsUrl, apiKey, {
          fetch: opts.fetch,
          timeoutMs: opts.timeoutMs,
        });
        if (!insight || insight.message === lastMessage) return;
        lastMessage = insight.message;
        room.sendAnnouncement(
          `Haxbook · ${insight.message}`,
          null,
          insight.type === "CTA" ? 0x1abc9c : 0x9b59b6,
          "bold",
          1
        );
      } catch (err) {
        console.warn("[haxbook] insight announce", err?.message || err);
      } finally {
        busy = false;
      }
    }, delayMs);
    if (typeof timer.unref === "function") timer.unref();
    return true;
  }

  return { onOfficialMatch };
}

module.exports = { insightUrl, fetchRoomInsight, createPostMatchInsights };
