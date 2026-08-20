require("dotenv").config();
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TOKEN_OVERRIDE = path.join(ROOT, "token.override");

function readToken() {
  try {
    if (fs.existsSync(TOKEN_OVERRIDE)) {
      const t = fs.readFileSync(TOKEN_OVERRIDE, "utf8").trim();
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return (process.env.HAXBALL_TOKEN || "").trim();
}

function writeToken(token) {
  fs.writeFileSync(TOKEN_OVERRIDE, String(token).trim() + "\n", "utf8");
}

const ADMIN_LEVELS = {
  1: { id: "estagiario", title: "Estagiário", emblem: "🛠️", color: 0x95a5a6 },
  2: { id: "moderador", title: "Moderador", emblem: "🔨", color: 0x3498db },
  3: { id: "gerente", title: "Gerente", emblem: "💼", color: 0x9b59b6 },
  4: { id: "chefe", title: "Chefe", emblem: "👑", color: 0xe74c3c },
};

function bool(v, fallback = false) {
  if (v == null || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

const DEFAULT_BAN_WEBHOOK =
  "https://discord.com/api/webhooks/1539978318353403976/dIgwqm-obDBdUbGy6LZccdPOGfeG4VlvdTlwcu6lXL5Cyo_b5OTC6SU5plnZYN4Lfd0U";
const DEFAULT_CHAT_WEBHOOK =
  "https://discord.com/api/webhooks/1539979820635791511/6AHy90SkGDG02bkrFSumz6fAC6iX1KTO5Z3Qn7ep8i9DUsdfyhVYdHD5QfTHOHgLv9MC";

const config = {
  root: ROOT,
  tokenOverridePath: TOKEN_OVERRIDE,
  readToken,
  writeToken,
  roomName: process.env.ROOM_NAME || "☭🚩 FUTZERA | X4 RETURN 🚩☭",
  public: bool(process.env.ROOM_PUBLIC, true),
  maxPlayers: Number(process.env.ROOM_MAX_PLAYERS || 30),
  password: process.env.ROOM_PASSWORD || null,
  // Bandeira chinesa; lat/lon ~163km de Pouso Alegre (faixa Futsalzito/Xupiscarena)
  geo: process.env.GEO || "CN",
  geoLat: Number(process.env.GEO_LAT || -23.0295),
  geoLon: Number(process.env.GEO_LON || -47.2673),
  mapTraining: process.env.MAP_TRAINING || "",
  mapX3: process.env.MAP_X3 || "",
  mapX4: process.env.MAP_X4 || "",
  mapTrainingFile: process.env.MAP_TRAINING_FILE || "maps/maptraining.hbs",
  mapX3File: process.env.MAP_X3_FILE || "maps/mapx3.hbs",
  mapX4File: process.env.MAP_X4_FILE || "maps/mapx4.hbs",
  scoreLimit: Number(process.env.SCORE_LIMIT || 3),
  timeLimit: Number(process.env.TIME_LIMIT || 4),
  teamSize: Number(process.env.TEAM_SIZE || 4),
  chooseTimeSec: Number(process.env.CHOOSE_TIME_SEC || 20),
  afkWarnMs: Number(process.env.AFK_WARN_MS || 15000),
  afkActionMs: Number(process.env.AFK_ACTION_MS || 20000),
  afkCommandCooldownMs: Number(process.env.AFK_COMMAND_COOLDOWN_MS || 10000),
  afkFullThreshold: Number(process.env.AFK_FULL_THRESHOLD || 12),
  // Kicka AFK mais antigo quando restam no máximo estes slots livres
  afkReserveSlots: Number(process.env.AFK_RESERVE_SLOTS || 5),
  maxPerConn: Number(process.env.MAX_PER_CONN || 2),
  ghostKick: bool(process.env.GHOST_KICK, true),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  discordReplayWebhookUrl: process.env.DISCORD_REPLAY_WEBHOOK_URL || "",
  discordBanWebhookUrl: process.env.DISCORD_BAN_WEBHOOK_URL || DEFAULT_BAN_WEBHOOK,
  discordChatWebhookUrl: process.env.DISCORD_CHAT_WEBHOOK_URL || DEFAULT_CHAT_WEBHOOK,
  discordChatFlushMs: Number(process.env.DISCORD_CHAT_FLUSH_MS || 4000),
  tokenApiPort: Number(process.env.TOKEN_API_PORT || 3847),
  tokenApiHost: process.env.TOKEN_API_HOST || "0.0.0.0",
  tokenApiSecret: process.env.TOKEN_API_SECRET || "",
  pm2ProcessName: process.env.PM2_PROCESS_NAME || "sala-x4",
  discordInviteUrl: process.env.DISCORD_INVITE_URL || "https://discord.gg/ZTu7zwgvhm",
  siteUrl: process.env.SITE_URL || "https://www.haxbook.com.br",
  // Carrossel na sala: Discord, site, gols, partidas (um a cada 10 min)
  carouselMs: Number(process.env.CAROUSEL_MS || process.env.DISCORD_AD_MS || 10 * 60 * 1000),
  discordAdMs: Number(process.env.DISCORD_AD_MS || process.env.CAROUSEL_MS || 10 * 60 * 1000),
  adminLevels: ADMIN_LEVELS,
};

module.exports = config;
