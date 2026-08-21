/**
 * !bet — contador eterno de apostas na Haxbooket.
 * !viado — contador eterno de “vamos virar viado”.
 * !provocar — zoação aleatória.
 * !elogiar — elogio aleatório.
 */

function formatBetLine(n) {
  const count = Math.max(1, Math.floor(Number(n) || 1));
  return `🎲 Alguém apostou na Haxbooket pela ${count}ª vez.`;
}

function formatViadoLine(n) {
  const count = Math.max(1, Math.floor(Number(n) || 1));
  return `🌈 Viraram viado pela ${count}ª vez!`;
}

function bindLines(templates) {
  return templates.map((t) => (n) => t.replaceAll("%s", n));
}

const TEASE_LINES = bindLines([
  "🎲 %s pediu a bola, recebeu e devolveu pro outro time.",
  "🎲 %s transformou defesa em assistência pro rival.",
  "🎲 %s chutou no gol aberto e acertou o córner.",
  "🎲 %s defendeu o ataque do próprio time.",
  "🎲 O passe de %s veio com frete grátis pro rival.",
  "🎲 %s pediu a bola só pra devolver com juros.",
  "🎲 O goleiro rival nem se mexeu. %s já tinha entregue.",
  "🎲 %s marcou o cara… do próprio time.",
  "🎲 Posse de %s: dois toques e um adeus.",
  "🎲 %s tentou o passe filtrado. Filtrou o próprio time.",
  "🎲 %s perdeu o 1v0. Sozinho. Sem goleiro. Clássico.",
  "🎲 Assistência de %s: sem querer, pro outro lado.",
  "🎲 %s está no spec — ainda em campo.",
  "🎲 %s cobriu o ângulo. O ângulo errado.",
  "🎲 %s fez o recuo mais ofensivo da história.",
  "🎲 %s abriu a perna e o placar também.",
  "🎲 O time faz 1 e %s empata sozinho.",
  "🎲 %s pediu troca de passe. Trocou de time.",
  "🎲 %s viu o ângulo livre e escolheu o goleiro.",
  "🎲 Clean sheet ameaçada só de %s ter a bola.",
  "🎲 O corte de %s nasceu contra-ataque rival.",
  "🎲 Quando %s fala “deixa comigo”, o time já reza.",
  "🎲 O gol estava aberto. %s fechou. Com o peito.",
  "🎲 Se tivesse cartão por entrega, %s era vermelho direto.",
  "🎲 %s achou o espaço. Era o do outro time.",
  "🎲 %s fez o pivô e girou o placar contra.",
  "🎲 Bola na área e %s na lua.",
  "🎲 %s pediu no pé. Foi no pé do rival.",
  "🎲 A cobertura de %s cobriu o nada.",
  "🎲 %s viu o goleiro adiantado e chutou no goleiro.",
  "🎲 Assistência letal de %s — letal pro próprio gol.",
  "🎲 %s fez o recuo perfeito… pro centroavante rival.",
  "🎲 A tabela de %s tabelou com o adversário.",
  "🎲 O desarme de %s armou o contra rival.",
  "🎲 %s tentou o passe entre linhas. As linhas do outro.",
  "🎲 %s fez o gol. Contra. Mas fez.",
  "🎲 O time de %s joga 3v4 mesmo com 4 em campo.",
  "🎲 O goleiro rival nem precisou. %s já tinha goleado contra.",
  "🎲 Placar justo: rival 2, %s 2. Contra o próprio time.",
  "🎲 Quando %s pega a bola, o time já abaixa a cabeça.",
  "🎲 Estatística cruel: o time melhora quando %s é spec.",
  "🎲 Gol contra de %s veio com comemoração do outro time. Justo.",
  "🎲 A zaga pede proteção contra %s. Do próprio time.",
  "🎲 O 1v0 mais fácil da noite. %s perdeu.",
  "🎲 %s não marca ninguém. Nem o segundo pau.",
  "🎲 Quem botou %s de último homem odeia o próprio gol.",
  "🎲 %s perdeu a bola, a marcação e o lance. Trinca.",
  "🎲 Assistência de %s pro rival: de graça, na medida, sem vergonha.",
  "🎲 %s não precisa de adversário. Derruba o próprio time sozinho.",
  "🎲 %s viu o gol aberto, o goleiro caído, e ainda assim errou.",
  "🎲 %s joga como se tivesse apostado no outro lado.",
  "🎲 %s saiu jogando. Saiu da jogada. Saiu do gol.",
  "🎲 Primeiro toque de %s já era o segundo erro.",
  "🎲 %s atrasou o passe até o contra nascer.",
  "🎲 %s cobrou rápido. Sem olhar. Pro lado errado.",
  "🎲 A marcação de %s é um abraço no vento.",
  "🎲 %s driblou um e perdeu pra bola parada.",
  "🎲 O lançamento de %s foi internacional: outro continente.",
  "🎲 %s chamou a jogada e cancelou a jogada.",
  "🎲 %s pressiona tanto que o rival agradece o espaço.",
  "🎲 Hat-trick de %s: erro, gol contra e recuo pro rival.",
  "🎲 %s errou o passe, o chute e o recuo. No mesmo ataque.",
  "🎲 %s pediu respeito. Primeiro acerta um passe.",
  "🎲 %s chama os outros de ruim com o histórico que tem.",
  "🎲 %s joga bravinho no chat e mole na bola.",
  "🎲 Depois do lance de %s, até o spec virou goleiro.",
  "🎲 %s tocou pra trás, pra frente e pro abismo.",
  "🎲 Se entrega fosse cargo, %s era Chefe.",
  "🎲 O rival nem atacou. %s atacou o próprio gol.",
  "🎲 %s está 8.0 em esforço e 2.0 em direção.",
  "🎲 Falta de %s: sem bola, sem tempo, sem necessidade.",
  "🎲 %s leu o recuo como ataque. Clássico.",
  "🎲 %s abriu o jogo. Abriu pro outro lado.",
  "🎲 O passe de primeira de %s foi de última.",
  "🎲 %s está com o radar desligado e o ego ligado.",
  "🎲 Var conferiu: %s fez de propósito.",
  "🎲 Não foi azar. Foi %s.",
  "🎲 Aposta certa: %s ia entregar — e entregou.",
  "🎲 %s é tão ruim que parece o Kyamo.",
  "🎲 O replay de %s foi confundido com o Kyamo. Entregou igual.",
  "🎲 %s e Kyamo: mesmo passe. Destino: doar a bola.",
  "🎲 Se o Kyamo tivesse um clone em campo, era %s.",
  "🎲 Kyamo pelo menos erra sozinho. %s ainda arrasta o time.",
  "🎲 Último homem igual o Kyamo: %s abriu a perna e o gol.",
  "🎲 %s tá gordo igual o Jalin. Não chega no corte nem atrasado.",
  "🎲 Jalin e %s no mesmo lance: a bola já era do outro.",
  "🎲 %s marca igual o Jalin: ocupa espaço e deixa passar.",
  "🎲 Fechar o corredor? %s chegou depois do gol. Estilo Jalin.",
  "🎲 %s é lerdão igual o Didiey. O lance acabou, ele ainda tava lendo.",
  "🎲 Didiey e %s: decisão no segundo tempo do lance.",
  "🎲 O passe de %s saiu quando o Didiey já teria perdido a bola.",
  "🎲 %s leu o jogo no delay do Didiey. A bola já era contra.",
  "🎲 Primeiro toque de %s ainda estava carregando. Didiey aprova.",
  "🎲 %s é mais troll que o Copas. E o Copas já é recorde.",
  "🎲 Copas trolla o time. %s trolla o time e ainda pede a bola.",
  "🎲 %s passou pro rival de propósito. Copas bateu palma no spec.",
  "🎲 Recuo de %s pro centroavante adversário: escola Copas.",
  "🎲 Mundial de trolagem: 1º %s, 2º Copas, 3º o último homem.",
  "🎲 %s fez o 4v4 virar 3v5. Kyamo, Jalin, Didiey e Copas aplaudem.",
  "🎲 %s abriu a perna no 1v1. Kyamo teria feito igual.",
]);

