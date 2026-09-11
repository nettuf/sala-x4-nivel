const { getSupabase } = require("./supabase");

async function upsertPlayer({ auth, nick, conn, ip }) {
  const sb = getSupabase();
  if (!sb || !auth) return null;
  const present = (value) => value != null && String(value).trim() !== "";

  const { data: existing } = await sb.from("players").select("auth, join_count").eq("auth", auth).maybeSingle();

  if (existing) {
    const patch = {
      last_seen_at: new Date().toISOString(),
      join_count: (existing.join_count || 1) + 1,
    };
    if (present(nick)) patch.nick = nick;
    if (present(conn)) patch.conn = conn;
    if (present(ip)) patch.ip = ip;
    const { data, error } = await sb
      .from("players")
      .update(patch)
      .eq("auth", auth)
      .select()
      .maybeSingle();
    if (error) console.error("[players] update", error.message);
    return data;
  }

  const row = { auth, join_count: 1 };
  if (present(nick)) row.nick = nick;
  if (present(conn)) row.conn = conn;
  if (present(ip)) row.ip = ip;
  const { data, error } = await sb
    .from("players")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) console.error("[players] insert", error.message);
  return data;
}

async function searchPlayers(term, limit = 6) {
  const query = String(term || "").trim();
  const sb = getSupabase();
  if (!sb) return { unavailable: true, rows: [] };
  if (!query) return { unavailable: false, rows: [] };

  const fields = "auth, nick, join_count, last_seen_at";
  const { data: byAuth, error: authError } = await sb
    .from("players")
    .select(fields)
    .eq("auth", query)
    .limit(1);
  if (authError) {
    console.error("[players] search auth", authError.message);
    return { unavailable: true, rows: [] };
  }
  if (byAuth?.length) return { unavailable: false, rows: byAuth };

  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const { data, error } = await sb
    .from("players")
    .select(fields)
    .ilike("nick", pattern)
    .order("last_seen_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 6, 10)));
  if (error) {
    console.error("[players] search nick", error.message);
    return { unavailable: true, rows: [] };
  }
  return { unavailable: false, rows: data || [] };
}

const crypto = require("node:crypto");

const LOGIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Overlay em memória: testes / sala sem banco. */
const adminMemory = new Map();
const roleCodeMemory = new Map();

function resetStaffMemory() {
  adminMemory.clear();
  roleCodeMemory.clear();
}

function generateLoginCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += LOGIN_ALPHABET[bytes[i] % LOGIN_ALPHABET.length];
  return out;
}

function normalizeLoginCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function getAdmin(auth) {
  if (!auth) return null;
  const sb = getSupabase();
  if (!sb) return adminMemory.get(auth) || null;
  const { data, error } = await sb.from("admins").select("*").eq("auth", auth).maybeSingle();
  if (error) console.error("[admins] get", error.message);
  if (data) {
    adminMemory.set(auth, data);
    return data;
  }
  return adminMemory.get(auth) || null;
}

async function setAdmin(auth, level, title, grantedBy) {
  if (!auth) return null;
  const row = {
    auth,
    level: Number(level),
    title,
    granted_by: grantedBy || null,
    updated_at: new Date().toISOString(),
  };
  adminMemory.set(auth, row);
  const sb = getSupabase();
  if (!sb) return row;
  await sb.from("players").upsert({ auth }, { onConflict: "auth", ignoreDuplicates: true });
  const { data, error } = await sb
    .from("admins")
    .upsert({
      auth,
      level: row.level,
      title,
      granted_by: grantedBy || null,
      updated_at: row.updated_at,
    })
    .select()
    .maybeSingle();
  if (error) {
    console.error("[admins] set", error.message);
    return null;
  }
  const saved = data || row;
  adminMemory.set(auth, saved);
  return saved;
}

async function removeAdmin(auth) {
  if (!auth) return false;
  adminMemory.delete(auth);
  const sb = getSupabase();
  if (!sb) return true;
  const { error } = await sb.from("admins").delete().eq("auth", auth);
  if (error) {
    console.error("[admins] remove", error.message);
    return false;
  }
  return true;
}

async function createRoleCode({ code, level, title, createdBy }) {
  const key = normalizeLoginCode(code);
  if (!key) return null;
  const row = {
    code: key,
    level: Number(level),
    title,
    created_by: createdBy || null,
    used_by: null,
    used_at: null,
    created_at: new Date().toISOString(),
  };
  roleCodeMemory.set(key, { ...row });
  const sb = getSupabase();
  if (!sb) return row;
  const { data, error } = await sb.from("role_codes").insert(row).select().maybeSingle();
  if (error) {
    console.error("[role_codes] create", error.message);
    roleCodeMemory.delete(key);
    return null;
  }
  return data || row;
}

async function consumeRoleCode(code, usedBy) {
  const key = normalizeLoginCode(code);
  if (!key || !usedBy) return null;
  const sb = getSupabase();
  if (!sb) {
    const mem = roleCodeMemory.get(key);
    if (!mem || mem.used_by) return null;
    mem.used_by = usedBy;
    mem.used_at = new Date().toISOString();
    return { ...mem };
  }
  const { data, error } = await sb
    .from("role_codes")
    .update({ used_by: usedBy, used_at: new Date().toISOString() })
    .eq("code", key)
    .is("used_by", null)
    .select()
    .maybeSingle();
  if (error) {
    console.error("[role_codes] consume", error.message);
    return null;
  }
  if (data) {
    roleCodeMemory.set(key, data);
    return data;
  }
  return null;
}

async function peekRoleCode(code) {
  const key = normalizeLoginCode(code);
  if (!key) return null;
  const mem = roleCodeMemory.get(key);
  if (mem) return { ...mem };
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("role_codes").select("*").eq("code", key).maybeSingle();
  if (error) {
    console.error("[role_codes] peek", error.message);
    return null;
  }
  return data || null;
}

module.exports = {
  upsertPlayer,
  searchPlayers,
  getAdmin,
  setAdmin,
  removeAdmin,
  generateLoginCode,
  normalizeLoginCode,
  createRoleCode,
  consumeRoleCode,
  peekRoleCode,
  resetStaffMemory,
};
