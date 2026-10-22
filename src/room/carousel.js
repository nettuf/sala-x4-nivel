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
 * Um texto a cada intervalo, em ordem: Discord → site → Dream Team → clips → Haxtape → Cartola → gols → partidas.
 */
function buildCarouselSlides({ discordUrl, siteUrl, clipsUrl, goals = 0, games = 0 } = {}) {
  const slides = [];
  const discord = displayUrl(discordUrl);
  const site = displayUrl(siteUrl);
  const clips = String(clipsUrl || "").trim();
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
    key: "dream",
    text: "⭐ Arma o Dream Team e disputa com a sala: www.haxbook.com.br/dream-team",
    color: 0x9b59b6,
  });
  if (clips) {
    slides.push({
      key: "clips",
      text: `🎬 Veja os melhores clips do mês: ${clips}`,
      color: 0xe74c3c,
    });
  }
  slides.push({
    key: "haxtape",
    text: "✂️ Fez golaço? Corte o clipe com a ferramenta do Haxbook: www.haxbook.com.br/ferramentas/haxtape",
    color: 0xff6b1a,
  });
  slides.push({
    key: "cartola",
    text: "🏆 Monte o seu time no Cartola e dispute o topo da semana: www.haxbook.com.br/cartola",
    color: 0x27ae60,
  });
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
