const ANNOUNCE_LIMIT = 220;

function cleanNick(nick) {
  const clean = String(nick || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 40);
}

function statValue(stats, key) {
  return Number(stats?.[key]) || 0;
}

function crossedMarks(prev, next, marks) {
  const out = [];
  for (const mark of marks || []) {
    const before = statValue(prev, mark.stat);
    const after = statValue(next, mark.stat);
    if (before < mark.at && after >= mark.at) out.push(mark);
  }
  return out;
}

function emptyHall() {
  return { v: 1, done: false, slots: {} };
}

function normalizeHall(raw) {
  const slots = {};
  const src = raw?.slots && typeof raw.slots === "object" ? raw.slots : {};
  for (const [id, slot] of Object.entries(src)) {
    if (!slot?.auth) continue;
    slots[id] = {
      auth: String(slot.auth),
      nick: cleanNick(slot.nick) || "—",
      at: slot.at || null,
    };
  }
  return { v: 1, done: raw?.done === true, slots };
}

/**
 * Quem cruzou primeiro nas partidas ainda salvas.
 * Quem já estava acima do marco antes dessas partidas não leva o lugar.
 */
function firstCrossings({ players, events, marks }) {
  const windowSum = new Map();
  for (const ev of events || []) {
    if (!ev?.auth || !ev.delta) continue;
    const acc = windowSum.get(ev.auth) || {};
    for (const [key, value] of Object.entries(ev.delta)) {
      acc[key] = (acc[key] || 0) + (Number(value) || 0);
    }
    windowSum.set(ev.auth, acc);
  }

  const running = new Map();
  for (const player of players || []) {
    if (!player?.auth) continue;
    const sum = windowSum.get(player.auth) || {};
    const base = {};
    for (const mark of marks || []) {
      const current = statValue(player.stats, mark.stat);
      const seen = Number(sum[mark.stat]) || 0;
      base[mark.stat] = Math.max(0, current - seen);
    }
    running.set(player.auth, base);
  }

  const sorted = [...(events || [])].filter((ev) => ev?.auth && running.has(ev.auth));
  sorted.sort((a, b) => {
    const ta = String(a.ended_at || "");
    const tb = String(b.ended_at || "");
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ma = String(a.match_id || "");
    const mb = String(b.match_id || "");
    if (ma !== mb) return ma < mb ? -1 : 1;
    return String(a.auth) < String(b.auth) ? -1 : 1;
  });

  const slots = {};
  for (const ev of sorted) {
    const cur = running.get(ev.auth);
    const prev = { ...cur };
    for (const [key, value] of Object.entries(ev.delta || {})) {
      cur[key] = (cur[key] || 0) + (Number(value) || 0);
    }
    for (const mark of crossedMarks(prev, cur, marks)) {
      if (slots[mark.id]?.auth) continue;
      slots[mark.id] = {
        auth: String(ev.auth),
        nick: cleanNick(ev.nick) || "—",
        at: ev.ended_at || null,
      };
    }
  }
  return slots;
}

function trimNick(nick) {
  const clean = cleanNick(nick);
  if (!clean) return "—";
  return clean.length > 16 ? `${clean.slice(0, 15)}…` : clean;
}

function formatHallLines(hall, marks) {
  const groups = [];
  for (const mark of marks || []) {
    let group = groups.find((item) => item.name === mark.group);
    if (!group) {
      group = { name: mark.group, marks: [] };
      groups.push(group);
    }
    group.marks.push(mark);
  }

  const lines = ["🏆 Hall da Fama"];
  for (const group of groups) {
    const parts = group.marks.map((mark) => {
      const nick = hall?.slots?.[mark.id]?.nick;
      return `${mark.at} ${nick ? trimNick(nick) : "—"}`;
    });
    lines.push(`${group.name}: ${parts.join(" · ")}`);
  }
  if (!hall?.done) lines.push("Mural antigo ainda está sendo montado.");
  return packLines(lines, ANNOUNCE_LIMIT);
}

function packLines(lines, limit) {
  const packed = [];
  let buf = "";
  for (const line of lines) {
    const next = buf ? `${buf} | ${line}` : line;
    if (buf && next.length > limit) {
      packed.push(buf);
      buf = line.length > limit ? line.slice(0, limit) : line;
      continue;
    }
    buf = next.length > limit ? next.slice(0, limit) : next;
  }
  if (buf) packed.push(buf);
  return packed;
}

function announceText(nick, mark) {
  return `🏆 ${cleanNick(nick) || "—"} entrou no Hall da Fama: ${mark.label}`;
}

module.exports = {
  cleanNick,
  crossedMarks,
  emptyHall,
  normalizeHall,
  firstCrossings,
  formatHallLines,
  announceText,
};
