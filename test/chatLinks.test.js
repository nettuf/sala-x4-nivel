const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { messageHasBlockedLink, rejectBlockedLink } = require("../src/room/chatLinks");

describe("filtro de links no chat", () => {
  it("bloqueia http, https, www e discord.gg", () => {
    assert.equal(messageHasBlockedLink("Jogando no Fut2D (https://fut2d.com/)"), true);
    assert.equal(messageHasBlockedLink("entra http://fut2d.com"), true);
    assert.equal(messageHasBlockedLink("www.fut2d.com"), true);
    assert.equal(messageHasBlockedLink("discord.gg/abc"), true);
    assert.equal(messageHasBlockedLink("h t t p s://x.com"), true);
  });

  it("deixa conversa normal e site sem protocolo", () => {
    assert.equal(messageHasBlockedLink("boa noite"), false);
    assert.equal(messageHasBlockedLink("t bola"), false);
    assert.equal(messageHasBlockedLink("fut2d.com sem http"), false);
  });

  it("some a mensagem e avisa só quem mandou", () => {
    const announcements = [];
    const room = {
      sendAnnouncement: (msg, to) => announcements.push({ msg, to }),
    };
    const player = { id: 7, name: "Kurt" };
    assert.equal(rejectBlockedLink(room, player, "https://fut2d.com/"), true);
    assert.equal(announcements.length, 1);
    assert.equal(announcements[0].to, 7);
    assert.match(announcements[0].msg, /Links não são permitidos/);
    assert.equal(rejectBlockedLink(room, player, "eae"), false);
  });
});
