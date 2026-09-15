function gifClipUrlFromStats(statsUrl) {
  const raw = String(statsUrl || "").trim();
  if (!raw) return "";
  return raw.replace(/\/stats\/?$/, "/gif-clip");
}

function gifClipUploadUrlFromStats(statsUrl) {
  const clip = gifClipUrlFromStats(statsUrl);
  if (!clip) return "";
  return clip.replace(/\/gif-clip\/?$/, "/gif-clip/upload");
}

async function postGifReplay(
  statsUrl,
  apiKey,
  payload,
  { fetchFn, timeoutMs = 20000, uploadTimeoutMs = 60000 } = {}
) {
  if (process.env.NODE_TEST_CONTEXT && !fetchFn) {
    return { ok: true, skipped: true };
  }
  const clipUrl = gifClipUrlFromStats(statsUrl);
  const uploadEndpoint = gifClipUploadUrlFromStats(statsUrl);
  const key = String(apiKey || "").trim();
  if (!clipUrl || !key) {
    console.warn("[gif-clip] sem URL ou API key");
    return { ok: false, reason: "unconfigured" };
  }
  const recording = payload?.recording;
  const windows = payload?.windows;
  if (!recording || !recording.length || !Array.isArray(windows) || !windows.length) {
    return { ok: false, reason: "empty" };
  }

  const doFetch = fetchFn || fetch;
  const jsonHeaders = {
    "Content-Type": "application/json",
    "X-API-Key": key,
  };

  const upRes = await doFetch(uploadEndpoint, {
    method: "POST",
    headers: jsonHeaders,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (upRes?.status === 429) return { ok: false, reason: "daily-cap" };
  if (!upRes?.ok) {
    console.warn("[gif-clip] presign HTTP", upRes?.status || 0);
    return { ok: false, reason: "error", status: upRes?.status || 0 };
  }
  let up = {};
  try {
    up = await upRes.json();
  } catch {
    console.warn("[gif-clip] presign sem JSON");
    return { ok: false, reason: "error" };
  }
  if (!up.uploadUrl || !up.key) {
    console.warn("[gif-clip] presign sem uploadUrl");
    return { ok: false, reason: "error" };
  }

  const bytes = recording instanceof Uint8Array ? recording : new Uint8Array(recording);
  const putRes = await doFetch(up.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(uploadTimeoutMs),
  });
  if (!putRes?.ok) {
    console.warn("[gif-clip] put HTTP", putRes?.status || 0);
    return { ok: false, reason: "error", status: putRes?.status || 0 };
  }

  const done = await doFetch(clipUrl, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      key: up.key,
      roomLabel: payload.roomLabel || "",
      windows,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (done?.status === 429) return { ok: false, reason: "daily-cap" };
  if (!done?.ok) {
    console.warn("[gif-clip] enqueue HTTP", done?.status || 0);
    return { ok: false, reason: "error", status: done?.status || 0 };
  }
  return { ok: true };
}

module.exports = {
  gifClipUrlFromStats,
  gifClipUploadUrlFromStats,
  postGifReplay,
  postGifClip: postGifReplay,
};
