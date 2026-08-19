/**
 * O objeto do onPlayerChat do Haxball muitas vezes vem sem `auth`/`conn`.
 * Esses campos costumam estar no join e, às vezes, só depois no getPlayerList().
 */

function rememberIdentity(player, { auths, conns } = {}) {
  if (!player) return;
  if (player.auth && auths) auths.set(player.id, player.auth);
  if (player.conn && conns) conns.set(player.id, player.conn);
}

function resolvePlayerAuth(player, cache, livePlayers) {
  if (!player) return null;
  if (player.auth) {
    cache?.set?.(player.id, player.auth);
    return player.auth;
  }
  const cached = cache?.get?.(player.id);
  if (cached) return cached;
  const live = (livePlayers || []).find((p) => p.id === player.id);
  if (live?.auth) {
    cache?.set?.(player.id, live.auth);
    return live.auth;
  }
  return null;
}

function resolvePlayerConn(player, cache, livePlayers) {
  if (!player) return null;
  if (player.conn) {
    cache?.set?.(player.id, player.conn);
    return player.conn;
  }
  const cached = cache?.get?.(player.id);
  if (cached) return cached;
  const live = (livePlayers || []).find((p) => p.id === player.id);
  if (live?.conn) {
    cache?.set?.(player.id, live.conn);
    return live.conn;
  }
  return null;
}

function withIdentity(player, { auths, conns, livePlayers } = {}) {
  if (!player) return player;
  const auth = resolvePlayerAuth(player, auths, livePlayers);
  const conn = resolvePlayerConn(player, conns, livePlayers);
  if (player.auth === auth && player.conn === conn) return player;
  return { ...player, auth, conn };
}

module.exports = {
  rememberIdentity,
  resolvePlayerAuth,
  resolvePlayerConn,
  withIdentity,
};
