const { getSupabase } = require("./supabase");

async function purgeExpiredBans() {
  const sb = getSupabase();
  if (!sb) return;
  const now = new Date().toISOString();
  const { error } = await sb
    .from("bans")
    .update({ active: false })
    .eq("active", true)
    .not("ends_at", "is", null)
    .lt("ends_at", now);
  if (error) console.error("[bans] purge expired", error.message);
}

async function listActiveBans({ page = 1, pageSize = 6 } = {}) {
  const sb = getSupabase();
  const pg = Math.max(1, Math.floor(Number(page) || 1));
  const size = Math.min(10, Math.max(1, Math.floor(Number(pageSize) || 6)));
  if (!sb) return { unavailable: true, rows: [], total: 0, page: pg, pageSize: size, pages: 0 };
  await purgeExpiredBans();
  const from = (pg - 1) * size;
  const to = from + size - 1;
  const { data, error, count } = await sb
    .from("bans")
    .select("auth, conn, nick", { count: "exact" })
    .eq("active", true)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) {
    console.error("[bans] list active", error.message);
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
  if (!sb) return [];
  let query = sb
    .from("bans")
    .update({ active: false })
    .eq("active", true);
  if (auth) query = query.eq("auth", auth);
  else if (conn) query = query.eq("conn", conn);
  else return [];
  const { data, error } = await query.select("id, nick, auth, conn, ip, reason");
  if (error) {
    console.error("[bans] unban", error.message);
    return [];
  }
  return data || [];
}

module.exports = { findActiveBan, createBan, deactivateBan, listActiveBans, purgeExpiredBans };
