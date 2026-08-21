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
  "🎲 Aposta certa: %s ia entregar — e entregou.",
  "🎲 %s confirmou o flop ao vivo.",
  "🎲 Alguém pagou %s pra jogar contra o próprio time.",
  "🎲 %s inventou um novo jeito de errar o passe.",
  "🎲 Estatística oficial: %s está 100% no modo doação.",
  "🎲 %s viu o gol aberto e preferiu o meme.",
  "🎲 Var conferiu: %s fez de propósito.",
  "🎲 %s jogou tanto que o adversário agradeceu.",
  "🎲 Se tivesse um prêmio de entregar, %s era favorito.",
  "🎲 %s errou tão bonito que quase parece talento.",
  "🎲 Replay do erro de %s já está nos stories da sala.",
  "🎲 %s pediu bola, recebeu, e devolveu pro outro time.",
  "🎲 Momento histórico: %s quase acertou. Quase.",
  "🎲 %s está patrocinado pela falta de noção.",
  "🎲 Tipster da sala: evita %s no próximo lance.",
  "🎲 %s transformou defesa em assistência pro rival.",
  "🎲 Não foi azar. Foi %s.",
  "🎲 %s fez o que ninguém pediu: complicar o fácil.",
  "🎲 Contagem regressiva até o próximo erro de %s… já foi.",
  "🎲 %s entrou no modo \"ajuda o inimigo\".",
  "🎲 %s chutou com a alma e acertou o córner.",
  "🎲 GPS de %s recalculando: destino gol adversário.",
  "🎲 %s defendeu o ataque do próprio time.",
  "🎲 O passe de %s veio com frete grátis pro rival.",
  "🎲 %s viu 3 opções e escolheu a quarta: errar.",
  "🎲 Haxbooket pagava 1.01 em %s entregar. Pagou.",
  "🎲 %s está jogando um esporte diferente.",
  "🎲 Se concentração fosse gol, %s ainda empatava.",
  "🎲 %s pediu a bola só pra devolver com juros.",
  "🎲 O goleiro rival mandou beijo pra %s.",
  "🎲 %s fez um hat-trick: erro, erro e erro.",
  "🎲 Tutorial de como não passar: assista %s.",
  "🎲 %s está 0% no mapa e 100% no chat.",
  "🎲 A bola pediu desculpa depois de tocar em %s.",
  "🎲 %s marcou o cara… do próprio time.",
  "🎲 Clique errado? Não. Foi identidade de %s.",
  "🎲 %s driblou a lógica e perdeu a bola.",
  "🎲 Posse de bola de %s: 2 segundos e um adeus.",
  "🎲 %s tentou o passe filtrado. Filtrou o próprio time.",
  "🎲 O xG do lance caiu quando %s assumiu.",
  "🎲 %s chamou a jogada e cancelou a jogada.",
  "🎲 Se o gol fosse um formulário, %s errava o captcha.",
  "🎲 %s cobrou o lateral com o espírito de escanteio.",
  "🎲 A defesa de %s é conceitual: existe só na ideia.",
  "🎲 %s pressiona tanto que o rival agradece o espaço.",
  "🎲 Replay 0.5x ainda não explica o lance de %s.",
  "🎲 %s perdeu um 1v0 contra ninguém.",
  "🎲 O mouse de %s pediu férias.",
  "🎲 %s leu o jogo. Leu errado, mas leu.",
  "🎲 Assistência de %s: sem querer, pro outro lado.",
  "🎲 %s está no modo espectador — em campo.",
  "🎲 Primeiro toque de %s: segundo erro.",
  "🎲 %s cobriu o ângulo. O ângulo errado.",
  "🎲 A bola foi mais rápida que a decisão de %s.",
  "🎲 %s inventou o passe à prova de companheiro.",
  "🎲 Scouting report: %s entrega em qualquer formação.",
  "🎲 %s fez o recuo mais ofensivo da história.",
  "🎲 Se tivesse replay oficial, %s era o vinheta.",
  "🎲 %s abriu a perna e o placar também.",
  "🎲 O time ganha 1 e %s empata sozinho.",
  "🎲 %s chutou pra sair. Saiu. Do estádio.",
  "🎲 Marcação de %s: distância social.",
  "🎲 %s pediu troca de passe. Trocou de time.",
  "🎲 IQ do lance: %s tirou o mínimo.",
  "🎲 %s viu o ângulo livre e escolheu o goleiro.",
  "🎲 Clean sheet ameaçada só de %s ter a bola.",
  "🎲 %s está jogando pingue-pongue com o rival.",
  "🎲 O corte de %s cortou a esperança do time.",
  "🎲 %s fez falta no ar. Sem bola. Sem rival. Com estilo.",
  "🎲 Estatística: %s toca e o xG do outro sobe.",
  "🎲 %s defendeu um chute que não existia.",
  "🎲 A linha de passe de %s é um labirinto sem saída.",
  "🎲 %s deu um chapéu… no próprio pé.",
  "🎲 Quando %s fala \"deixa comigo\", o time reza.",
  "🎲 %s está treinando pra outro jogo, claramente.",
  "🎲 O escanteio nasceu do nada. Depois nasceu %s.",
  "🎲 %s atrasou o passe e o relógio da sala.",
  "🎲 Visão de jogo de %s: 144p.",
  "🎲 %s fez o controle e perdeu o controle.",
  "🎲 Ranking extra: %s lidera doações por minuto.",
  "🎲 %s tentou o drible da vaca. A vaca ficou com a bola.",
  "🎲 O gol estava tão aberto que %s fechou.",
  "🎲 %s cobrou rápido. Rápido demais. Sem olhar.",
  "🎲 A marcação pressão de %s é um abraço no vento.",
  "🎲 %s saiu jogando. Saiu mesmo. Da jogada.",
  "🎲 Se tivesse cartão por entrega, %s era vermelho direto.",
  "🎲 %s achou o espaço. Era o espaço do outro time.",
  "🎲 Primeira opção de %s: errar. Segunda: repetir.",
  "🎲 %s fez o pivô e girou o placar contra.",
  "🎲 O passe de primeira de %s foi de última.",
  "🎲 %s está com o radar desligado e o ego ligado.",
  "🎲 Bola na área e %s na lua.",
  "🎲 %s pediu a bola no pé. Foi no pé do rival.",
  "🎲 A cobertura de %s cobriu o nada.",
  "🎲 %s driblou um e perdeu pra dois fantasmas.",
  "🎲 Se concentração pagasse, %s estava no vermelho.",
  "🎲 %s viu o goleiro adiantado e chutou no goleiro.",
  "🎲 O lançamento de %s foi internacional: outro continente.",
  "🎲 %s está jogando xadrez. Perdendo no primeiro movimento.",
  "🎲 Assistência letal de %s — letal pro próprio gol.",
  "🎲 %s fez o recuo perfeito… pro centroavante rival.",
  "🎲 O 1-2 de %s foi 1-erro.",
  "🎲 %s marcou presença. Só presença.",
  "🎲 A tabela de %s tabelou com o adversário.",
  "🎲 %s pulou na bola. A bola pulou de %s.",
  "🎲 Goleiro: 1. %s: 0. Trave: também 1.",
  "🎲 %s está no highlight — da vergonha alheia.",
  "🎲 O corte na origem de %s originou o contra.",
  "🎲 %s chamou a responsabilidade e sumiu com ela.",
  "🎲 Ping alto? Não. Foi decisão baixa de %s.",
  "🎲 %s fez o domínio de peito. O peito devolveu pro rival.",
  "🎲 A bola parada de %s ficou parada no lugar errado.",
  "🎲 %s leu o recuo como ataque. Clássico.",
  "🎲 Se o jogo fosse prova, %s colava do adversário.",
  "🎲 %s abriu o jogo. Abriu pro outro lado.",
  "🎲 O desarme de %s armou o contra-ataque rival.",
  "🎲 %s está 8.0 em esforço e 2.0 em direção.",
  "🎲 Falta de %s: sem bola, sem tempo, sem necessidade.",
  "🎲 %s tentou o passe entre linhas. Entre as linhas do outro.",
  "🎲 O posicionamento de %s é um easter egg: ninguém acha.",
  "🎲 %s fez o gol. Contra. Mas fez.",
]);

