function messageHasBlockedLink(text) {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  if (/\bhttps?:\/\//i.test(raw) || /\bwww\./i.test(raw) || /\bdiscord\.gg\b/i.test(raw)) {
    return true;
  }
  if (/h\s*t\s*t\s*p\s*s?\s*:/i.test(raw) || /w\s*w\s*w\s*\./i.test(raw)) return true;
  return false;
}

function rejectBlockedLink(room, player, message, canPost) {
  if (!messageHasBlockedLink(message)) return false;
  if (canPost === true) return false;
  if (typeof canPost === "function" && canPost(player)) return false;
  room.sendAnnouncement("Links não são permitidos no chat.", player.id, 0xe74c3c, "normal", 1);
  return true;
}

module.exports = { messageHasBlockedLink, rejectBlockedLink };
