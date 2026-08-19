/**
 * Cole no console de https://www.haxball.com/headless
 *
 * Nome socialista + bandeira 🇨🇳 + ~163km de Pouso Alegre
 * (mesma faixa da Futsalzito / Xupiscarena).
 */

/* eslint-disable no-undef */
window.onHBLoaded = function () {
  const room = HBInit({
    roomName: "☭🚩☭ FUTZERA X4 RETURN ☭🚩☭",
    maxPlayers: 30,
    public: true,
    noPlayer: true,
    geo: { code: "CN", lat: -23.0295, lon: -47.2673 },
  });

  room.setScoreLimit(3);
  room.setTimeLimit(3);
  room.setTeamsLock(true);

  room.onRoomLink = function (link) {
    console.log("LINK DA SALA:", link);
    room.sendAnnouncement("Sala de teste Futzera x4 Return (só listagem)", null, 0x2ecc71, "bold", 2);
  };

  room.onPlayerJoin = function (player) {
    room.sendAnnouncement(
      "Olá " + player.name + "! Esta é só uma sala de teste de listagem (sem bot).",
      player.id,
      0xecf0f1,
      "normal",
      1
    );
  };
};

if (typeof HBInit === "function") {
  window.onHBLoaded();
}
