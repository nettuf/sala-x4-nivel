const { getSupabase } = require("./supabase");
const { HALL_MARKS, ROOM_ID, MATCH_SELECT, deltaFromRow } = require("../hallMarks");
const {
  crossedMarks,
  emptyHall,
  normalizeHall,
  firstCrossings,
  formatHallLines,
  announceText,
  cleanNick,
} = require("../hall");

const PAGE = 500;
const AUTH_CHUNK = 15;
const PAUSE_MS = 80;
const BACKFILL_DELAY_MS = 20000;
const MAX_EVENTS = 200000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function minByStat(marks) {
  const mins = new Map();
  for (const mark of marks) {
    const cur = mins.get(mark.stat);
    if (cur == null || mark.at < cur) mins.set(mark.stat, mark.at);
  }
  return mins;
}

function createHallStore({ roomId, marks, matchSelect, delta }) {
  let state = emptyHall();
  let loaded = false;
  let schemaMissing = false;
  let warned = false;
  let chain = Promise.resolve();
  let queued = [];
  let scheduled = false;
  let attempts = 0;
  let announceCb = null;
  let loadPromise = null;

  function exclusive(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  function warnMissing() {
    if (warned) return;
    warned = true;
    console.warn("[hall] coluna room_meta.hall ausente. Rode o SQL desta sala.");
  }

  async function doLoad() {
    const sb = getSupabase();
    if (!sb) {
      loaded = true;
      return;
    }
    const { data, error } = await sb.from("room_meta").select("hall").eq("id", roomId).maybeSingle();
    if (error) {
      if (/hall|schema cache|column/i.test(error.message || "")) {
        schemaMissing = true;
        warnMissing();
        return;
      }
      throw error;
    }
    state = normalizeHall(data?.hall);
    loaded = true;
  }

  function load() {
    if (loaded || schemaMissing) return Promise.resolve();
    if (!loadPromise) {
      loadPromise = doLoad()
        .catch((err) => {
          console.warn("[hall] load", err?.message || err);
        })
        .finally(() => {
          if (!loaded && !schemaMissing) loadPromise = null;
        });
    }
    return loadPromise;
  }

  async function save() {
    const sb = getSupabase();
    if (!sb || schemaMissing) return false;
    const { error } = await sb
      .from("room_meta")
      .update({ hall: state, updated_at: new Date().toISOString() })
      .eq("id", roomId);
    if (error) {
      if (/hall|schema cache|column/i.test(error.message || "")) {
        schemaMissing = true;
        warnMissing();
        return false;
      }
      console.warn("[hall] save", error.message);
      return false;
    }
    return true;
  }

  function applyHits(auth, nick, hits, { announceExisting }) {
    const announced = [];
    const at = new Date().toISOString();
    let changed = false;
    for (const mark of hits) {
      const existing = state.slots[mark.id];
      if (existing?.auth) {
        if (announceExisting && existing.auth === auth) announced.push({ auth, nick, mark });
        continue;
      }
      state.slots[mark.id] = { auth, nick, at };
      announced.push({ auth, nick, mark });
      changed = true;
    }
    return { announced, changed };
  }

  function consumeQueue() {
    const pending = queued;
    queued = [];
    const announced = [];
    for (const item of pending) {
      const taken = applyHits(item.auth, item.nick, item.hits, { announceExisting: true });
      announced.push(...taken.announced);
    }
    return announced;
  }

  async function fetchCandidates(sb) {
    const mins = minByStat(marks);
    const or = [...mins].map(([stat, at]) => `${stat}.gte.${at}`).join(",");
    const cols = ["auth", ...mins.keys()].join(",");
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("player_stats").select(cols).or(or).range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
      await sleep(PAUSE_MS);
    }
    return rows.map((row) => ({ auth: row.auth, stats: row }));
  }

  async function fetchEvents(sb, auths) {
    const events = [];
    for (let i = 0; i < auths.length; i += AUTH_CHUNK) {
      const chunk = auths.slice(i, i + AUTH_CHUNK);
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb
          .from("match_players")
          .select(matchSelect)
          .in("auth", chunk)
          .eq("matches.valid", true)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const row of data || []) {
          const match = row.matches || {};
          if (!match.ended_at || !row.auth) continue;
          events.push({
            auth: row.auth,
            nick: row.nick,
            ended_at: match.ended_at,
            match_id: match.id,
            delta: delta(row),
          });
        }
        if (events.length > MAX_EVENTS) {
          throw new Error("historico grande demais para o mural");
        }
        if (!data || data.length < PAGE) break;
        await sleep(PAUSE_MS);
      }
      await sleep(PAUSE_MS);
    }
    return events;
  }

  async function runBackfill() {
    await load();
    if (schemaMissing || state.done) return;
    const sb = getSupabase();
    if (!sb) return;

    let found = {};
    try {
      const players = await fetchCandidates(sb);
      if (players.length) {
        const events = await fetchEvents(sb, players.map((player) => player.auth).filter(Boolean));
        found = firstCrossings({ players, events, marks });
      }
    } catch (err) {
      attempts += 1;
      console.warn("[hall] backfill", err?.message || err);
      if (attempts < 3) setTimeout(() => runBackfill().catch(() => {}), attempts * 60000);
      return;
    }

    let announced = [];
    await exclusive(async () => {
      if (state.done || schemaMissing) return;
      for (const mark of marks) {
        const holder = found[mark.id];
        if (!holder?.auth || state.slots[mark.id]?.auth) continue;
        state.slots[mark.id] = {
          auth: String(holder.auth),
          nick: cleanNick(holder.nick) || "—",
          at: holder.at || null,
        };
      }
      announced = consumeQueue();
      state.done = true;
      const ok = await save();
      if (!ok) {
        state.done = false;
        queued = announced.map((entry) => ({ auth: entry.auth, nick: entry.nick, hits: [entry.mark] })).concat(queued);
        announced = [];
      }
    });

    if (!state.done) {
      attempts += 1;
      if (attempts < 3) setTimeout(() => runBackfill().catch(() => {}), attempts * 60000);
      return;
    }
    if (announced.length && announceCb) announceCb(announced);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      runBackfill().catch((err) => console.warn("[hall] backfill", err?.message || err));
    }, BACKFILL_DELAY_MS);
  }

  function noteCrossing(entry) {
    const hits = crossedMarks(entry?.prev, entry?.next, marks);
    if (!hits.length || !entry?.auth) return Promise.resolve([]);
    const auth = String(entry.auth);
    const nick = cleanNick(entry.nick) || "—";
    return exclusive(async () => {
      await load();
      if (schemaMissing) return [];
      if (!state.done) {
        queued.push({ auth, nick, hits });
        return [];
      }
      const { announced, changed } = applyHits(auth, nick, hits, { announceExisting: false });
      if (changed) await save();
      return announced;
    });
  }

  async function lines() {
    await load();
    if (schemaMissing) return ["Hall da Fama ainda não está pronto nesta sala."];
    return formatHallLines(state, marks);
  }

  return { noteCrossing, schedule, lines, setAnnounce: (fn) => { announceCb = fn; } };
}

const store = createHallStore({
  roomId: ROOM_ID,
  marks: HALL_MARKS,
  matchSelect: MATCH_SELECT,
  delta: deltaFromRow,
});

module.exports = {
  noteHallCrossing: (entry) => store.noteCrossing(entry),
  scheduleHallBackfill: () => store.schedule(),
  setHallAnnounce: (fn) => store.setAnnounce(fn),
  hallLines: () => store.lines(),
  hallAnnounceText: announceText,
};
