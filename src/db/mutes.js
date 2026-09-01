const { getSupabase } = require("./supabase");

async function purgeExpiredMutes() {
  const sb = getSupabase();
  if (!sb) return;
  const now = new Date().toISOString();
  const { error } = await sb
    .from("mutes")
    .update({ active: false })
    .eq("active", true)
    .lt("ends_at", now);
  if (error) console.error("[mutes] purge expired", error.message);
}

async function listActiveMutes({ page = 1, pageSize = 6 } = {}) {
  const sb = getSupabase();
  const pg = Math.max(1, Math.floor(Number(page) || 1));
  const size = Math.min(10, Math.max(1, Math.floor(Number(pageSize) || 6)));
  if (!sb) return { unavailable: true, rows: [], total: 0, page: pg, pageSize: size, pages: 0 };
  await purgeExpiredMutes();
  const from = (pg - 1) * size;
  const to = from + size - 1;
  const { data, error, count } = await sb
    .from("mutes")
    .select("auth, nick", { count: "exact" })
    .eq("active", true)
    .gte("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: false })
    .range(from, to);
  if (error) {
    console.error("[mutes] list active", error.message);
    return { unavailable: true, rows: [], total: 0, page: pg, pageSize: size, pages: 0 };
  }
  const total = count || 0;
  return {
    unavailable: false,
    rows: data || [],
    total,
    page: pg,
    pageSize: size,
    pages: total ? Math.ceil(total / size) : 0,
  };
}

async function findActiveMute(auth) {
  const sb = getSupabase();
  if (!sb || !auth) return null;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("mutes")
    .select("*")
    .eq("auth", auth)
    .eq("active", true)
    .order("ends_at", { ascending: false })
    .limit(5);
  if (error) {
    console.error("[mutes] get", error.message);
    return null;
  }
  const mute = (data || []).find((m) => m.ends_at >= now);
  for (const m of data || []) {
    if (m.ends_at < now && m.active) {
      await sb.from("mutes").update({ active: false }).eq("id", m.id);
    }
  }
  return mute || null;
}

async function createMute({ auth, nick, reason, mutedBy, endsAt }) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("mutes")
    .insert({
      auth,
      nick: nick || null,
      reason: reason || null,
      muted_by: mutedBy || null,
      ends_at: endsAt,
      active: true,
    })
    .select()
    .maybeSingle();
  if (error) console.error("[mutes] create", error.message);
  return data;
}

async function unmute(auth) {
  const sb = getSupabase();
  if (!sb || !auth) return 0;
  const { data, error } = await sb
    .from("mutes")
    .update({ active: false })
    .eq("auth", auth)
    .eq("active", true)
    .select("id");
  if (error) {
    console.error("[mutes] unmute", error.message);
    return 0;
  }
  return (data || []).length;
}

module.exports = { findActiveMute, createMute, unmute, listActiveMutes, purgeExpiredMutes };
