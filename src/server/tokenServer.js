const express = require("express");
const { exec } = require("child_process");
const config = require("../config");

function startTokenServer() {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  function auth(req, res, next) {
    const secret = config.tokenApiSecret;
    if (!secret) {
      return res.status(500).json({ ok: false, error: "TOKEN_API_SECRET não configurado" });
    }
    const header = req.headers.authorization || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const key = req.headers["x-api-key"] || bearer || req.query.secret;
    if (key !== secret) {
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

    const name = config.pm2ProcessName;
    // Reinicia via PM2 se existir; senão o processo atual precisa ser reciclado externamente
    exec(`pm2 restart ${name} --update-env`, { windowsHide: true }, (err, stdout, stderr) => {
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

  const server = app.listen(config.tokenApiPort, "0.0.0.0", () => {
    console.log(`[token-api] listening :${config.tokenApiPort}`);
  });

  return server;
}

module.exports = { startTokenServer };
