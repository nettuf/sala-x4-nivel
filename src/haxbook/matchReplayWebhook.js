function replayUrlFromStats(statsUrl) {
  const raw = String(statsUrl || "").trim();
  if (!raw) return "";
  return raw.replace(/\/stats\/?$/, "/replay");
}

/**
 * Envia o .hbr2 ao back (B2 + referência no Match). Discord continua separado.
 */
async function postMatchReplay(
  statsUrl,
  apiKey,
  { matchId, recording },
  { fetchFn, timeoutMs = 30000 } = {}
) {
  if (process.env.NODE_TEST_CONTEXT && !fetchFn) {
    return { ok: true, skipped: true };
  }
  const url = replayUrlFromStats(statsUrl);
  const key = String(apiKey || "").trim();
  const id = String(matchId || "").trim();
  if (!url || !key) {
    console.warn("[replay-upload] sem URL ou API key");
    return { ok: false, reason: "unconfigured" };
  }
  if (!id) {
    return { ok: false, reason: "no-match-id" };
  }
  if (!recording || !recording.length) {
    return { ok: false, reason: "empty" };
  }

  const bytes = recording instanceof Uint8Array ? recording : new Uint8Array(recording);
  const form = new FormData();
  form.append("matchId", id);
  form.append("file", new Blob([bytes], { type: "application/octet-stream" }), `${id}.hbr2`);

  const doFetch = fetchFn || fetch;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "X-API-Key": key },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res?.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[replay-upload] HTTP", res?.status || 0, text.slice(0, 160));
      return { ok: false, reason: "error", status: res?.status || 0 };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[replay-upload]", err?.message || err);
    return { ok: false, reason: "error" };
  }
}

module.exports = {
  replayUrlFromStats,
  postMatchReplay,
};
