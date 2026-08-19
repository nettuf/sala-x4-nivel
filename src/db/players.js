const { getSupabase } = require("./supabase");

async function upsertPlayer({ auth, nick, conn, ip }) {
  const sb = getSupabase();
  if (!sb || !auth) return null;

  const { data: existing } = await sb.from("players").select("auth, join_count").eq("auth", auth).maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from("players")
      .update({
        nick,
        conn,
        ip,
        last_seen_at: new Date().toISOString(),
        join_count: (existing.join_count || 1) + 1,
      })
      .eq("auth", auth)
      .select()
      .maybeSingle();
    if (error) console.error("[players] update", error.message);
    return data;
  }

  const { data, error } = await sb
    .from("players")
    .insert({
      auth,
      nick,
      conn,
      ip,
      join_count: 1,
    })
    .select()
    .maybeSingle();
  if (error) console.error("[players] insert", error.message);
  return data;
}

async function getAdmin(auth) {
  const sb = getSupabase();
  if (!sb || !auth) return null;
  const { data, error } = await sb.from("admins").select("*").eq("auth", auth).maybeSingle();
  if (error) console.error("[admins] get", error.message);
  return data;
}

async function setAdmin(auth, level, title, grantedBy) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("admins")
    .upsert({
      auth,
      level,
      title,
      granted_by: grantedBy || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();
  if (error) console.error("[admins] set", error.message);
  return data;
}

async function removeAdmin(auth) {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from("admins").delete().eq("auth", auth);
  if (error) {
    console.error("[admins] remove", error.message);
    return false;
  }
  return true;
}

module.exports = { upsertPlayer, getAdmin, setAdmin, removeAdmin };
