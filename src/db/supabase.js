const { createClient } = require("@supabase/supabase-js");
const config = require("../config");

let client = null;

function getSupabase() {
  if (client) return client;
  if (!config.supabaseUrl || !config.supabaseKey) {
    console.warn("[supabase] SUPABASE_URL / SERVICE_ROLE_KEY ausentes — modo local sem persistência");
    return null;
  }
  client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

module.exports = { getSupabase };
