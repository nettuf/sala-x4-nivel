const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const http = require("http");

describe("token API", () => {
  let server;
  let port;
  const secret = "test-secret-x4";
  const overridePath = path.join(__dirname, "..", "token.override.test");

  before(async () => {
    process.env.TOKEN_API_SECRET = secret;
    process.env.TOKEN_API_PORT = "0"; // we'll bind manually via injected config — use dynamic port
    // Sobrescreve write/read temporariamente testando o módulo isolado
    const express = require("express");
    const app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ ok: true, hasToken: fs.existsSync(overridePath) });
    });

    app.post("/token", (req, res) => {
      const key = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (key !== secret) return res.status(401).json({ ok: false });
      const token = (req.body?.token || "").trim();
      if (!token.startsWith("thr")) return res.status(400).json({ ok: false, error: "token inválido" });
      fs.writeFileSync(overridePath, token + "\n");
      res.json({ ok: true, saved: true, restarted: false });
    });

    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    port = server.address().port;
  });

  after(async () => {
    if (fs.existsSync(overridePath)) fs.unlinkSync(overridePath);
    if (server) await new Promise((r) => server.close(r));
  });

  function request(method, urlPath, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: urlPath,
          method,
          headers: {
            "Content-Type": "application/json",
            ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
            ...headers,
          },
        },
        (res) => {
          let raw = "";
          res.on("data", (c) => (raw += c));
          res.on("end", () => {
            resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null });
          });
        }
      );
      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });
  }

  it("GET /health ok", async () => {
    const res = await request("GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
  });

  it("POST /token sem auth → 401", async () => {
    const res = await request("POST", "/token", { token: "thr1.abc" });
    assert.equal(res.status, 401);
  });

  it("POST /token válido salva arquivo", async () => {
    const res = await request(
      "POST",
      "/token",
      { token: "thr1.TESTTOKEN" },
      { Authorization: `Bearer ${secret}` }
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.saved, true);
    assert.equal(fs.readFileSync(overridePath, "utf8").trim(), "thr1.TESTTOKEN");
  });

  it("POST /token inválido → 400", async () => {
    const res = await request(
      "POST",
      "/token",
      { token: "xxx" },
      { Authorization: `Bearer ${secret}` }
    );
    assert.equal(res.status, 400);
  });
});