const PRAISE_LINES = bindLines([
  "⭐ %s é craque. Ponto.",
  "⭐ %s viu o lance três segundos antes do resto.",
  "⭐ Muralha. O nome no gol é %s.",
  "⭐ %s fez fácil o que o outro time achou impossível.",
  "⭐ Visão de jogo de %s é outra categoria.",
  "⭐ %s não chuta: assina o gol.",
  "⭐ Passe de %s veio no pé, no tempo, na medida.",
  "⭐ %s é o maestro. O time só acompanha.",
  "⭐ Reflexo de %s salvou o 4v4.",
  "⭐ %s entrou e o placar mudou de humor.",
  "⭐ O 1-2 de %s merecia replay obrigatório.",
  "⭐ %s leu o jogo como quem já sabia o fim.",
  "⭐ Golaço. Assinatura: %s.",
  "⭐ %s é aquele que decide o x4.",
  "⭐ Posicionamento de %s: sempre no lugar certo.",
  "⭐ Quando %s pede a bola, o time respira.",
  "⭐ %s fez o difícil parecer aquecimento.",
  "⭐ Primeiro toque de %s já era gol na cabeça.",
  "⭐ %s trancou o corredor e abriu o jogo.",
  "⭐ Marcação de %s é um imposto: o rival paga.",
  "⭐ Clean sheet com %s no gol parece padrão.",
  "⭐ %s achou o passe que ninguém viu.",
  "⭐ Decisão de %s: rápida e certa.",
  "⭐ %s carregou o time nas costas.",
  "⭐ %s não corre atrás. Chega antes.",
  "⭐ Lançamento de %s: nas costas da zaga, no pé.",
  "⭐ %s transformou um 30% em gol.",
  "⭐ Clutch é nome do meio de %s.",
  "⭐ %s defendeu o indefensável e ainda saiu jogando.",
  "⭐ %s mandou a bola onde só craque manda.",
  "⭐ Leitura de %s matou o contra antes de nascer.",
  "⭐ %s abriu a defesa com um passe, não com discurso.",
  "⭐ %s fez o recuo perfeito: simples e genial.",
  "⭐ Ângulo fechado? %s inventou outro.",
  "⭐ Pressão de %s faz o rival errar de graça.",
  "⭐ O corte de %s nasceu origem de gol.",
  "⭐ %s deixou o marcador no chão.",
  "⭐ Passe filtrado de %s veio com visto.",
  "⭐ Goleiro rival viu %s e já abaixou.",
  "⭐ %s fez o gol que o jogo pedia.",
  "⭐ %s virou 2v1 em 1v0.",
  "⭐ Recuperação de %s valeu tanto quanto um gol.",
  "⭐ %s colocou no cantinho que só existe pra ele.",
  "⭐ %s é injusto. Pro outro time.",
  "⭐ %s achou o segundo pau de olhos fechados.",
  "⭐ %s segura a bola como quem segura o jogo.",
  "⭐ Contra-ataque de %s: sprint e cérebro.",
  "⭐ %s é o MVP mesmo antes do bot falar.",
  "⭐ %s fechou o espaço e abriu o placar.",
  "⭐ O último homem era %s. O primeiro também.",
  "⭐ Desarme de %s veio com recibo.",
  "⭐ O cruzamento de %s era um convite. Alguém aceitou.",
  "⭐ %s não precisa de sorte. Precisa de bola.",
  "⭐ %s leu o goleiro como um livro aberto.",
  "⭐ Bloqueio de %s salvou mais que um milagre.",
  "⭐ %s é o padrão ouro do passe de primeira.",
  "⭐ Quando o jogo aperta, %s cresce.",
  "⭐ %s fez o gol da virada e da moral.",
  "⭐ Posse com %s é tranquilidade.",
  "⭐ %s driblou, pensou e concluiu. Nessa ordem.",
  "⭐ O recuo de %s armou o ataque de três toques.",
  "⭐ %s decide e ainda faz o time jogar.",
  "⭐ Saída de bola de %s merece quadro.",
  "⭐ %s deixou o rival no 1 e o placar no 3.",
  "⭐ %s viu o buraco na zaga e morou lá.",
  "⭐ O chapéu de %s veio com educação e crueldade.",
  "⭐ %s é o jogador que você quer no seu time. Sempre.",
  "⭐ Finalização de %s: sem drama, com rede.",
  "⭐ %s cobriu costas, frente e o lance inteiro.",
  "⭐ A calma de %s com a bola é profissional.",
  "⭐ %s fez o 4v4 parecer fácil. Não é. Ele é.",
  "⭐ %s acendeu o time com um passe.",
  "⭐ O gol de %s nasceu de inteligência, não de sorte.",
  "⭐ Marcação alta de %s é asfixia.",
  "⭐ %s transformou defesa em ataque em dois toques.",
  "⭐ %s não joga muito. Joga certo.",
  "⭐ A presença de %s em campo vale um jogador a mais.",
  "⭐ %s fechou o jogo com categoria.",
  "⭐ Primeira bola de %s já era recado.",
  "⭐ Tabela de %s: dois toques e a zaga morta.",
  "⭐ %s no gol é clean sheet com nome e sobrenome.",
  "⭐ O 1v0 de %s não teve drama. Teve rede.",
  "⭐ %s joga o futebol que o Kyamo sonha em errar menos.",
  "⭐ Passe de %s: o contrário do Kyamo. Chegou no companheiro.",
  "⭐ Último homem: %s. Kyamo que lute.",
  "⭐ %s chega no corte. Jalin ainda tava saindo da área.",
  "⭐ Fechar o corredor é com %s. Jalin só ocupa espaço.",
  "⭐ %s não é o Jalin: chegou na bola e ainda saiu jogando.",
  "⭐ Leitura de %s é instantânea. Didiey ainda tava abrindo o lance.",
  "⭐ %s decidiu no primeiro toque. Didiey decidiria no quarto.",
  "⭐ Primeiro passe de %s já tinha saído. Didiey ainda lia.",
  "⭐ %s trollou o rival. Copas só trolla o próprio time.",
  "⭐ Recuo de %s armou o ataque. O do Copas arma o contra adversário.",
  "⭐ %s pede a bola pra resolver. Copas pede pra entregar.",
  "⭐ %s é o anti-Kyamo: último homem que fecha, não que abre.",
  "⭐ Timing de %s humilha o Didiey e o Jalin no mesmo lance.",
  "⭐ %s fez o x4 parecer seleção. O quarteto Kyamo-Jalin-Didiey-Copas, não.",
  "⭐ Craque da noite, da sala e do lance: %s.",
  "⭐ %s fechou o 1v1 que o Jalin e o Didiey perderiam atrasados.",
  "⭐ Passe de %s no pé. Copas teria dado no pé do rival.",
]);

