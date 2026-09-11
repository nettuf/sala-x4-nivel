function authLinkUrl(statsUrl) {
  const url = new URL(String(statsUrl || ""));
  url.pathname = url.pathname.replace(/\/stats\/?$/, "") + "/haxball-auth/link";
  url.search = "";
  return url.toString();
}

function normalizeLinkCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function linkHaxballAuth({
  statsUrl,
  apiKey,
  code,
  auth,
  nickname,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!statsUrl || !apiKey) return { ok: false, code: "CONFIG_UNAVAILABLE", attempts: 0 };
  let url;
  try {
    url = authLinkUrl(statsUrl);
  } catch {
    return { ok: false, code: "CONFIG_UNAVAILABLE", attempts: 0 };
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ code: normalizeLinkCode(code), auth, nickname }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, ...body, attempts: attempt };
      const errorCode = body.code || body.errorCode || body.error || "LINK_FAILED";
      if (response.status < 500 || attempt === 2) {
        return { ok: false, status: response.status, code: errorCode, message: body.message, attempts: attempt };
      }
    } catch (error) {
      if (attempt === 2) return { ok: false, code: "NETWORK_ERROR", message: error?.message, attempts: attempt };
    }
    await sleep(500);
  }
  return { ok: false, code: "NETWORK_ERROR", attempts: 2 };
}

module.exports = { authLinkUrl, normalizeLinkCode, linkHaxballAuth };
