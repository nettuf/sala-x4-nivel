function formatRoomCount(n) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("pt-BR");
}

function displayUrl(url) {
  return String(url || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

/**
 * Um texto a cada intervalo, em ordem: Discord → site → gols → partidas.
 */
function buildCarouselSlides({ discordUrl, siteUrl, goals = 0, games = 0 } = {}) {
  const slides = [];
  const discord = displayUrl(discordUrl);
  const site = displayUrl(siteUrl);
  if (discord) {
    slides.push({
      key: "discord",
      text: `💬 Entre no Discord: ${discordUrl}`,
      color: 0x5865f2,
    });
  }
  if (site) {
    slides.push({
      key: "site",
      text: `🌐 Stats, rankings e mais: ${site}`,
      color: 0x1abc9c,
    });
  }
  slides.push({
    key: "goals",
    text: `⚽ Nesta sala já foram ${formatRoomCount(goals)} gols`,
    color: 0xf1c40f,
  });
  slides.push({
    key: "games",
    text: `🏁 Nesta sala já foram ${formatRoomCount(games)} partidas completas`,
    color: 0xe67e22,
  });
  return slides;
}

function createCarousel({ getSlides } = {}) {
  let index = 0;

  function nextSlide() {
    const slides = typeof getSlides === "function" ? getSlides() : [];
    if (!slides.length) return null;
    const slide = slides[index % slides.length];
    index += 1;
    return slide;
  }

  function start(room, intervalMs) {
    const ms = Number(intervalMs) || 0;
    if (!room || ms <= 0) return { stop() {} };
    const timer = setInterval(() => {
      const slide = nextSlide();
      if (!slide) return;
      room.sendAnnouncement(slide.text, null, slide.color, "bold", 1);
    }, ms);
    if (typeof timer.unref === "function") timer.unref();
    return {
      stop() {
        clearInterval(timer);
      },
    };
  }

  return { nextSlide, start };
}

module.exports = { buildCarouselSlides, createCarousel, formatRoomCount, displayUrl };
