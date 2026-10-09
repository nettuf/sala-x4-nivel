function deriveRoomLinkUrl(statsUrl) {
  const value = String(statsUrl || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/stats\/?$/, "/room-link");
    return url.toString();
  } catch {
    return value.replace(/\/stats\/?([?#].*)?$/, "/room-link$1");
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
}

function createRoomLinkSync({
  url,
  statsUrl,
  apiKey,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
  retryDelayMs = 500,
  pendingRetryMs = 15000,
} = {}) {
  const endpoint = String(url || deriveRoomLinkUrl(statsUrl)).trim();
  const key = String(apiKey || "").trim();
  let latestLink = "";
  let pending = null;
  let inFlight = null;
  let retryTimer = null;
  let lastQueued = "";
  let lastSent = "";

  function fingerprint(payload) {
    return JSON.stringify(payload);
  }

  function schedule(ms) {
    if (retryTimer || !pending) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flush();
    }, ms);
    if (typeof retryTimer.unref === "function") retryTimer.unref();
  }

  async function post(payload) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status || 0}`);
  }

  async function flush() {
    if (!endpoint || !key || !pending) return { ok: false, attempts: 0 };
    if (inFlight) return inFlight;

    const payload = pending;
    const currentFingerprint = fingerprint(payload);
    pending = null;
    inFlight = (async () => {
      let attempts = 0;
      try {
        attempts += 1;
        await post(payload);
      } catch (firstError) {
        try {
          if (retryDelayMs > 0) await delay(retryDelayMs);
          attempts += 1;
          await post(payload);
        } catch (error) {
          console.warn("[haxbook] room-link pendente", error?.message || firstError?.message || error);
          if (!pending) pending = payload;
          schedule(pendingRetryMs);
          return { ok: false, attempts };
        }
      }
      lastSent = currentFingerprint;
      return { ok: true, attempts };
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
      if (pending && fingerprint(pending) !== lastSent) schedule(0);
    }
  }

  function send(joinLink, reason) {
    const normalizedLink = String(joinLink || "").trim();
    if (normalizedLink) latestLink = normalizedLink;
    if (!latestLink || !String(reason || "").trim() || !endpoint || !key) return false;
    const payload = { joinLink: latestLink, reason: String(reason).trim() };
    const nextFingerprint = fingerprint(payload);
    if (nextFingerprint === lastQueued || nextFingerprint === lastSent) return false;
    lastQueued = nextFingerprint;
    pending = payload;
    schedule(0);
    return true;
  }

  return {
    send,
    flush,
    getLatestLink: () => latestLink,
    getPending: () => pending,
  };
}

module.exports = { deriveRoomLinkUrl, createRoomLinkSync };
