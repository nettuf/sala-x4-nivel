const express = require("express");
const crypto = require("crypto");
const { execFile } = require("child_process");
const config = require("../config");

/** Comparação de tamanho fixo: não vaza o segredo pelo tempo de resposta. */
function secretMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function startTokenServer() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  function auth(req, res, next) {
    const secret = config.tokenApiSecret;
    if (!secret) {
      return res.status(500).json({ ok: false, error: "TOKEN_API_SECRET não configurado" });
    }
    const header = req.headers.authorization || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const key = req.headers["x-api-key"] || bearer || req.query.secret;
    if (!secretMatches(key, secret)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      room: config.roomName,
      hasToken: Boolean(config.readToken()),
      uptime: process.uptime(),
    });
  });

  /**
   * POST /token
   * Body: { "token": "thr1...." }
   * Header: Authorization: Bearer <TOKEN_API_SECRET>
   *
   * Salva token.override e reinicia o processo PM2 da sala.
   * Obs: o Haxball NÃO gera token via API — você cola o token do headlesstoken aqui.
   */
  app.post("/token", auth, (req, res) => {
    const token = (req.body?.token || req.body?.haxball_token || "").trim();
    if (!token || !token.startsWith("thr")) {
      return res.status(400).json({ ok: false, error: "token inválido (esperado thr...)" });
    }

    try {
      config.writeToken(token);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }

    const name = String(config.pm2ProcessName || "").trim();
    if (!/^[\w.-]+$/.test(name)) {
      return res.status(500).json({ ok: false, error: "PM2_PROCESS_NAME inválido" });
    }
    // execFile (sem shell) para o nome do processo nunca virar comando.
    execFile("pm2", ["restart", name, "--update-env"], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        console.warn("[token-api] pm2 restart falhou (ok se ainda não usa PM2):", err.message);
        console.warn(stderr || "");
        // Sem PM2: avisa para reiniciar manualmente / mata e deixa supervisor subir
        return res.json({
          ok: true,
          saved: true,
          restarted: false,
          hint: "Token salvo em token.override. Reinicie o processo da sala.",
        });
      }
      console.log("[token-api] pm2 restart:", stdout);
      return res.json({ ok: true, saved: true, restarted: true });
    });
  });

  const server = app.listen(config.tokenApiPort, config.tokenApiHost, () => {
    console.log(`[token-api] listening ${config.tokenApiHost}:${config.tokenApiPort}`);
  });

  return server;
}

module.exports = { startTokenServer };
