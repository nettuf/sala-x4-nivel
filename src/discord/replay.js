const config = require("../config");

function pad(n) {
  return n < 10 ? `0${n}` : String(n);
}

function recordingName(scoreRed, scoreBlue, redCap, blueCap) {
  const d = new Date();
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${pad(d.getFullYear() % 100)}-${pad(d.getHours())}h${pad(d.getMinutes())}-${redCap || "red"}vs${blueCap || "blue"}-${scoreRed}x${scoreBlue}.hbr2`;
}

function buildSummary({ scoreRed, scoreBlue, goals, redLineup, blueLineup }) {
  const lines = [
    `**${config.roomName}** — fim de jogo`,
    `Placar: 🔴 **${scoreRed}** x **${scoreBlue}** 🔵`,
    "",
    `🔴 ${redLineup.join(", ") || "—"}`,
    `🔵 ${blueLineup.join(", ") || "—"}`,
  ];

  if (goals?.length) {
    lines.push("", "**Gols:**");
    for (const g of goals) {
      const t = typeof g.time === "number" ? `${Math.floor(g.time / 60)}:${pad(Math.floor(g.time % 60))}` : "—";
      if (g.isOwnGoal) {
        lines.push(`· ${t} 😂 GC ${g.scorerNick || "?"}`);
      } else if (g.assistNick) {
        lines.push(`· ${t} ⚽ ${g.scorerNick} (assist ${g.assistNick})`);
      } else {
        lines.push(`· ${t} ⚽ ${g.scorerNick || "gol"}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Envia resumo + arquivo .hbr2 no webhook de replay/partidas.
 */
async function sendReplayAndSummary({ recording, scoreRed, scoreBlue, goals, redPlayers, bluePlayers }) {
  const url = config.discordReplayWebhookUrl || config.discordWebhookUrl;
  if (!url) {
    console.warn("[replay] nenhum webhook configurado");
    return;
  }

  const redLineup = (redPlayers || []).map((p) => p.name);
  const blueLineup = (bluePlayers || []).map((p) => p.name);
  const content = buildSummary({
    scoreRed,
    scoreBlue,
    goals,
    redLineup,
    blueLineup,
  });

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      username: "HAXBOOK x4",
      content: content.slice(0, 1900),
    })
  );

  if (recording && recording.length) {
    const name = recordingName(
      scoreRed,
      scoreBlue,
      redLineup[0]?.replace(/[^\w]/g, "").slice(0, 12),
      blueLineup[0]?.replace(/[^\w]/g, "").slice(0, 12)
    );
    const bytes = recording instanceof Uint8Array ? recording : new Uint8Array(recording);
    form.append("files[0]", new Blob([bytes], { type: "application/octet-stream" }), name);
  }

  try {
    const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[replay] discord", res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.warn("[replay]", err.message);
  }
}

module.exports = { sendReplayAndSummary, buildSummary };
