const { getSupabase } = require("./supabase");

async function findActiveBan({ auth, conn }) {
  const sb = getSupabase();
  if (!sb) return null;
  const now = new Date().toISOString();

  const parts = [];
  if (auth) parts.push(`auth.eq.${auth}`);
  if (conn) parts.push(`conn.eq.${conn}`);
  if (!parts.length) return null;

  const { data, error } = await sb
    .from("bans")
    .select("*")
    .eq("active", true)
    .or(parts.join(","))
    .limit(10);
  if (error) {
    console.error("[bans] list", error.message);
    return null;
  }

  const match = (data || []).find((b) => !b.ends_at || b.ends_at >= now);
  if (!match) {
    for (const b of data || []) {
      if (b.ends_at && b.ends_at < now) {
        await sb.from("bans").update({ active: false }).eq("id", b.id);
      }
    }
    return null;
  }
  return match;
}

async function createBan({ auth, conn, ip, nick, reason, bannedBy, endsAt }) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("bans")
    .insert({
      auth: auth || null,
      conn: conn || null,
      ip: ip || null,
      nick: nick || null,
      reason: reason || null,
      banned_by: bannedBy || null,
      ends_at: endsAt,
      active: true,
    })
    .select()
    .maybeSingle();
  if (error) console.error("[bans] create", error.message);
  return data;
}

async function deactivateBan({ auth, conn }) {
  const sb = getSupabase();
  if (!sb) return 0;
  let query = sb.from("bans").update({ active: false }).eq("active", true);
  if (auth) query = query.eq("auth", auth);
  else if (conn) query = query.eq("conn", conn);
  else return 0;
  const { data, error } = await query.select("id");
  if (error) {
    console.error("[bans] unban", error.message);
    return 0;
  }
  return (data || []).length;
}

module.exports = { findActiveBan, createBan, deactivateBan };
