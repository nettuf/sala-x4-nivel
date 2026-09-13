function gifClipUrlFromStats(statsUrl) {
  const raw = String(statsUrl || "").trim();
  if (!raw) return "";
  return raw.replace(/\/stats\/?$/, "/gif-clip");
}

async function postGifClip(statsUrl, apiKey, payload, { fetchFn, timeoutMs = 12000 } = {}) {
  if (process.env.NODE_TEST_CONTEXT && !fetchFn) {
    return { ok: true, skipped: true };
  }
  const url = gifClipUrlFromStats(statsUrl);
  const key = String(apiKey || "").trim();
  if (!url || !key) return { ok: false, reason: "unconfigured" };

  const doFetch = fetchFn || fetch;
  const res = await doFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": key,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res?.status === 429) return { ok: false, reason: "daily-cap" };
  if (!res?.ok) return { ok: false, reason: "error", status: res?.status || 0 };
  return { ok: true };
}

module.exports = { gifClipUrlFromStats, postGifClip };
