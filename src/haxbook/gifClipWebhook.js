function gifClipUrlFromStats(statsUrl) {
  const raw = String(statsUrl || "").trim();
  if (!raw) return "";
  return raw.replace(/\/stats\/?$/, "/gif-clip");
}

function replayUploadUrlFromStats(statsUrl) {
  const base = gifClipUrlFromStats(statsUrl);
  return base ? `${base}/replay-upload` : "";
}

function replayCompleteUrlFromStats(statsUrl) {
  const base = gifClipUrlFromStats(statsUrl);
  return base ? `${base}/replay` : "";
}

async function postGifClip(statsUrl, apiKey, payload, { fetchFn, timeoutMs = 8000 } = {}) {
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

async function requestReplayUpload(statsUrl, apiKey, { fetchFn, timeoutMs = 8000 } = {}) {
  if (process.env.NODE_TEST_CONTEXT && !fetchFn) {
    return { ok: true, skipped: true, uploadUrl: "", key: "" };
  }
  const url = replayUploadUrlFromStats(statsUrl);
  const key = String(apiKey || "").trim();
  if (!url || !key) return { ok: false, reason: "unconfigured" };

  const doFetch = fetchFn || fetch;
  const res = await doFetch(url, {
    method: "POST",
    headers: { "X-API-Key": key },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res?.ok) return { ok: false, reason: "error", status: res?.status || 0 };
  const body = await res.json().catch(() => ({}));
  if (!body?.uploadUrl || !body?.key) return { ok: false, reason: "error", status: res.status };
  return { ok: true, uploadUrl: body.uploadUrl, key: body.key };
}

async function putRecording(uploadUrl, recording, { fetchFn, timeoutMs = 30000 } = {}) {
  if (!uploadUrl) return { ok: false, reason: "unconfigured" };
  const bytes = recording instanceof Uint8Array ? recording : new Uint8Array(recording || []);
  const doFetch = fetchFn || fetch;
  const res = await doFetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res?.ok) return { ok: false, reason: "error", status: res?.status || 0 };
  return { ok: true };
}

async function completeReplay(statsUrl, apiKey, payload, { fetchFn, timeoutMs = 8000 } = {}) {
  if (process.env.NODE_TEST_CONTEXT && !fetchFn) {
    return { ok: true, skipped: true };
  }
  const url = replayCompleteUrlFromStats(statsUrl);
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

async function uploadReplayAndEnqueue(statsUrl, apiKey, { recording, roomLabel, windows }, opts = {}) {
  const up = await requestReplayUpload(statsUrl, apiKey, opts);
  if (!up.ok) return up;
  if (up.skipped) return up;
  const put = await putRecording(up.uploadUrl, recording, opts);
  if (!put.ok) return put;
  return completeReplay(
    statsUrl,
    apiKey,
    { key: up.key, roomLabel: roomLabel || "", windows: windows || [] },
    opts
  );
}

module.exports = {
  gifClipUrlFromStats,
  replayUploadUrlFromStats,
  replayCompleteUrlFromStats,
  postGifClip,
  requestReplayUpload,
  putRecording,
  completeReplay,
  uploadReplayAndEnqueue,
};