function pickFrom(lines, name, rng = Math.random) {
  const nick = String(name || "?").trim() || "?";
  const i = Math.min(lines.length - 1, Math.floor(rng() * lines.length));
  return lines[Math.max(0, i)](nick);
}

function pickTeaseLine(name, rng = Math.random) {
  return pickFrom(TEASE_LINES, name, rng);
}

function pickPraiseLine(name, rng = Math.random) {
  return pickFrom(PRAISE_LINES, name, rng);
}

/**
 * Alvo do !provocar / !elogiar: nick/#id, ou alguém aleatório (de preferência em campo).
 */
function resolveTeaseTarget(room, actor, mention, rng = Math.random) {
  if (mention) {
    const { findPlayer } = require("../utils");
    return findPlayer(room, mention);
  }
  const humans = room.getPlayerList().filter((p) => p.id !== 0);
  if (!humans.length) return null;
  const others = humans.filter((p) => p.id !== actor?.id);
  const poolBase = others.length ? others : humans;
  const onField = poolBase.filter((p) => p.team !== 0);
  const pool = onField.length ? onField : poolBase;
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[Math.max(0, i)] || null;
}

module.exports = {
  formatBetLine,
  formatViadoLine,
  TEASE_LINES,
  PRAISE_LINES,
  pickTeaseLine,
  pickPraiseLine,
  resolveTeaseTarget,
};