const PRAISE_LINES = bindLines([
  "⭐ %s é craque. Ponto.",
  "⭐ Jogada de %s: aula particular grátis.",
  "⭐ %s viu o lance 3 segundos antes do resto.",
  "⭐ Muralha. O nome no crachá é %s.",
  "⭐ %s fez fácil o que o outro time achou impossível.",
  "⭐ Visão de jogo de %s é 4K.",
  "⭐ %s não chuta: assina o gol.",
  "⭐ Passe de %s veio com GPS e seguro.",
  "⭐ %s é o maestro. O time só acompanha.",
  "⭐ Reflexo de %s não é humano.",
  "⭐ %s entrou e o placar mudou de humor.",
  "⭐ Craque não se discute: %s só confirma.",
  "⭐ %s driblou a marcação e a lógica.",
  "⭐ O 1-2 de %s merecia replay obrigatório.",
  "⭐ %s leu o jogo como quem leu o gabarito.",
  "⭐ Golaço. Assinatura: %s.",
  "⭐ %s é aquele cara que decide o 4v4.",
  "⭐ Posicionamento de %s parece treinado em slow motion.",
  "⭐ %s deu assistência com os olhos.",
  "⭐ Quando %s pede a bola, o time respira.",
  "⭐ %s fez o difícil parecer aquecimento.",
  "⭐ Primeiro toque de %s já era gol na cabeça.",
  "⭐ %s trancou o corredor e abriu o jogo.",
  "⭐ O chute de %s veio com selo de qualidade.",
  "⭐ %s é craque de realmente jogar, não de recitar.",
  "⭐ Marcação de %s é um imposto: o rival paga.",
  "⭐ %s virou o lance com um toque.",
  "⭐ Clean sheet com %s no gol parece padrão ouro.",
  "⭐ %s achou o passe que ninguém viu.",
  "⭐ Decisão de %s: rápida e certa. Raro combo.",
  "⭐ %s carregou o time nas costas e ainda deu sorriso.",
  "⭐ O domínio de %s é anti-caos.",
  "⭐ %s fez a cobertura de filme.",
  "⭐ Hat-trick de presença: %s está em todo lugar certo.",
  "⭐ %s não corre atrás. Chega antes.",
  "⭐ Lançamento de %s: selo correios expresso.",
  "⭐ %s é o cérebro. O resto é músculo.",
  "⭐ O drible de %s veio com efeito sonoro.",
  "⭐ %s transformou um 30% em gol.",
  "⭐ Clutch é nome do meio de %s.",
  "⭐ %s defendeu o indefensável e ainda saiu jogando.",
  "⭐ Tabela de %s: coreografia.",
  "⭐ %s mandou a bola onde só craque manda.",
  "⭐ Leitura de %s cancelou o contra-ataque antes de nascer.",
  "⭐ %s é o tipo de jogador que faz o spec querer entrar.",
  "⭐ Primeira bola de %s já era recado.",
  "⭐ %s abriu a defesa com um passe, não com discurso.",
  "⭐ O tempo de bola de %s é de outro servidor.",
  "⭐ %s fez o recuo perfeito: simples e genial.",
  "⭐ Ângulo fechado? %s inventou outro.",
  "⭐ %s está jogando xadrez. O outro time, dama.",
  "⭐ Pressão de %s faz o rival errar de graça.",
  "⭐ %s é referência. Literalmente: o time se referencia nele.",
  "⭐ O corte de %s nasceu origem de gol.",
  "⭐ %s deixou o marcador no chão e o chat no alto.",
  "⭐ Passe filtrado de %s veio com visto.",
  "⭐ %s não perde a bola. A bola é que pede pra ficar.",
  "⭐ Goleiro rival viu %s e já ajoelhou internamente.",
  "⭐ %s fez o gol que o jogo pedia.",
  "⭐ Controle de %s: mouse de cirurgião.",
  "⭐ %s virou 2v1 em 1v0 com educação.",
  "⭐ A linha de passe de %s é uma avenida.",
  "⭐ %s está em estado de graça. E de craque.",
  "⭐ Recuperação de %s valeu tanto quanto um gol.",
  "⭐ %s colocou a bola no cantinho que só existe pra ele.",
  "⭐ Comandante da área: %s.",
  "⭐ %s fez o fácil no tempo certo. Isso é talento.",
  "⭐ O giro de %s abriu o universo.",
  "⭐ %s é injusto. Pro outro time.",
  "⭐ Primeiro tempo de %s já dava destaque no site.",
  "⭐ %s defendeu a honra do gol e a da sala.",
  "⭐ Visão periférica de %s tem DLC.",
  "⭐ %s achou o segundo pau de olhos fechados.",
  "⭐ O toque de letra de %s veio com diploma.",
  "⭐ %s segura a bola como quem segura o jogo.",
  "⭐ Contra-ataque de %s: sprint + cérebro.",
  "⭐ %s é o MVP mesmo quando o bot ainda não falou.",
  "⭐ Falta cobrada por %s: sentença.",
  "⭐ %s fechou o espaço e abriu o placar.",
  "⭐ O último homem era %s. O primeiro também.",
  "⭐ %s fez a jogada suja do futebol limpo: simples e mortal.",
  "⭐ Escanteio curto de %s parecia treino de seleção.",
  "⭐ %s mandou silêncio no chat — com futebol.",
  "⭐ Desarme de %s veio com recibo.",
  "⭐ %s está num level que o x4 agradece.",
  "⭐ O cruzamento de %s era um convite. Alguém aceitou.",
  "⭐ %s não precisa de sorte. Precisa de bola.",
  "⭐ Primeira assistência de %s já valia a partida.",
  "⭐ %s leu o goleiro como um livro aberto.",
  "⭐ Bloqueio de %s salvou mais que um milagre.",
  "⭐ %s é o padrão ouro do passe de primeira.",
  "⭐ Quando o jogo aperta, %s cresce.",
  "⭐ %s fez o gol da virada e da moral.",
  "⭐ Posse com %s é tranquilidade.",
  "⭐ %s driblou, pensou e concluiu. Nessa ordem. Perfeito.",
  "⭐ O recuo de %s armou o ataque de 3 toques.",
  "⭐ %s é craque de verdade: decide e ainda faz o time jogar.",
  "⭐ Saída de bola de %s merece quadro.",
  "⭐ %s deixou o rival no 1 e o placar no 3.",
  "⭐ Timing de %s é metrônomo.",
  "⭐ %s viu o buraco na zaga e morou lá.",
  "⭐ O chapéu de %s veio com educação e crueldade.",
  "⭐ %s é o jogador que você quer no seu time. Sempre.",
  "⭐ Finalização de %s: sem drama, com rede.",
  "⭐ %s cobriu costas, frente e futuro do lance.",
  "⭐ A calma de %s com a bola é profissional.",
  "⭐ %s fez o 4v4 parecer fácil. Não é. Ele é.",
  "⭐ Primeiro duelo: %s. Segundo também.",
  "⭐ %s acendeu o time com um passe.",
  "⭐ O gol de %s nasceu de inteligência, não de sorte.",
  "⭐ %s é aquele 10 clássico num x4 moderno.",
  "⭐ Marcação alta de %s é asfixia elegante.",
  "⭐ %s transformou defesa em ataque em dois toques.",
  "⭐ Replay do lance de %s: pause, admire, copie.",
  "⭐ %s não joga muito. Joga certo.",
  "⭐ A presença de %s em campo vale um jogador a mais.",
  "⭐ %s fechou o jogo com categoria de quem já sabia o fim.",
  "⭐ Craque da noite, da sala e do lance: %s.",
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
