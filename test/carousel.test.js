const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildCarouselSlides,
  createCarousel,
  formatRoomCount,
  displayUrl,
} = require("../src/room/carousel");
const { createRoomStats } = require("../src/room/roomStats");
const { createMatchController } = require("../src/room/match");
const { TEAM } = require("../src/room/choose");

describe("carrossel da sala", () => {
  it("formata URL sem protocolo e contagem pt-BR", () => {
    assert.equal(displayUrl("https://www.haxbook.com.br/"), "www.haxbook.com.br");
    assert.equal(formatRoomCount(1234), "1.234");
  });

  it("ordem: discord, site, clips, gols, partidas", () => {
    const slides = buildCarouselSlides({
      discordUrl: "https://discord.gg/abc",
      siteUrl: "https://www.haxbook.com.br",
      clipsUrl: "https://www.youtube.com/watch?v=IY62yLibmew",
      goals: 10,
      games: 3,
    });
    assert.deepEqual(
      slides.map((s) => s.key),
      ["discord", "site", "clips", "goals", "games"]
    );
    assert.match(slides[0].text, /discord\.gg\/abc/);
    assert.match(slides[1].text, /www\.haxbook\.com\.br/);
    assert.match(slides[2].text, /clips do mês/);
    assert.match(slides[2].text, /IY62yLibmew/);
    assert.match(slides[3].text, /10 gols/);
    assert.match(slides[4].text, /3 partidas completas/);
  });

  it("roda um slide por vez e usa os totais atualizados", () => {
    let goals = 0;
    const carousel = createCarousel({
      getSlides: () =>
        buildCarouselSlides({
          discordUrl: "https://discord.gg/abc",
          siteUrl: "https://www.haxbook.com.br",
          goals,
          games: 1,
        }),
    });
    assert.equal(carousel.nextSlide().key, "discord");
    assert.equal(carousel.nextSlide().key, "site");
    goals = 7;
    assert.match(carousel.nextSlide().text, /7 gols/);
    assert.equal(carousel.nextSlide().key, "games");
    assert.equal(carousel.nextSlide().key, "discord");
  });
});

describe("totais da sala", () => {
  it("persiste gols e partidas no arquivo", () => {
    const file = path.join(os.tmpdir(), `sala-x4-stats-${Date.now()}.json`);
    const a = createRoomStats({ filePath: file });
    a.recordCompletedMatch({ goals: 5 });
    a.recordCompletedMatch({ goals: 2 });
    assert.deepEqual(a.snapshot(), {
      goals: 7,
      games: 2,
      bets: 0,
      viados: 0,
      bestStreak: 0,
      bestStreakHolders: [],
      bestStreaks: [],
    });

    const b = createRoomStats({ filePath: file });
    assert.deepEqual(b.snapshot(), {
      goals: 7,
      games: 2,
      bets: 0,
      viados: 0,
      bestStreak: 0,
      bestStreakHolders: [],
      bestStreaks: [],
    });
    fs.unlinkSync(file);
  });

  it("persiste recorde de streak", () => {
    const file = path.join(os.tmpdir(), `sala-x4-best-${Date.now()}.json`);
    const a = createRoomStats({ filePath: file });
    a.setBestStreak(3, ["A", "B"]);
    a.setBestStreak(2, ["X"]);
    a.setBestStreak(5, ["C", "D", "E", "F"]);
    assert.equal(a.snapshot().bestStreak, 5);
    assert.deepEqual(a.snapshot().bestStreakHolders, ["C", "D", "E", "F"]);
    assert.deepEqual(
      a.snapshot().bestStreaks.map((e) => e.n),
      [5, 3]
    );

    const b = createRoomStats({ filePath: file });
    assert.equal(b.snapshot().bestStreak, 5);
    assert.deepEqual(b.snapshot().bestStreakHolders, ["C", "D", "E", "F"]);
    assert.deepEqual(
      b.snapshot().bestStreaks.map((e) => e.n),
      [5, 3]
    );
    fs.unlinkSync(file);
  });

  it("persiste apostas da Haxbooket", () => {
    const file = path.join(os.tmpdir(), `sala-x4-bets-${Date.now()}.json`);
    const a = createRoomStats({ filePath: file });
    a.recordBet();
    a.recordBet();
    a.recordBet();
    assert.equal(a.snapshot().bets, 3);

    const b = createRoomStats({ filePath: file });
    assert.equal(b.snapshot().bets, 3);
    fs.unlinkSync(file);
  });

  it("persiste o contador de viado", () => {
    const file = path.join(os.tmpdir(), `sala-x4-viados-${Date.now()}.json`);
    const a = createRoomStats({ filePath: file });
    a.recordViado();
    a.recordViado();
    assert.equal(a.snapshot().viados, 2);

    const b = createRoomStats({ filePath: file });
    assert.equal(b.snapshot().viados, 2);
    fs.unlinkSync(file);
  });
});

describe("partida válida incrementa o carrossel", () => {
  it("4v4 oficial válido soma gols e jogo; warmup não", async () => {
    const recorded = [];
    const players = [
      { id: 1, name: "R", auth: "r", team: TEAM.RED },
      { id: 2, name: "B", auth: "b", team: TEAM.BLUE },
    ];
    let scores = { red: 3, blue: 1, time: 200, scoreLimit: 3, timeLimit: 240 };
    const room = {
      getPlayerList: () => players,
      getScores: () => scores,
      startRecording: () => {},
      stopRecording: () => new Uint8Array(),
      startGame: () => {},
      sendAnnouncement: () => {},
    };
    const match = createMatchController(room, {
      onCompletedMatch: (info) => recorded.push(info),
    });

    match.start({ competitive: false });
    match.markVictory();
    await match.finish(scores);
    assert.equal(recorded.length, 0);

    match.start({ competitive: true });
    match.markVictory();
    await match.finish(scores);
    assert.deepEqual(recorded, [{ goals: 4 }]);
  });
});
