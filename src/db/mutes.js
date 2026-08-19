const { getSupabase } = require("./supabase");

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

module.exports = { findActiveMute, createMute, unmute };
