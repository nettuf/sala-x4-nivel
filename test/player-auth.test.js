const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { resolvePlayerAuth, withIdentity, rememberIdentity } = require("../src/room/playerAuth");

describe("playerAuth", () => {
  it("usa o auth do próprio player", () => {
    const cache = new Map();
    assert.equal(resolvePlayerAuth({ id: 1, auth: "abc" }, cache), "abc");
    assert.equal(cache.get(1), "abc");
  });

  it("cai no cache quando o chat não manda auth", () => {
    const cache = new Map([[2, "from-join"]]);
    assert.equal(resolvePlayerAuth({ id: 2, name: "X" }, cache), "from-join");
  });

  it("cai no getPlayerList quando cache também está vazio", () => {
    const cache = new Map();
    const live = [{ id: 3, auth: "live-auth" }];
    assert.equal(resolvePlayerAuth({ id: 3 }, cache, live), "live-auth");
    assert.equal(cache.get(3), "live-auth");
  });

  it("withIdentity preenche auth/conn faltando", () => {
    const auths = new Map([[4, "a4"]]);
    const conns = new Map([[4, "c4"]]);
    const p = withIdentity({ id: 4, name: "P" }, { auths, conns });
    assert.equal(p.auth, "a4");
    assert.equal(p.conn, "c4");
  });

  it("rememberIdentity grava join", () => {
    const auths = new Map();
    const conns = new Map();
    rememberIdentity({ id: 5, auth: "a5", conn: "c5" }, { auths, conns });
    assert.equal(auths.get(5), "a5");
    assert.equal(conns.get(5), "c5");
  });
});
