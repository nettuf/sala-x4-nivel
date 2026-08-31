const USER_DATABASE = "USER_DATABASE";

var sala = "rapidao"

var playersData = JSON.parse(localStorage.getItem("playersData"+sala)) || {}
let
roomNameString = "🟡🟢 𝐀𝐏𝐄𝐗 | 𝐗𝟑 | 𝐍𝐎𝐑𝐌𝐀𝐋 🟡🟢";
    room = HBInit({
	roomName: roomNameString, // nome da sua hospedagem
	maxPlayers: 30, // quantidade de players que essa sala pode suportar, maximo 30
	public: true, // true para sala publica, false para sala privada.
	token: "thr1.AAAAAGayxWSArQ2ata1UvQ.Vfu1l_MgLys",
	geo : { code : "BR", lat: -21.73159673906251, lon: -43.35805892944336}, // localização da hospedagem
	noPlayer: true// false para host com bot, true para host sem bot
	
})

// ===== VOTEBAN =====
let votebanAtivo = false;
let votosSim = 0;
let votosNao = 0;
let alvoVoteban = null;
let votantes = [];
let criadorVoteban = null;

let ultimoVoteban = 0;
const COOLDOWN_VOTEBAN = 30 * 60 * 1000; // 30 minutos

let
prefixString = "!",
bansURL = 'https://discord.com/api/webhooks/1449858967491711189/XyeYFladX-29bMurNQMaZeWfHoQ8L0CPx65MVfaY2CMWHWCaQRZqG2Tnez3T_x07Peqy',
JogadoresBanidosObject = {};
var jogadoresbanidos = JSON.parse(localStorage.getItem("banidos")) || []; //  jogadores banidos por conn

let Request = {
	post: (player, content)=>{
		let params = {
			"username": `APEX BOT`,
			"avatar_url": "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300",
			"content": content,
		};

		fetch(bansURL, {
			method: "POST",
			headers: new Headers({ "Content-Type": "application/json" }),
			body: JSON.stringify(params)
		})
	}
};

let lastAdminCheck = {}; // Armazena o timestamp do último check para cada jogador
let jogadorIPs = {};


let comandos = {
	banip: function (player, ip, tempo, motivo) {
    ip = garantirIPv4(ip);

    if (!ip || !tempo || !motivo) {
        room.sendAnnouncement('『⚠️』Utilize !banip <ip> <tempo> <motivo>.', player.id, 0xFA5646, 'bold', 1);
        return false;
    }

    var dias = parseInt(tempo);
    if (isNaN(dias) || dias < 1 || dias > 999) {
        room.sendAnnouncement('『⛔』O tempo deve ser um número inteiro entre 1 e 999 dias.', player.id, 0xFA5646, 'bold', 1);
        return false;
    }

    if (JogadoresBanidosObject[ip]) {
        room.sendAnnouncement(`『🚫』[${ip}] já está banido!`, player.id, 0xFA5646, 'bold', 1);
        return false;
    }

    var motivoSemBarra = motivo;
	
    JogadoresBanidosObject[ip] = {
        tempo: dias,
        motivo: motivoSemBarra,
        autor: player.name
    };

    // ===============================
    // 🔍 CAPTURA DO JOGADOR PELO IP
    // ===============================
    var nomeJogador = "Desconhecido";

    for (var id in jogadorIPs) {
        if (jogadorIPs[id] === ip) {
            let jogador = dadosjogadores.find(j => j[1] == id);
            if (jogador) {
                nomeJogador = jogador[0];
                break;
            }
        }
    }

    room.sendAnnouncement(`『⛔』${nomeJogador} teve o IP banido por ${dias} dias`, player.id, 0xFA5646, 'bold', 1);

    // ===============================
    // 🔒 WEBHOOK ADMINISTRATIVO
    // ===============================
    var adminContent =
`\`\`\`
Jogador: ${nomeJogador}
IP: ${ip}
Tempo: ${dias} dias
Motivo: ${motivoSemBarra}
Autor: ${player.name}
Data: ${getDateInfo()}
\`\`\``;

    var adminParams = {
        username: 'APEX',
        embeds: [
            {
                title: "Banimento de IP Aplicado",
                color: 16711680,
                description: adminContent,
                footer: { text: "© APEX 2026 all reserved." },
                author: { name: roomNameString },
                thumbnail: {
                    url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
                }
            }
        ]
    };

    var xhrAdmin = new XMLHttpRequest();
    xhrAdmin.open(
        "POST",
        "https://discord.com/api/webhooks/1452046603194994739/7y0O509xVIDLQlvIkH1CZH3hUaHeV6IFSt8IzhghLiyPNcwFqMKXpc5NH3HTA8Ro2Iki"
    );
    xhrAdmin.setRequestHeader("Content-Type", "application/json");
    xhrAdmin.send(JSON.stringify(adminParams));

    // ===============================
    // 🌍 WEBHOOK PÚBLICO DE PUNIÇÕES
    // ===============================
    var publicContent =
`👤 **Jogador:** ${nomeJogador}
🚫 **Punição:** Banimento por IP
⏱️ **Duração:** ${dias} dias
📄 **Motivo:** ${motivoSemBarra}
👔 **Autor:** ${player.name}
🏟️ **Sala:** ${roomNameString}
📅 **Data:** ${new Date().toLocaleDateString("pt-BR")}`;

    var publicParams = {
        username: "APEX • Punições",
        embeds: [
            {
                title: "🚫 Banimento por IP Aplicado",
                color: 0xFF0000,
                description: publicContent,
                footer: { text: "Sistema automático de punições" },
                thumbnail: {
                    url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
                }
            }
        ]
    };

    var xhrPublic = new XMLHttpRequest();
    xhrPublic.open(
        "POST",
        "https://discord.com/api/webhooks/1456907448798548255/OOJsyGeeXgx5qeSkA-kkrbVUMlvbGIJ-YUKfdkiVsMT6uAYdMMjktqH1YCsBF_aRAvEx"
    );
    xhrPublic.setRequestHeader("Content-Type", "application/json");
    xhrPublic.send(JSON.stringify(publicParams));

    // ===============================
    // 🚪 KICK DO JOGADOR
    // ===============================
    for (var id in jogadorIPs) {
        if (jogadorIPs[id] === ip) {
            room.kickPlayer(id, `『⛔』Seu IP foi banido, motivo: ${motivoSemBarra}`, false);
        }
    }

    setTimeout(() => {
        delete JogadoresBanidosObject[ip];
    }, 1000 * 60 * 60 * 24 * dias);
},

    ban: (player, id, tempo , motivo) => {
		var playeraserbanido;
		listadeplayers = dadosjogadores;
	
		listadeplayers.forEach(function(objeto) {
			if (objeto[1] == id) {
				playeraserbanido = objeto;
			}
		}); 
	
		if (playeraserbanido) {
			nome = playeraserbanido[0];
			conn = playeraserbanido[2];
		} else {
			room.sendAnnouncement(`『🔍』Id não encontrado`, player.id, Cor.Vermelho, 'bold');
			return false;
		}
	
		if (tempo == null || motivo == null) {
			room.sendAnnouncement('『⚠️』Utilize !ban <id> <tempo> <motivo>.', player.id, Cor.Vermelho, 'bold');
		} else {
			var dias = parseInt(tempo);
			if (isNaN(dias) || dias < 1 || dias > 999) {
				room.sendAnnouncement(`『⛔』O tempo deve ser um número inteiro entre 1 e 999 dias.`, player.id, Cor.Vermelho, 'bold');
			} else {
				if (conn == undefined) {
					room.sendAnnouncement("『❗』Você não digitou o id.", player.id, Cor.Vermelho, 'bold');
				} else {
					if (JogadoresBanidosObject[conn]) {
						room.sendAnnouncement(`『🚫』${conn} já foi banido`, player.id, Cor.Vermelho, 'bold');
					} else {
						if (motivo == undefined) {
							room.sendAnnouncement("『⚠️』Motivo não definido", player.id, Cor.Vermelho, 'bold');
						} else {
							let motivoSemBarra = motivo.split("_").join(" ");
							conn[player.name] = player.name;
							JogadoresBanidosObject[conn] = { tempo: dias, motivo: motivoSemBarra, autor: player.name, name: player.conn };
	
							// Enviar notificação ao Discord usando embed
							var content = `\`\`\`Autor: ${player.name}\nNick banido: ${nome}\nConn banida: ${conn}\nSala: ${roomNameString}\nTempo: ${dias} dias\nMotivo: ${motivoSemBarra}\`\`\``;
	
							var params = {
								username: 'APEX',
								embeds: [
									{
										title: "Banimento Aplicado",
										color: 16711680,
										description: content,
										footer: {
											text: "© APEX 2026 all reserved."
										},
										author: { "name": roomNameString },
										image: {
											url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
										},
										thumbnail: {
											url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
										}
									}
								],
								avatar_url: '',
								username: 'APEX',
							};
	
							var xhr = new XMLHttpRequest();
							xhr.open("POST", 'https://discord.com/api/webhooks/1452046929100931164/xHK1qXhXQW0ZqD_qhTw-q_8XDSO8WnnnU_Y-TkBIkiY38E3IL-Pbu3cvfB6gomjfm91j'); // Substitua com a URL do seu webhook
							xhr.setRequestHeader('Content-Type', 'application/json');
							xhr.send(JSON.stringify(params));


                           // ===== WEBHOOK CANAL PÚBLICO DE PUNIÇÕES =====

var publicContent =
`👤 **Jogador:** ${nome}
🚫 **Punição:** Banimento
⏱️ **Duração:** ${dias} dias
📄 **Motivo:** ${motivoSemBarra}
👔 **Autor:** ${player.name}
🏟️ **Sala:** ${roomNameString}
📅 **Data:** ${new Date().toLocaleDateString("pt-BR")}`;

var publicParams = {
  username: "APEX • Punições",
  embeds: [
    {
      title: "🚫 Banimento Aplicado",
      color: 0xFF0000,
      description: publicContent,
      footer: {
        text: "Sistema automático de punições"
      },
      thumbnail: {
        url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
      }
    }
  ]
};

var xhrPublic = new XMLHttpRequest();
xhrPublic.open(
  "POST",
  "https://discord.com/api/webhooks/1456907448798548255/OOJsyGeeXgx5qeSkA-kkrbVUMlvbGIJ-YUKfdkiVsMT6uAYdMMjktqH1YCsBF_aRAvEx"
);
xhrPublic.setRequestHeader("Content-Type", "application/json");
xhrPublic.send(JSON.stringify(publicParams));
 
	///////////////////////////////////////////
							room.sendAnnouncement(`『⛔』${nome} foi banido por ${dias} dias`, player.id);
							room.kickPlayer(id, `『⛔』Você foi banido, motivo: ${motivoSemBarra}`, false); // Kick o player da sala
	
							setTimeout(() => {
								delete JogadoresBanidosObject[conn];
							}, 1000 * 60 * 60 * 24 * dias); // Tempo em dias
						}
					}
				}
			}
		}
	}	
	,

    ids: function(player) {
        // Verifique se o jogador tem permissão para usar o comando
        if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name)) {
            let ids = room.getPlayerList();
            let idsList = "『📋』Lista de IDs dos Jogadores:\n";
            
            ids.forEach(function(p) {
                idsList += `${p.name}: ${p.id}\n`;
            });

            // Enviar a lista de IDs para o jogador que executou o comando
            room.sendAnnouncement(idsList, player.id, 0x00FF00, 'bold', 1);
        } else {
            room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
        }
    },

    desbanip: function(player, ip) {
		const webhookUrl = 'https://discord.com/api/webhooks/1449569971557634068/2aGrH5x2luxqrA91UabuOWfBuGp9imapglKROtgoOlSmVWc9M1_3TvdeQdZ4k_AjJ6nc';
	
		if (adminD.includes(player.name) || adminF.has(player.name)) {
			if (JogadoresBanidosObject[ip]) {
				delete JogadoresBanidosObject[ip];
				room.sendAnnouncement(`[${ip}] foi desbanido.`, player.id, Cor.Vermelho, 'bold', 1);
	
				// Preparar a mensagem de notificação para o Discord
				var content = `\`\`\`Jogador: ${player.name}\nIP desbanido: ${ip}\nData: ${new Date().toLocaleString()}\nAção: IP desbanido\`\`\``;
	
				var params = {
					username: 'APEX',
					embeds: [
						{
							title: "Desbanimento de IP Aplicado",
							color: 65280,
							description: content,
							footer: {
								text: "© APEX 2026 all reserved."
							},
							author: { "name": roomNameString },
							image: {
								url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
							},
							thumbnail: {
								url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
							}
						}
					],
					avatar_url: '',
					username: 'APEX',
				};
	
				// Enviar a notificação para o Discord
				var xhr = new XMLHttpRequest();
				xhr.open("POST", webhookUrl, true);
				xhr.setRequestHeader('Content-Type', 'application/json');
				xhr.send(JSON.stringify(params));
	
			} else {
				room.sendAnnouncement(`IP [${ip}] não está na lista de banidos.`, player.id, Cor.Vermelho, 'bold', 1);
			}
		} else {
			room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
		}
	}
	,


	desban: (player, conn) => {
		const webhookUrl = 'https://discord.com/api/webhooks/1274503942520442951/o691j6rGwEuOcQmDWF6Jr0LrgzpRwtWYB5rsHO9TGQ32WUQ1KgQOiZ46lCJaciX2ZCVU';
	
		if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name)) {
			// Verifica se o jogador com a conexão fornecida está na lista de banidos
			if (JogadoresBanidosObject[conn]) {
				clearTimeout(JogadoresBanidosObject[conn].timeoutId); // Remove o timeout relacionado ao banimento
				delete JogadoresBanidosObject[conn]; // Remove o jogador da lista de banidos
				room.sendAnnouncement(`Jogador com a conexão ${conn} foi desbanido.`, player.id, 0x00FF00, 'bold');
	
				// Preparar a mensagem de notificação para o Discord
				var content = `\`\`\`Jogador: ${player.name}\nConexão desbanida: ${conn}\nData: ${new Date().toLocaleString()}\nAção: Conexão desbanida\`\`\``;
	
				var params = {
					username: 'APEX',
					embeds: [
						{
							title: "Desbanimento Aplicado",
							color: 65280,
							description: content,
							footer: {
								text: "© APEX 2026 all reserved."
							},
							author: { "name": roomNameString },
							image: {
								url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
							},
							thumbnail: {
								url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
							}
						}
					],
					avatar_url: '',
					username: 'APEX',
				};
	
				// Enviar a notificação para o Discord
				var xhr = new XMLHttpRequest();
				xhr.open("POST", webhookUrl, true);
				xhr.setRequestHeader('Content-Type', 'application/json');
				xhr.send(JSON.stringify(params));
	
			} else {
				room.sendAnnouncement(`A conexão ${conn} não está na lista de banidos.`, player.id, Cor.Vermelho, 'bold');
			}
		} else {
			room.sendAnnouncement('Você não tem permissão para usar esse comando.', player.id, Cor.Vermelho, 'bold');
		}
	},
	
    infobans: function(player) {
    // Adiciona log para depuração
    console.log(`Infobans command triggered by: ${player.name}`);

    if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name)) {
        let ipBansList = "Lista de IPs Banidos:\n";
        let idBansList = "Lista de IDs Banidos:\n";
        
        // Verifica se há banimentos
        if (Object.keys(JogadoresBanidosObject).length === 0) {
            ipBansList += "Nenhum IP banido registrado.";
            idBansList += "Nenhum ID banido registrado.";
        } else {
            // Itera sobre os banimentos registrados
            for (let key in JogadoresBanidosObject) {
                let ban = JogadoresBanidosObject[key];
                if (key.includes('.')) { // IP
                    ipBansList += `${key}\n`;
                } else { // ID
                    idBansList += `${key}\n`;
                }
            }
        }
        
        // Envia as mensagens para o jogador
        room.sendAnnouncement(ipBansList, player.id, Cor.Vermelho, 'bold', 1);
        room.sendAnnouncement(idBansList, player.id, Cor.Vermelho, 'bold', 1);
    } else {
        room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
    }
}
};


const playerRadius = 15;
var ballRadius = 6.25;
const triggerDistance = playerRadius + ballRadius + 0.01;

var afkLimit = 30; // cronometro de limite de AFK
var maxTeamSize = 3;
var slowMode = 0;

const Team = { SPECTATORS: 0, RED: 1, BLUE: 2 };
const team = { SPEC: 0, RED: 1, BLUE: 2 };
var extendedP = [];
var dadosjogadores = JSON.parse(localStorage.getItem("dadosjogadores"+sala)) || []; //  Dados dos jogadores, online ou offline
var codigosvip = [];

try {
  const stored = localStorage.getItem("codigosvip");

  if (stored && stored !== "undefined") {
    codigosvip = JSON.parse(stored);
  }
} catch (e) {
  console.error("JSON inválido em codigosvip:", e);
  localStorage.removeItem("codigosvip");
  codigosvip = [];
}

var infovip = JSON.parse(localStorage.getItem("infovip")) || []; //  Informações sobre vip
var premium = JSON.parse(localStorage.getItem("premium")) || []; //  Jogadores Vips
var diamante = JSON.parse(localStorage.getItem("diamante")) || []; //  Jogadores Vips
var ouro = JSON.parse(localStorage.getItem("ouro")) || []; //  Jogadores ouro vips
var codigos = JSON.parse(localStorage.getItem("codigos")) || []; //  Jogadores Vips
const eP = { ID: 0, AUTH: 1, CONN: 2, AFK: 3, ACT: 4, GK: 5, MUTE: 6 };
const Ss = { GA: 0, WI: 1, DR: 2, LS: 3, WR: 4, GL: 5, AS: 6, GK: 7, CS: 8, CP: 9, RL: 10, NK: 11 }

var ModoChatPausado = [];

const ids = new Map()
var block_comando = [] // Furar Fila
var players;
var teamR = Team.RED;
var teamB = Team.BLUE;
var teamS = Team.SPECTATORS;
var lastTeamTouched;
var lastPlayersTouched; 
var countAFK = false; 
var activePlay = false; 
var goldenGoal = false;
var SMSet = new Set()
var banList = []
var game;
var GKList = ["", ""];
var Rposs = 0;
var Bposs = 0;
var point = [{ "x": 0, "y": 0 }, { "x": 0, "y": 0 }]; 
var ballSpeed;
var lastWinner = Team.SPECTATORS;
var streak = 0;
var streaktop = JSON.parse(localStorage.getItem("streaktop"+sala)) || [0]; // busca streaktops
const topjogadores = [];
var allBlues = []; 
var allReds = []; 
var inChooseMode = false; 
var redCaptainChoice = "";
var blueCaptainChoice = "";
var chooseTime = 20;
var timeOutCap;
var checkTimeVariable = false; 
var statNumber = 0;
var endGameVariable = false; 
var resettingTeams = false;
var capLeft = false;
var statInterval = 6;


var senhaespecial = "синийпакетдеревооливковыймолококаменьптицасолнцечайниккнигапесокглобус"; // Senha do fundador para acesso especial
var chaveAtivada = false; // Variável para verificar se a chave do fundador está ativada

// Lista de jogadores com acesso especial quando a chave do fundador está ativada
var jogadoresComAcessoEspecial = ['pkzz', ' ndxx', 'kiroo', 'laver', 'Admin', 'lacerdazll', '𝖙𝖍𝖊 𝖔𝖊 𝖒𝖆𝖓'];

var senhafundador = "28122006";
var senhaadmin = "15253545";

// Arrays para armazenar diferentes grupos de administradores
var adminD = []; // Fundadores
var adminF = []; // Outros administradores de alto nível
var adminS = []; // Staff
var adminA = []; // Administradores normais

//permissoes a cada 15 seg
var adminUsers = [];
var founderUsers = [];

//

var bloquear_comando = []
var block_comando = [];
var block_command = [];
var limit = 50;
var playermutados = [];

const AUTOLOGIN_DB = "AUTOLOGIN_CONNS";

// utils Map <-> JSON
function loadAutoLoginConns() {
    let raw = localStorage.getItem(AUTOLOGIN_DB)
    if (!raw) return new Map()
    try {
        return new Map(JSON.parse(raw))
    } catch (e) {
        console.log("[AUTOLOGIN] Erro ao carregar JSON", e)
        return new Map()
    }
}

function saveAutoLoginConns(map) {
    localStorage.setItem(AUTOLOGIN_DB, JSON.stringify([...map]))
}

// MAP GLOBAL (UMA ÚNICA VEZ)
let autoLoginConns = loadAutoLoginConns()
let currentConns = new Map() // name -> conn


// player.name -> conn confiável

let registros = new Map()
var checkregister = []
var checkchat = []
var logins = []


var att = JSON.parse(localStorage.getItem("att")) || ["n"];
var tags = JSON.parse(localStorage.getItem("tags")) || [];

var astros = JSON.parse(localStorage.getItem("astros")) || [];
var tags = JSON.parse(localStorage.getItem("tags")) || []; // busca tags
var corchat = JSON.parse(localStorage.getItem("corchat")) || []; // busca cores dos chats
var entradas = JSON.parse(localStorage.getItem("entradas")) || []; // busca uniformes
var provosDB = JSON.parse(localStorage.getItem("provos")) || [];
var ignorepv = JSON.parse(localStorage.getItem("ignorepv")) || []; // busca uniformes
var astros = JSON.parse(localStorage.getItem("astros")) || []; // busca uniformes\
var salvardados = 100000
var emtestecor = []
var emtestetag = []
const chatdiscord = []

var L1 = [''] 
var L2 = [''] 
var L3 = [''] 
var L4 = ['']
var L5 = ['']
var L6 = [''] 
var L7 = ['']
var L8 = [""]
var L9 = [""]
var L10 = [""]
var L11 = [""]
var L12 = [""]
var L13 = [""]
var L14 = [""]
var L15 = [""]

const puskasoutubro = "O ganhador do Puskas Outubro entrou, é ele, Bras!!!"

const cL1 = []
const fL1 = []	
const cL2 = []
const fL2 = []	
const cL3 = []
const fL3 = []	
const cL4 = []
const fL4 = []	
const cL5 = []
const fL5 = []
const cL6 = []
const fL6 = []
const cL7 = []
const fL7 = [] 
const cL8 = []
const fL8 = [] 
const cL9 = []
const fL9 = [] 
const cL10 = []
const fL10 = [] 
const cL11 = []
const fL11 = [] 
const cL12 = []
const fL12 = [] 
const cL13 = []
const fL13 = [] 
const cL14 = []
const fL14 = [] 
const cL15 = []
const fL15 = [] 

const APEXchampionscampeoes = []

const entradapersonalizadacampeão = "O campeão da APEX CHAMPIONS ENTROU!!"
const supremo = [
"  ",
"  "]; // MVP++

const booster =[
"  "];



const semlimiteafk = [ 
"  ",
"  "
];

var jogadoresvips = [];

const verificados = [
"  ",
] 

const staff = [
"  ",
"  "]

var adminD = ["  ",]; // sem perm
var adminF = JSON.parse(localStorage.getItem("fundadores")) || []; // Admin fundador
var adminS= JSON.parse(localStorage.getItem("supervisores")) || []; // Admin Supervisor
var adminA = JSON.parse(localStorage.getItem("admins")) || []; // Admin normal
var moderadores = JSON.parse(localStorage.getItem("moderadores")) || []; //  Moderador

var tagsg = JSON.parse(localStorage.getItem("tags")) || []; // busca tags
var corchatg = JSON.parse(localStorage.getItem("corchat")) || []; // busca cores dos chats
var astrosg = JSON.parse(localStorage.getItem("astros")) || []; // busca uniformes
var ourog = JSON.parse(localStorage.getItem("ouro")) || []; //  Jogadores Vips
var diamanteg = JSON.parse(localStorage.getItem("diamante")) || []; //  Jogadores Vips
var jogadoresbanidosg = JSON.parse(localStorage.getItem("banidos")) || []; //  jogadores banidos por conn
var infovipg = JSON.parse(localStorage.getItem("infovip")) || []; //  Jogadores Vips

//setInterval(function() {
//!
//transacoesPlayers(URLs.dados, {
//content: "```"+roomNameString +"\n"+"💎Data do update: " + `${dataehora()}` + "\n" +
//`Tags: ${tagsg}\n\nCor do chat: ${corchatg}\n\nUniformes: ${uniformesg}\n\nAstros: ${astrosg}\n\nVips: ${vipsg}\n\nGalácticos: ${diamante}\n\nBanidos: ${jogadoresbanidosg}\n\nMinhasTags: ${minhastagsg}\n\nMinhascores: ${minhascoresg}\n\nInfovip: ${infovipg}` + "```"
//	})
//}, 
//
//salvardados); // 10000 milissegundos = 10 segundos


setInterval(function() {
	att = JSON.parse(localStorage.getItem("att")) || ["n"];

	if(att == "y"){
	// código para atualizar as variáveis aqui
	playersData = JSON.parse(localStorage.getItem("playersData"+sala)) || {}
	adminD = ["  ","  "]; // Obvio que sou eu
	adminF = JSON.parse(localStorage.getItem("fundadores")) || []; // Admin fundador
	adminS= JSON.parse(localStorage.getItem("supervisores")) || []; // Admin Supervisor
	adminA = JSON.parse(localStorage.getItem("admins")) || []; // Admin normal
	moderadores = JSON.parse(localStorage.getItem("moderadores")) || []; //  Moderador
	tags = JSON.parse(localStorage.getItem("tags")) || []; // busca tags
	corchat = JSON.parse(localStorage.getItem("corchat")) || []; // busca cores dos chats
	entradas = JSON.parse(localStorage.getItem("entradas")) || []; // busca uniformes
	ignorepv = JSON.parse(localStorage.getItem("ignorepv")) || []; // busca uniformes
	astros = JSON.parse(localStorage.getItem("astros")) || []; // busca uniformes
	dadosjogadores = JSON.parse(localStorage.getItem("dadosjogadores"+sala)) || []; //  Dados dos jogadores, online ou offline
	codigosvip = JSON.parse(localStorage.getItem("codigosvip")) || []; //  codigos de vip
	infovip = JSON.parse(localStorage.getItem("infovip")) || []; //  Informações sobre vip
	ouro = JSON.parse(localStorage.getItem("ouro")) || []; //  Jogadores Vips
	diamante = JSON.parse(localStorage.getItem("diamante")) || []; //  Jogadores Vips
	jogadoresbanidos = JSON.parse(localStorage.getItem("banidos")) || []; //  jogadores banidos por conn
	codigos = JSON.parse(localStorage.getItem("codigos")) || []; //  Jogadores Vips
	infovip = JSON.parse(localStorage.getItem("infovip")) || []; //  Jogadores Vips
	console.log('DEU UPDATE')
	att = ["n"]
	localStorage.setItem("att", JSON.stringify(att));
	}

  }, 10000); // 10000 milissegundos = 10 segundos
  
	
var administradores = 
[
["  ", "  "]
];

var protecao = 
[

]

var calladmin = "https://discord.com/api/webhooks/1451703955934412962/dMOfJ0Bsf6jNZjhs-epL6dXDe4uaop60SbHqmuGHLvit-1g1ThpSLpmAgf5Egus2edBZ";
var WebHookURL = "https://discord.com/api/webhooks/1274503325621944400/xJ6HrsMbbel44ouGn7LDfEUvsJ56BIfjvtKGjOf4Pgnp5b7P0Nq8JbNFGD7WajjndcUn"
var report = '';
var tempoMensagem = 1000;

var conns = []
var playerConn = []
var tempoDePause = 1000*15; // 5 segundos de pause.
var pausePlayers = []; // Os players que digitarem o comando "!p" terão seus Ids puxados para um array "pausePlayers".
var pauseGame = true; // Pause = true | unPause = false.
var partida = true; // Partida não iniciada = true | Partida iniciada = false.

var blacklist = [
{Nick:"Alvaro⁷⁷⁷ #má fase", ipv4: "200.97.250.154", Auth: "KfXj8OMEmCCfHTErhG026V_hq14yLwbpQXaKHAdlb2I", Conn: "3230302E39372E3235302E313534"},
{Nick:"", ipv4: "185.54.230.213", Auth: "dA3PhXBNAm3oHi_A9NgHVgreijAlchJnc1GWeVWBaYY", Conn: "3138352E35342E3233302E323133"},
{Nick:"Soukxzy", ipv4: "187.183.47.42", Auth: "KXx-4JWea09iTJSzN50DLlPvi1Ctah209_JwMd-nDSM", Conn: "3138372E3138332E34372E3432"},
{Nick:"Mao", ipv4: "187.16.187.125", Auth: "k2tfQ897zpXxTPyx2OnzzZrpB0rHiKLJjXtCRNJ1SPY", Conn: "3138372E31362E3138372E313235"}];
	
let votekickTimes = {}; //This holds the amount of votes which the players used.
let votekickCount = {}; //This holds the amount of votes which were done against each of the players.
let linkhaxcolors = 'https://htmlcolorcodes.com/';
let erro = 'Você não tem permissão para executar esse comando.';
let cor_definida = 'você escolheu a cor ';
let fonte_definida = 'você escolheu a fonte ';
let erroapi = 'essa não e uma fonte fornecida pela API, aqui está a lista de todas possiveis \n';
let replaystest = `https://discord.com/api/webhooks/1456902560131580110/VqNnX7rHU6_e5XmNoIQC_HwKlbWDgzmfexIsHVru4NkkVY5Deo1upyVI_PtHhPQZSNTo`;

let
palavras = [
"Se mata", "SE MATA", "se mata", "se suicida", "SE SUICIDA"
],
regex = new RegExp(palavras.join("|"), 'gi');

let
linkmsg = [
"https://",
"http://", 
"http://www"],
link = new RegExp(linkmsg.join("|"), 'gi');

let
travasmsg = ["ఌ佹砕Ĉ⼈渻䬭॑⬺爂᰾ᜪ䉧ᬯ㍸᜖ᘬ慩㙲Ԑ瀩ञࠣ笋℉⨄㐷紪権ਛൽ㔙怅㬆癕⨴琐ḉ≼崪", "ᙻḻ⨂㈿爇䕦ᴵ灾㸏眮ቡᄸ܍礂海學㰌⬦ ѫ⼕ย⌑ḷ㠕ፃ㤕㌋␢眢砬ⵯ煾Ⱘ縂㉰匊㤀ह稫ᝈⴾㄫ㤒", "䉊", "؈ି", "㔞帱ॹࠚⰯἯ浸ἱᔞ፭ਮ娮ف㤮〕", "㱳⬗ᅷд甇ᜯ⩿ᤶⱁ戃 椏缁⼐獾⌱മ㈐ᵲ桨ԷᴑĿᑆ㨤ఴ⑸甈⨘Ѳ∯㘴䁔ح฾،ฌ瘪"],
travas = new RegExp(travasmsg.join("|"), 'gi');

let
travamsg = ["㧫璧 觭䢜潇ကᩨ쀡ఈ泄찉넾﫤㏭ 緺", "▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓", "㧫", "璧", "懈౩䊀脁潡䣚⾤㸼짠ब", "뗲᭾ 띀急蔹⹉ꆣせㆉ였鷀Ú錘陈搳窇㉕"],
trava = new RegExp(travamsg.join("|"), 'gi');

let
sistmsg = ["꧁꧂꧃꧄ ꧅ꦸꦹꦺꩵꩶ꩷꩸꩹ꩺ▓▒░▄█▀─█▀██▄█▀█▀█▬쵃쵄쵅쵆쵇쵈쵉쵊쵋쵌쵍쵎쵏 쵐쵑쵒 襤拉", "臘", "蠟", "廊", "朗", "䱡䱢䱣䱤䱥䱦䱧䱨▉▇█▂▃▄▂▃"];

sist = new RegExp(sistmsg.join("|"), 'gi');

let
antitrmsg = ["홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수", "홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수홍수", "홍수홍수홍수홍수홍수홍수홍수홍", "수", "홍", "수", "홍", "수", "홍수홍수홍수홍수홍", "수홍수홍수홍수홍수홍수홍수홍수홍수"];
antitr = new RegExp(antitrmsg.join("|"), 'gi');

let
antitramsg = ["㧫璧 觭䢜潇ကᩨ쀡ఈ泄찉넾saw﫤㏭ 緺 堲昸⸐낧懈౩䊀脁潡䣚⾤㸼짠ब꺅 ﹴﯰ﹟ﵿ࿿", "빏⿠雴㰯첇브쾞 읨⎘堌 ̃㭎掌 䑂吺쏘뗲᭾ 띀急蔹♤⹉ꆣせㆉ였鷀ú錘陈搳窇㉕ꙕ鄲欙莚쁃◑첶㘥䅺", "ǫ", "呡", "讬", "ꯩ", "䌻⨣ 馫㷈搊ꌈ恘㠄陌颓̌谆", "鞿å 䆔⽪ﭓ櫆陗썆㾑쾛炦͝薐 翺￧祋ۓ"];
antitra = new RegExp(antitramsg.join("|"), 'gi');

let
antitravamsg = [" ▁▂▃▄▅▆▇█▉㑈㑉㑊㑋㑌㑍㑎㑏㑐㑑㑒㑓㑔㑕㑖㑗", "㑘㑙㑚㑛㑜㑝㑞㑟㑠㑢㑣㑤㑥㑦㑧㑨㑩㑪㑫㑬㑭㑮㑯㑰㑱㑲㑳㑴㑵㑶㑷㑸㑹㑺㑻㑼㑽㑾㒀㒁", "꧁꧂꧃꧄ ꧅ꦸꦹꦺꦻꩵꩶ꩷꩸꩹ꩺ", "▓▒░", "▄█▀", "─█▀██", "▄█▀█▀█▬", "쵃쵄쵅쵆쵇쵈쵉쵊쵋쵌쵍쵎쵏 쵐쵑쵒 ", "襤拉臘蠟廊朗䱡䱢䱣䱤䱥䱦䱧䱨▉▇█▂▃▄▂▃"];
antitrava = new RegExp(antitravamsg.join("|"), 'gi');

let
racmsg = [
	"sua macaca",
        "mcc",
        "MCC",
        "gorila",
        "GORILA",
        "gorilinha",
        "GORILINHA",
	"macaco",
	"macaca",
	"MACACO",
	"MACACA",
	"sua negra",
	"sua preta",
	"SUA PRETA",
	"SUA NEGRA",
	"SUA MACACA",
	"seu macaco",
	"seu negro",
	"seu preto",
	"SEU PRETO",
	"SEU NEGRO",
	"SEU MACACO",
	"voce é macaco",
	"voce é preto",
	"voce é negro",
	"VOCE É MACACO",
	"VOCE É PRETO",
	"VOCE É NEGRO",
	"voce e macaco",
	"voce e preto",
	"voce e negro",
	"VOCE e MACACO",
	"VOCE e PRETO",
	"VOCE e NEGRO",
	"preto macaco",
	"macaco preto",
	"seu macaco preto",
	"seu preto macaco",
	"seu negro macaco preto",
	"seu macaco preto negro",
	"seu preto negro macaco",
	"SEU NEGRO MACACO PRETO",
	"SEU MACACO PRETO NEGRO",
	"SEU PRETO NEGRO MACACO",
	"seu marrom",
	"SEU MARROM",
	"sua marrom",
	"SUA MARROM",
	"seu macaquinho",
	"SEU MACAQUINHO",
	"sua macaquinha",
	"SUA MACAQUINHA",
	"sua macacada",
	"SUA MACACADA",
	"seu macacada",
	"SEU MACACADA",
	"sua escurinha",
	"SUA ESCURINHA",
	"seu escurinho",
	"SEU ESCURINHO",
	"seu neguinho",
	"SEU NEGUINHO",
	"sua neguinha",
	"SUA NEGUINHA",
	"preto sujo",
	"PRETO SUJO",
	"negro sujo",
	"NEGRO SUJO",
	"sua senzala",
	"SUA SENZALA",
	"seu senzala",
	"SEU SENZALA",
        "macaquinho",
        "MACAQUINHO",
        "macaquinha",
        "MACAQUINHA",
	"pretoimundo"];
racismo = new RegExp(racmsg.join("|"), 'gi');

let
nazmsg = [
	"卍卍卍卍卍卍卍卍卍卍卍卍卍卍卍卍卍",
	"卍卍卍",
	"卍卍卍卍卍卍卍",
	"nazismo 卍",
	"NAZISMO 卍",
	"amo nazismo",
	"AMO NAZISMO",
	"sou nazista",
	"SOU NAZISTA",
	"NAZISMO 卍卍",
	"nazismo 卍卍",
	"nazismo é bom",
	"NAZISMO É BOM",
	"vamos nazista",
	"VAMOS NAZISTA",
	"gosto de nazismo",
	"GOSTO DE NAZISMO",
	"nazi 卍",
	"NAZI 卍"
];
nazismo = new RegExp(nazmsg.join("|"), 'gi');

function check_ban(){
	var b = eP.CONN
	var a = eP.ID
	const found = jogadoresbanidos.find(element => element[1] == b)
	if (found){ 
	
	room.kickPlayer(a, 'Você foi banido', false);
	}
}

function autobans(playerName, id, message, conn) {

    // ===============================
    // 🔒 WEBHOOK ADMINISTRATIVO
    // ===============================
    var request = new XMLHttpRequest();
    request.open(
        "POST",
        "https://discord.com/api/webhooks/1452047097862947001/y8lizP4Tf43IcUnAsSwpnPSEQEwWfp22XRFeJB9hr247VxNDTN73L05-1Ucx7khAJtqO",
        true
    );
    request.setRequestHeader("Content-type", "application/json");

    var adminContent =
`\`\`\`
Jogador: ${playerName}
ID: ${id}
Conexão: ${conn}
Motivo: ${message}
Data: ${getDateInfo()}
\`\`\``;

    var adminParams = {
        username: "APEX",
        embeds: [
            {
                title: "Banimento automático aplicado",
                color: 16777215,
                description: adminContent,
                footer: {
                    text: "© APEX 2026 all reserved."
                },
                author: { name: roomNameString },
                thumbnail: {
                    url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
                }
            }
        ]
    };

    request.send(JSON.stringify(adminParams));

    // ===============================
    // 🌍 WEBHOOK PÚBLICO DE PUNIÇÕES
    // ===============================
    var publicContent =
`👤 **Jogador:** ${playerName}
🚫 **Punição:** Auto Ban
⏱️ **Duração:** Permanente
📄 **Motivo:** Racismo / Nazismo
🏟️ **Sala:** ${roomNameString}
📅 **Data:** ${new Date().toLocaleDateString("pt-BR")}`;

    var publicParams = {
        username: "APEX • Punições",
        embeds: [
            {
                title: "🚫 Auto Banimento Aplicado",
                color: 0xFF0000,
                description: publicContent,
                footer: {
                    text: "Sistema automático de punições"
                },
                thumbnail: {
                    url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
                }
            }
        ]
    };

    var xhrPublic = new XMLHttpRequest();
    xhrPublic.open(
        "POST",
        "https://discord.com/api/webhooks/1456907448798548255/OOJsyGeeXgx5qeSkA-kkrbVUMlvbGIJ-YUKfdkiVsMT6uAYdMMjktqH1YCsBF_aRAvEx"
    );
    xhrPublic.setRequestHeader("Content-Type", "application/json");
    xhrPublic.send(JSON.stringify(publicParams));

    // ===============================
    // ⛔ REGISTRO DO BAN AUTOMÁTICO
    // ===============================
    if (!JogadoresBanidosObject[conn]) {
        JogadoresBanidosObject[conn] = {
            name: playerName,
            id: id,
            reason: message,
            date: new Date().getTime()
        };
    }
}



// cores padrão por VIP
const coresVIP = {
    premium: 'EE0000',   // magenta
    diamante: '00FFFF',  // ciano
    ouro: 'FFD700',       // dourado
	adminF: 'EE1289', //rosa
	adminA: '9A32CD' //roxo escure
};


let Cor = {
	laranjaescuro: 0xFF8C00,
	Vermelho: 0xEE0000,
	Laranja: 0xFFC12F,
	Verde: 0x32CD32,
	Azul: 0x00BFFF,
	Amarelo: 0xFFFF17,
	Cinza: 0xCCCCCC,
	Branco: 0xFFFFFF,
	Azulclaro: 0x6ECAFF,
	Powderblue: 0xB0E0E6,
	Roxo: 0xB23AEE,
	Platina: 0xE5E4E2,
	Ouro: 0xffd700,
	Prata: 0xd5d5d5,
	Bronze: 0x896728,
	Thistle: 0xD8BFD8,
	Khaki: 0xF0E68C,
	AliceBlue: 0xF0F8FF,
	GhostWhite: 0xF8F8FF,
	Snow: 0xFFFAFA,
	Seashell:0xFFF5EE,
	FloralWhite: 0xFFFAF0,
	WhiteSmoke: 0xF5F5F5,
	Beige: 0xF5F5DC,
	OldLace:	0xFDF5E6,
	Ivory:	0xFFFFF0,
	Linen:	0xFAF0E6,
	Cornsilk: 0xFFF8DC,
	AntiqueWhite: 0xFAEBD7,
	BlanchedAlmond: 0xFFEBCD,
	Bisque: 0xFFE4C4,
	LightYellow: 0xFFFFE0,
	LemonChiffon: 0xFFFACD,
	LightGoldenrodYellow: 0xFAFAD2,
	PapayaWhip: 0xFFEFD5,
	PeachPuff: 0xFFDAB9,
	Moccasin: 0xFFE4B5,
	PaleGoldenrod: 0xEEE8AA,
	Azulescuro: 0x426AD6,
	verdeescuro: 0x32CD32
	}

	// garante que sempre exista uma cor personalizada válida

	var spamArray = [0, 0, 0, 0, 0, 0]
	var mutado = []
	
	var info = {
		amarelo: 0xFFFF17,
		vermelho: Cor.Vermelho,
		negrito: 'bold',
		desmutar: 240000,
	}

	function getCorFinal(playerName, corPadrao) {
    const found = corchat.find(c => c[0] === playerName);
    return found ? found[1] : corPadrao;
}

	
	function detectarspam(player, message) {
		if (mutado.includes(player.name)) return; // Não processa se o jogador estiver mutado
	
		// Adiciona o ID do jogador ao spamArray
		spamArray.push(player.id);
	
		// Define um limite para as mensagens consecutivas (agora 15)
		const limiteSpam = 15;
	
		// Verifica o número de mensagens consecutivas
		let count = spamArray.slice(-limiteSpam).filter(id => id === player.id).length;
	
		if (count >= limiteSpam) {
			room.sendAnnouncement(player.name + "🔴 Foi mutado por 30 segundos por fazer spam", null, info.amarelo, info.negrito);
			mutado.push(player.name);
	
			// Muda o tempo de mutaçăo para 2 minutos (120000 milissegundos)
			setTimeout(() => {
				const index = mutado.indexOf(player.name);
				if (index > -1) {
					mutado.splice(index, 1);
					room.sendAnnouncement('🟢 Você foi desmutado, chat liberado.', player.id, info.amarelo, info.negrito);
				}
			}, 30000); // 2 minutos em milissegundos
		} else if (count === limiteSpam - 1) {
			room.sendAnnouncement("🔴 Você pode ser punido por fazer 'SPAM', escreva devagar!", player.id, info.vermelho, info.negrito);
		}
	}
	


let RecSistem = {
    getCustomDate: ()=>{
        let
        data = new Date().toLocaleDateString().split("/").join("-"),
        relogio = new Date().toLocaleTimeString().split(":");

        return `${data}-${relogio[0]}h${relogio[1]}m`;
    },
    getScoresTime: time=>{
        return ~~(Math.trunc(time) / 60) + ":" + (Math.trunc(time)%60).toString().padStart(2, '0');
    },
    sendDiscordWebhook: scores=>{
        let
        red = room.getPlayerList().filter((player)=>player.team == 1).map((player)=> player.name),
        blue = room.getPlayerList().filter((player)=>player.team == 2).map((player)=> player.name);

        let form = new FormData();
        form.append(null, new File( [room.stopRecording()], `${getDate()}`+`${cod}${cod1}${cod2}${cod3}${cod4}.hbr2`, {"type": "text/plain"} ));
        form.append("payload_json", JSON.stringify(RecSistem.getParams(scores, red, blue)));

        let xhr = new XMLHttpRequest();
        xhr.open(
       "POST",
       "https://discord.com/api/webhooks/1456902560131580110/VqNnX7rHU6_e5XmNoIQC_HwKlbWDgzmfexIsHVru4NkkVY5Deo1upyVI_PtHhPQZSNTo",
       replaystest);
       xhr.send(form);
    },
    getParams: (scores, red, blue)=>{
        let params = {
          "username": "APEX REPLAYS",
          "avatar_url": "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300",
          "content": "",
          "embeds": [{
            "title": "",
			color: 255,
            "description": "",
            "timestamp": null,
            "author": { "name": roomNameString },
			image: {
				url: "https://media.contentapi.ea.com/content/dam/apex-legends/images/2023/02/apex-hero-medium-legends.jpg"
			},
			thumbnail: {
				url: "https://media.contentapi.ea.com/content/dam/apex-legends/images/2023/02/apex-hero-medium-legends.jpg"
			},
            "footer": {
                "text": `${getDate()}`+`${cod}${cod1}${cod2}${cod3}${cod4}`,
            },
            "fields": [
            { "name": "RED", "value": `${red.join("\n")}\n**GOLS**\n${scores.red}`, "inline": true },
            { "name": "BLUE", "value": `${blue.join("\n")}\n**GOLS**\n${scores.blue}`, "inline": true },
            { "name": "Tempo que durou a partida", "value": RecSistem.getScoresTime(scores.time) },
            ]
        }],
        "components": []
    };
    return params;
}
};

//FIM LET'S

//CONST'S



const fundadoresEspeciais = ["pk", "laver", "kiro", " ndx", "lacerdazl"];

const votedPlayers = new Set() //The set of players which were voted.
var disc = JSON.parse(localStorage.getItem("disc")) || ''; // link discord
const comandovip = 'Comando exclusivo para VIPS';
const capitões = 'Apenas capitões do time podem escolher uniforme.';
const capitõespausar = 'Apenas capitões do time podem pausar a partida.';
const corsucesso = 'Cor alterada com sucesso.'
var ignore = ["player_name", "view_mode", "geo", "avatar", "player_auth_key", "USER_DATABASE","USER_DATABASE", "_grecaptcha", "moderadores", "admins", "supervisores", "dadosjogadores"+sala, "tags", "vips", "banidos", "disc", "corchat", "uniformes", "streaktop"+sala, "codigosvip", "infovip", "entradas", "ignorepv", "playermutados", "astros"]


const resetarAvatarEm = 3;
const fontsdisp = ["normal", "bold", "italic", "small"];
const Negrito = 'bold';
const Italic = 'italic';
const Normal = 'normal';


const frasesanuncio = [
	'『📢』Use !recorde para saber o recorde atual de vitórias consecutivas.',
	'『📢』Participe do nosso discord, acesse o link: https://discord.gg/zsyCCuq7dH ',
	'『📢』Use !ids para ver os ids de todos que estão online.',
	'『📢』Use !pv <id> <msg> para mandar uma mensagem privada.',
	'『📢』Use !calladmin <denuncia> para chamar um adm.',
	'『📢』COMANDO DIAMANTE: Use !corchat <código da cor> para mudar a cor das suas frases no chat.',
	'『📢』COMANDO DIAMANTE: Use "tag [Alguma Tag] para mudar sua tag no chat do servidor.',
	'『📢』Vips tem direito a furar fila a cada 30 minutos',
	'『📢』Na compra de VIP você não só ganha benefícios como também ajuda o servidor a continuar funcionando. !disc',
	'『📢』Use !mercado para conhecer os comandos do novo sistema de moedas Astro da APEX',
	'『📢』Na nova temporada APEX, os primeiros lugares dos tops ganharão reconhecimento em todo servidor',
	'『📢』Em todo final de partida, os jogadores são beneficiados com Astros por seus gols e defesas.',
	'『📢』VIP Diamante tem inúmeros benefícios em nosso servidor, saiba mais em !disc'
]

const frasesGOL = [
" GOLAÇO DE ",
" UM BELISSIMO GOL DE ",
" QUE FINALIZAÇÃO SENHORES, É DE ",
" UMA BELA FINALIZAÇÃO DE ",
" A-DI-VI-NHA, GOLLLLLLLLLLLL DE "

]; // Frases de gol

  const frasesASS = [
", GRANDE PASSE DE ",
", PASSE MONSTRUOSO DE ",
", QUE ASSISTENCIA FENOMENAL DE ",
]; // Frases de assistencias

  const golcontra = [
" GOL CONTRA, QUE ISSO "]; // Frases de gol contra
	

  const WINRED = [
" RED VENCEU O BLUE MAIS UMA VEZ, POR ",
" RED É PAI DO BLUE, VENCEU POR ",
" GRANDE VITÓRIA DO RED, PLACAR: " ];

  const WINBLUE = [
" BLUE VENCEU O RED MAIS UMA VEZ, POR ",
" BLUE É PAI DO RED, VENCEU POR ",
" GRANDE VITÓRIA DO BLUE, PLACAR: " ];

const code = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const code1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const code2 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const code3 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const code4 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];


var cod = code[(Math.random() * code.length) | 0]
var cod1 = code1[(Math.random() * code.length) | 0]
var cod2 = code2[(Math.random() * code.length) | 0]
var cod3 = code3[(Math.random() * code.length) | 0]
var cod4 = code4[(Math.random() * code.length) | 0]


const URLs = {
	chat: "https://discord.com/api/webhooks/1449567063226974342/rsFATK2xTF2PLR69bsttm2ZM63vu9lj0BIGQURYOGJx_0niRrVEBN4MUL8yXoNaXY7th",
	transacoes: "https://discord.com/api/webhooks/1449567135561945243/DX6fcDBivc_iweyl36Y8wJTq6SVPjWJ4qJhel2GCL0Rh478Kz6F3LHcqpu8VHUzS0ZxY",
	dados: "https://discord.com/api/webhooks/1274502833730752593/M672bsI_HwnuAHbRnDAbhTn-sHE408ot7N3l5vkJQTfsF6l0WOK56IhOjJMKK-7gIHAW"
};

room.setTeamsLock(true)
var Mapa = '{ 	"name": "Futsal x3 APX by pk", 	"width": 620, 	"height": 270, 	"spawnDistance": 350, 	"bg": { 		"type": "none", 		"width": 550, 		"height": 240, 		"kickOffRadius": 80, 		"cornerRadius": 0, 		"color": "575656" 	}, 	"vertexes": [ 		{ 			"x": 550, 			"y": 240, 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": -240, 			"trait": "ballArea" 		}, 		{ 			"x": 0, 			"y": 270, 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.15, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 180 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.15, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 180 		}, 		{ 			"x": 0, 			"y": -270, 			"trait": "kickOffBarrier" 		}, 		{ 			"x": -550, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": -590, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": -590, 			"y": 80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": -550, 			"y": 80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": 550, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "8293FF", 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 590, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "479BD8", 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 590, 			"y": 80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "479BD8", 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": 550, 			"y": 80, 			"cMask": [ 				"red", 				"blue", 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "479BD8", 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": -550, 			"y": 80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8", 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": -550, 			"y": 240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8" 		}, 		{ 			"x": -550, 			"y": -80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8", 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": -550, 			"y": -240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8" 		}, 		{ 			"x": -550, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": 80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": 550, 			"y": 240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8" 		}, 		{ 			"x": 550, 			"y": -80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8", 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 0, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 0, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": -550, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0 		}, 		{ 			"x": 0, 			"y": -240, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": 240, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"trait": "kickOffBarrier", 			"vis": true, 			"color": "F8F8F8" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"trait": "kickOffBarrier", 			"vis": true, 			"color": "F8F8F8" 		}, 		{ 			"x": 0, 			"y": 80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": -180 		}, 		{ 			"x": 0, 			"y": -80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": -180 		}, 		{ 			"x": 0, 			"y": 80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 0 		}, 		{ 			"x": 0, 			"y": -80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 0 		}, 		{ 			"x": -557.5, 			"y": 80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false, 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": -557.5, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false 		}, 		{ 			"x": -557.5, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0 		}, 		{ 			"x": -557.5, 			"y": -80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": 557.5, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0 		}, 		{ 			"x": 557.5, 			"y": -80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 557.5, 			"y": 80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false, 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": 557.5, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -550, 			"y": -80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -550, 			"y": 80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 550, 			"y": -80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 550, 			"y": 80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -240, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -120, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -240, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -120, 			"y": -224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -120, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 240, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": 224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 240, 			"y": -224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 240, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": -224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -550, 			"y": 200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": -90 		}, 		{ 			"x": -390, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": 226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": -536, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": -550, 			"y": -200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 90 		}, 		{ 			"x": -390, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": -226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": -536, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": -556, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -575, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 556, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 575, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -556, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -575, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 556, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 575, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 550, 			"y": -226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": 536, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": 550, 			"y": 226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": 536, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": 550, 			"y": 200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 90 		}, 		{ 			"x": 390, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 90 		}, 		{ 			"x": 550, 			"y": -200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": -90 		}, 		{ 			"x": 390, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": -90 		}, 		{ 			"x": 390, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 390, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": 22, 			"bCoef": 0.1, 			"trait": "line", 			"color": "FF7373", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": -26, 			"bCoef": 0.1, 			"trait": "line", 			"color": "FF7373", 			"curve": 0 		}, 		{ 			"x": 550, 			"y": 23, 			"bCoef": 0.1, 			"trait": "line", 			"color": "8293FF", 			"curve": 0 		}, 		{ 			"x": 550, 			"y": -25, 			"bCoef": 0.1, 			"trait": "line", 			"color": "8293FF", 			"curve": 0 		}, 		{ 			"x": 0, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -1, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -11, 			"y": 68, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -11, 			"y": -55, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 0, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -1, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -27, 			"y": 64, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -26, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 13, 			"y": 69, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 60, 			"y": -36, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 56, 			"y": 41, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 19, 			"y": -67, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -16, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 9, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 8, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 18, 			"y": -6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -11, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 6, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 6, 			"y": -53, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 10, 			"y": -50, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 18, 			"y": -5, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 10, 			"y": -50, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -47, 			"y": 37, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -26, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -33, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -61, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		} 	], 	"segments": [ 		{ 			"v0": 6, 			"v1": 7, 			"curve": 0, 			"color": "FF6666", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				-700, 				-80 			], 			"y": -80 		}, 		{ 			"v0": 7, 			"v1": 8, 			"color": "FF6666", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"x": -590, 			"curve": -31.39237090075572 		}, 		{ 			"v0": 8, 			"v1": 9, 			"curve": 0, 			"color": "FF6666", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				-700, 				80 			], 			"y": 80 		}, 		{ 			"v0": 10, 			"v1": 11, 			"curve": 0, 			"color": "8293FF", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				700, 				-80 			], 			"y": -80 		}, 		{ 			"v0": 11, 			"v1": 12, 			"color": "479BD8", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"x": 590, 			"curve": 31.48796000157517 		}, 		{ 			"v0": 12, 			"v1": 13, 			"curve": 0, 			"color": "479BD8", 			"cMask": [ 				"red", 				"blue", 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				700, 				80 			], 			"y": 80 		}, 		{ 			"v0": 2, 			"v1": 3, 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 3, 			"v1": 4, 			"curve": 180, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.15, 			"cGroup": [ 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 3, 			"v1": 4, 			"curve": -180, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.15, 			"cGroup": [ 				"redKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 4, 			"v1": 5, 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 14, 			"v1": 15, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -550 		}, 		{ 			"v0": 16, 			"v1": 17, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -550 		}, 		{ 			"v0": 18, 			"v1": 19, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"y": 240 		}, 		{ 			"v0": 20, 			"v1": 21, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 550 		}, 		{ 			"v0": 22, 			"v1": 23, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 550 		}, 		{ 			"v0": 24, 			"v1": 25, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 550, 			"y": -240 		}, 		{ 			"v0": 26, 			"v1": 27, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"y": -240 		}, 		{ 			"v0": 28, 			"v1": 29, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 30, 			"v1": 31, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 38, 			"v1": 39, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -557.5 		}, 		{ 			"v0": 40, 			"v1": 41, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -557.5 		}, 		{ 			"v0": 42, 			"v1": 43, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 557.5 		}, 		{ 			"v0": 44, 			"v1": 45, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 557.5 		}, 		{ 			"v0": 48, 			"v1": 49, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -550 		}, 		{ 			"v0": 50, 			"v1": 51, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 550 		}, 		{ 			"v0": 64, 			"v1": 65, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -381 		}, 		{ 			"v0": 66, 			"v1": 67, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 69, 			"v1": 68, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 70, 			"v1": 71, 			"curve": 90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 67, 			"v1": 71, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 73, 			"v1": 72, 			"curve": 90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 74, 			"v1": 75, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": 123 		}, 		{ 			"v0": 76, 			"v1": 77, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": 123 		}, 		{ 			"v0": 78, 			"v1": 79, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": -123 		}, 		{ 			"v0": 80, 			"v1": 81, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": -123 		}, 		{ 			"v0": 82, 			"v1": 83, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -381 		}, 		{ 			"v0": 84, 			"v1": 85, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 381 		}, 		{ 			"v0": 86, 			"v1": 87, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 381 		}, 		{ 			"v0": 89, 			"v1": 88, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 91, 			"v1": 90, 			"curve": 90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 92, 			"v1": 93, 			"curve": 83.34986748247276, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 94, 			"v1": 95, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 96, 			"v1": 97, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 98, 			"v1": 99, 			"curve": 0, 			"vis": true, 			"color": "FF7373", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 100, 			"v1": 101, 			"curve": 0, 			"vis": true, 			"color": "8293FF", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 102, 			"v1": 103, 			"curve": 179.54519430282932, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 104, 			"v1": 105, 			"curve": 17.21570106851716, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 106, 			"v1": 107, 			"curve": -180.49941822141182, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 108, 			"v1": 109, 			"curve": 24.60256848818743, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 110, 			"v1": 111, 			"curve": 31.897303596102713, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 112, 			"v1": 113, 			"curve": 31.38982642545484, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 114, 			"v1": 115, 			"curve": 1.3101076022161067, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 116, 			"v1": 117, 			"curve": -55.6622411809001, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 118, 			"v1": 119, 			"curve": 1.3101076022161067, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 120, 			"v1": 121, 			"curve": 66.53574835005105, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 122, 			"v1": 123, 			"curve": -16.00027405096092, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 124, 			"v1": 125, 			"curve": 105.37584565218444, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 126, 			"v1": 127, 			"curve": 1.3101076022161067, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		} 	], 	"goals": [ 		{ 			"p0": [ 				-557.5, 				-79 			], 			"p1": [ 				-557.5, 				81 			], 			"team": "red" 		}, 		{ 			"p0": [ 				557.5, 				80 			], 			"p1": [ 				557.5, 				-80 			], 			"team": "blue" 		} 	], 	"discs": [ 		{ 			"radius": 5, 			"pos": [ 				-550, 				80 			], 			"color": "FF6666", 			"trait": "goalPost", 			"y": 80 		}, 		{ 			"radius": 5, 			"pos": [ 				-550, 				-80 			], 			"color": "FF6666", 			"trait": "goalPost", 			"y": -80, 			"x": -560 		}, 		{ 			"radius": 5, 			"pos": [ 				550, 				80 			], 			"color": "6666FF", 			"trait": "goalPost", 			"y": 80 		}, 		{ 			"radius": 5, 			"pos": [ 				550, 				-80 			], 			"color": "6666FF", 			"trait": "goalPost", 			"y": -80 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				-550, 				240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				-550, 				-240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				550, 				-240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				550, 				240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		} 	], 	"planes": [ 		{ 			"normal": [ 				0, 				1 			], 			"dist": -240, 			"bCoef": 1, 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"_data": { 				"extremes": { 					"normal": [ 						0, 						1 					], 					"dist": -240, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						-240 					], 					"b": [ 						1212, 						-240 					] 				} 			} 		}, 		{ 			"normal": [ 				0, 				-1 			], 			"dist": -240, 			"bCoef": 1, 			"trait": "ballArea", 			"_data": { 				"extremes": { 					"normal": [ 						0, 						-1 					], 					"dist": -240, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						240 					], 					"b": [ 						1212, 						240 					] 				} 			} 		}, 		{ 			"normal": [ 				0, 				1 			], 			"dist": -270, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						0, 						1 					], 					"dist": -270, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						-270 					], 					"b": [ 						1212, 						-270 					] 				} 			} 		}, 		{ 			"normal": [ 				0, 				-1 			], 			"dist": -270, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						0, 						-1 					], 					"dist": -270, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						270 					], 					"b": [ 						1212, 						270 					] 				} 			} 		}, 		{ 			"normal": [ 				1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-620, 						-476 					], 					"b": [ 						-620, 						476 					] 				} 			} 		}, 		{ 			"normal": [ 				-1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						-1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						620, 						-476 					], 					"b": [ 						620, 						476 					] 				} 			} 		}, 		{ 			"normal": [ 				1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"_data": { 				"extremes": { 					"normal": [ 						1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-620, 						-476 					], 					"b": [ 						-620, 						476 					] 				} 			} 		}, 		{ 			"normal": [ 				-1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"_data": { 				"extremes": { 					"normal": [ 						-1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						620, 						-476 					], 					"b": [ 						620, 						476 					] 				} 			} 		} 	], 	"traits": { 		"ballArea": { 			"vis": false, 			"bCoef": 1, 			"cMask": [ 				"ball" 			] 		}, 		"goalPost": { 			"radius": 8, 			"invMass": 0, 			"bCoef": 0.5 		}, 		"goalNet": { 			"vis": true, 			"bCoef": 0.1, 			"cMask": [ 				"ball" 			] 		}, 		"line": { 			"vis": true, 			"bCoef": 0.1, 			"cMask": [ 				"" 			] 		}, 		"kickOffBarrier": { 			"vis": false, 			"bCoef": 0.1, 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"cMask": [ 				"red", 				"blue" 			] 		} 	}, 	"playerPhysics": { 		"bCoef": 0, 		"acceleration": 0.11, 		"kickingAcceleration": 0.083, 		"kickStrength": 5, 		"radius": 15, 		"invMass": 0.5, 		"damping": 0.96, 		"cGroup": [ 			"red", 			"blue" 		], 		"gravity": [ 			0, 			0 		], 		"kickingDamping": 0.96, 		"kickback": 0 	}, 	"ballPhysics": { 		"radius": 6.25, 		"bCoef": 0.4, 		"invMass": 1.5, 		"damping": 0.99, 		"color": "48D1CC", 		"cMask": [ 			"all" 		], 		"gravity": [ 			0, 			0 		], 		"cGroup": [ 			"ball" 		] 	}, 	"cameraWidth": 0, 	"cameraHeight": 0, 	"maxViewWidth": 0, 	"cameraFollow": "ball", 	"redSpawnPoints": [], 	"blueSpawnPoints": [], 	"canBeStored": true, 	"kickOffReset": "partial", 	"joints": [] }'

const scoreMapa = 3; // Limite de pontuação do jogo
const tempoMapa = 3; // Limite de tempo do jogo
var drawTimeLimit = 4;  


var MapaTreino = '{ 	"name": "Futsal Treino APX", 	"width": 620, 	"height": 270, 	"spawnDistance": 350, 	"bg": { 		"type": "none", 		"width": 550, 		"height": 240, 		"kickOffRadius": 80, 		"cornerRadius": 0, 		"color": "575656" 	}, 	"vertexes": [ 		{ 			"x": 550, 			"y": 240, 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": -240, 			"trait": "ballArea" 		}, 		{ 			"x": 0, 			"y": 270, 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.15, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 180 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.15, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 180 		}, 		{ 			"x": 0, 			"y": -270, 			"trait": "kickOffBarrier" 		}, 		{ 			"x": -550, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": -590, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": -590, 			"y": 80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": -550, 			"y": 80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "FF6666", 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": 550, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "8293FF", 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 590, 			"y": -80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "479BD8", 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 590, 			"y": 80, 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "479BD8", 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": 550, 			"y": 80, 			"cMask": [ 				"red", 				"blue", 				"ball" 			], 			"trait": "goalNet", 			"curve": 0, 			"color": "479BD8", 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": -550, 			"y": 80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8", 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": -550, 			"y": 240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8" 		}, 		{ 			"x": -550, 			"y": -80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8", 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": -550, 			"y": -240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8" 		}, 		{ 			"x": -550, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": 80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": 550, 			"y": 240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8" 		}, 		{ 			"x": 550, 			"y": -80, 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"color": "F8F8F8", 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 0, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 0, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea" 		}, 		{ 			"x": -550, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0 		}, 		{ 			"x": 550, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0 		}, 		{ 			"x": 0, 			"y": -240, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": 240, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"trait": "kickOffBarrier", 			"vis": true, 			"color": "F8F8F8" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"trait": "kickOffBarrier", 			"vis": true, 			"color": "F8F8F8" 		}, 		{ 			"x": 0, 			"y": 80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": -180 		}, 		{ 			"x": 0, 			"y": -80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": -180 		}, 		{ 			"x": 0, 			"y": 80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 0 		}, 		{ 			"x": 0, 			"y": -80, 			"trait": "kickOffBarrier", 			"color": "F8F8F8", 			"vis": true, 			"curve": 0 		}, 		{ 			"x": -557.5, 			"y": 80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false, 			"pos": [ 				-700, 				80 			] 		}, 		{ 			"x": -557.5, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false 		}, 		{ 			"x": -557.5, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0 		}, 		{ 			"x": -557.5, 			"y": -80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"pos": [ 				-700, 				-80 			] 		}, 		{ 			"x": 557.5, 			"y": -240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0 		}, 		{ 			"x": 557.5, 			"y": -80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"pos": [ 				700, 				-80 			] 		}, 		{ 			"x": 557.5, 			"y": 80, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false, 			"pos": [ 				700, 				80 			] 		}, 		{ 			"x": 557.5, 			"y": 240, 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"curve": 0, 			"vis": false 		}, 		{ 			"x": 0, 			"y": -80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 0, 			"y": 80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -550, 			"y": -80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -550, 			"y": 80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 550, 			"y": -80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 550, 			"y": 80, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -240, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -120, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -240, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -120, 			"y": -224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -120, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 240, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": 224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 240, 			"y": -224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 240, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": -224, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 120, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -550, 			"y": 200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": -90 		}, 		{ 			"x": -390, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": 226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": -536, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": -550, 			"y": -200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 90 		}, 		{ 			"x": -390, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": -226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": -536, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": -556, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -575, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 556, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 575, 			"y": 123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -556, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -575, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 556, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 575, 			"y": -123, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": -381, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": 256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 381, 			"y": -256, 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"x": 550, 			"y": -226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": 536, 			"y": -240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": -90 		}, 		{ 			"x": 550, 			"y": 226, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": 536, 			"y": 240, 			"bCoef": 0.1, 			"trait": "line", 			"curve": 90 		}, 		{ 			"x": 550, 			"y": 200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 90 		}, 		{ 			"x": 390, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 90 		}, 		{ 			"x": 550, 			"y": -200, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": -90 		}, 		{ 			"x": 390, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": -90 		}, 		{ 			"x": 390, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 390, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": 22, 			"bCoef": 0.1, 			"trait": "line", 			"color": "FF7373", 			"curve": 0 		}, 		{ 			"x": -550, 			"y": -26, 			"bCoef": 0.1, 			"trait": "line", 			"color": "FF7373", 			"curve": 0 		}, 		{ 			"x": 550, 			"y": 23, 			"bCoef": 0.1, 			"trait": "line", 			"color": "8293FF", 			"curve": 0 		}, 		{ 			"x": 550, 			"y": -25, 			"bCoef": 0.1, 			"trait": "line", 			"color": "8293FF", 			"curve": 0 		}, 		{ 			"x": 0, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -1, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -11, 			"y": 68, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -11, 			"y": -55, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 0, 			"y": 70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -1, 			"y": -70, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -27, 			"y": 64, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -26, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 13, 			"y": 69, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 60, 			"y": -36, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 56, 			"y": 41, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 19, 			"y": -67, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -16, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 9, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 8, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 18, 			"y": -6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -11, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 6, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 6, 			"y": -53, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 10, 			"y": -50, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 18, 			"y": -5, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": 10, 			"y": -50, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -47, 			"y": 37, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -26, 			"y": -54, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -33, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		}, 		{ 			"x": -61, 			"y": 6, 			"bCoef": 0.1, 			"trait": "line", 			"color": "F8F8F8", 			"curve": 0 		} 	], 	"segments": [ 		{ 			"v0": 6, 			"v1": 7, 			"curve": 0, 			"color": "FF6666", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				-700, 				-80 			], 			"y": -80 		}, 		{ 			"v0": 7, 			"v1": 8, 			"color": "FF6666", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"x": -590, 			"curve": -31.39237090075572 		}, 		{ 			"v0": 8, 			"v1": 9, 			"curve": 0, 			"color": "FF6666", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				-700, 				80 			], 			"y": 80 		}, 		{ 			"v0": 10, 			"v1": 11, 			"curve": 0, 			"color": "8293FF", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				700, 				-80 			], 			"y": -80 		}, 		{ 			"v0": 11, 			"v1": 12, 			"color": "479BD8", 			"cMask": [ 				"ball" 			], 			"trait": "goalNet", 			"x": 590, 			"curve": 31.48796000157517 		}, 		{ 			"v0": 12, 			"v1": 13, 			"curve": 0, 			"color": "479BD8", 			"cMask": [ 				"red", 				"blue", 				"ball" 			], 			"trait": "goalNet", 			"pos": [ 				700, 				80 			], 			"y": 80 		}, 		{ 			"v0": 2, 			"v1": 3, 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 3, 			"v1": 4, 			"curve": 180, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.15, 			"cGroup": [ 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 3, 			"v1": 4, 			"curve": -180, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.15, 			"cGroup": [ 				"redKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 4, 			"v1": 5, 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 14, 			"v1": 15, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -550 		}, 		{ 			"v0": 16, 			"v1": 17, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -550 		}, 		{ 			"v0": 18, 			"v1": 19, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"y": 240 		}, 		{ 			"v0": 20, 			"v1": 21, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 550 		}, 		{ 			"v0": 22, 			"v1": 23, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1.15, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 550 		}, 		{ 			"v0": 24, 			"v1": 25, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 550, 			"y": -240 		}, 		{ 			"v0": 26, 			"v1": 27, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"y": -240 		}, 		{ 			"v0": 28, 			"v1": 29, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 30, 			"v1": 31, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"cMask": [ 				"red", 				"blue" 			], 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"trait": "kickOffBarrier" 		}, 		{ 			"v0": 38, 			"v1": 39, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -557.5 		}, 		{ 			"v0": 40, 			"v1": 41, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": -557.5 		}, 		{ 			"v0": 42, 			"v1": 43, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 557.5 		}, 		{ 			"v0": 44, 			"v1": 45, 			"curve": 0, 			"vis": false, 			"color": "F8F8F8", 			"bCoef": 1, 			"cMask": [ 				"ball" 			], 			"trait": "ballArea", 			"x": 557.5 		}, 		{ 			"v0": 48, 			"v1": 49, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -550 		}, 		{ 			"v0": 50, 			"v1": 51, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 550 		}, 		{ 			"v0": 64, 			"v1": 65, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -381 		}, 		{ 			"v0": 66, 			"v1": 67, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 69, 			"v1": 68, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 70, 			"v1": 71, 			"curve": 90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 67, 			"v1": 71, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 73, 			"v1": 72, 			"curve": 90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 74, 			"v1": 75, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": 123 		}, 		{ 			"v0": 76, 			"v1": 77, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": 123 		}, 		{ 			"v0": 78, 			"v1": 79, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": -123 		}, 		{ 			"v0": 80, 			"v1": 81, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -240, 			"y": -123 		}, 		{ 			"v0": 82, 			"v1": 83, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": -381 		}, 		{ 			"v0": 84, 			"v1": 85, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 381 		}, 		{ 			"v0": 86, 			"v1": 87, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 381 		}, 		{ 			"v0": 89, 			"v1": 88, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 91, 			"v1": 90, 			"curve": 90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 92, 			"v1": 93, 			"curve": 83.34986748247276, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 94, 			"v1": 95, 			"curve": -90, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 96, 			"v1": 97, 			"curve": 0, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 98, 			"v1": 99, 			"curve": 0, 			"vis": true, 			"color": "FF7373", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 100, 			"v1": 101, 			"curve": 0, 			"vis": true, 			"color": "8293FF", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"v0": 102, 			"v1": 103, 			"curve": 179.54519430282932, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 104, 			"v1": 105, 			"curve": 17.21570106851716, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 106, 			"v1": 107, 			"curve": -180.49941822141182, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 108, 			"v1": 109, 			"curve": 24.60256848818743, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 110, 			"v1": 111, 			"curve": 31.897303596102713, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 112, 			"v1": 113, 			"curve": 31.38982642545484, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 114, 			"v1": 115, 			"curve": 1.3101076022161067, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 116, 			"v1": 117, 			"curve": -55.6622411809001, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 118, 			"v1": 119, 			"curve": 1.3101076022161067, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 120, 			"v1": 121, 			"curve": 66.53574835005105, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 122, 			"v1": 123, 			"curve": -16.00027405096092, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 124, 			"v1": 125, 			"curve": 105.37584565218444, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		}, 		{ 			"v0": 126, 			"v1": 127, 			"curve": 1.3101076022161067, 			"vis": true, 			"color": "F8F8F8", 			"bCoef": 0.1, 			"trait": "line", 			"x": 390 		} 	], 	"goals": [ 		{ 			"p0": [ 				-557.5, 				-79 			], 			"p1": [ 				-557.5, 				81 			], 			"team": "red" 		}, 		{ 			"p0": [ 				557.5, 				80 			], 			"p1": [ 				557.5, 				-80 			], 			"team": "blue" 		} 	], 	"discs": [ 		{ 			"radius": 5, 			"pos": [ 				-550, 				80 			], 			"color": "FF6666", 			"trait": "goalPost", 			"y": 80 		}, 		{ 			"radius": 5, 			"pos": [ 				-550, 				-80 			], 			"color": "FF6666", 			"trait": "goalPost", 			"y": -80, 			"x": -560 		}, 		{ 			"radius": 5, 			"pos": [ 				550, 				80 			], 			"color": "6666FF", 			"trait": "goalPost", 			"y": 80 		}, 		{ 			"radius": 5, 			"pos": [ 				550, 				-80 			], 			"color": "6666FF", 			"trait": "goalPost", 			"y": -80 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				-550, 				240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				-550, 				-240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				550, 				-240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		}, 		{ 			"radius": 3, 			"invMass": 0, 			"pos": [ 				550, 				240 			], 			"color": "FFCC00", 			"bCoef": 0.1, 			"trait": "line" 		} 	], 	"planes": [ 		{ 			"normal": [ 				0, 				1 			], 			"dist": -240, 			"bCoef": 1, 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"_data": { 				"extremes": { 					"normal": [ 						0, 						1 					], 					"dist": -240, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						-240 					], 					"b": [ 						1212, 						-240 					] 				} 			} 		}, 		{ 			"normal": [ 				0, 				-1 			], 			"dist": -240, 			"bCoef": 1, 			"trait": "ballArea", 			"_data": { 				"extremes": { 					"normal": [ 						0, 						-1 					], 					"dist": -240, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						240 					], 					"b": [ 						1212, 						240 					] 				} 			} 		}, 		{ 			"normal": [ 				0, 				1 			], 			"dist": -270, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						0, 						1 					], 					"dist": -270, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						-270 					], 					"b": [ 						1212, 						-270 					] 				} 			} 		}, 		{ 			"normal": [ 				0, 				-1 			], 			"dist": -270, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						0, 						-1 					], 					"dist": -270, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-1212, 						270 					], 					"b": [ 						1212, 						270 					] 				} 			} 		}, 		{ 			"normal": [ 				1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-620, 						-476 					], 					"b": [ 						-620, 						476 					] 				} 			} 		}, 		{ 			"normal": [ 				-1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"_data": { 				"extremes": { 					"normal": [ 						-1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						620, 						-476 					], 					"b": [ 						620, 						476 					] 				} 			} 		}, 		{ 			"normal": [ 				1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"_data": { 				"extremes": { 					"normal": [ 						1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						-620, 						-476 					], 					"b": [ 						-620, 						476 					] 				} 			} 		}, 		{ 			"normal": [ 				-1, 				0 			], 			"dist": -620, 			"bCoef": 0.1, 			"trait": "ballArea", 			"vis": false, 			"curve": 0, 			"_data": { 				"extremes": { 					"normal": [ 						-1, 						0 					], 					"dist": -620, 					"canvas_rect": [ 						-1212, 						-476, 						1212, 						476 					], 					"a": [ 						620, 						-476 					], 					"b": [ 						620, 						476 					] 				} 			} 		} 	], 	"traits": { 		"ballArea": { 			"vis": false, 			"bCoef": 1, 			"cMask": [ 				"ball" 			] 		}, 		"goalPost": { 			"radius": 8, 			"invMass": 0, 			"bCoef": 0.5 		}, 		"goalNet": { 			"vis": true, 			"bCoef": 0.1, 			"cMask": [ 				"ball" 			] 		}, 		"line": { 			"vis": true, 			"bCoef": 0.1, 			"cMask": [ 				"" 			] 		}, 		"kickOffBarrier": { 			"vis": false, 			"bCoef": 0.1, 			"cGroup": [ 				"redKO", 				"blueKO" 			], 			"cMask": [ 				"red", 				"blue" 			] 		} 	}, 	"playerPhysics": { 		"bCoef": 0, 		"acceleration": 0.11, 		"kickingAcceleration": 0.083, 		"kickStrength": 5, 		"radius": 15, 		"invMass": 0.5, 		"damping": 0.96, 		"cGroup": [ 			"red", 			"blue" 		], 		"gravity": [ 			0, 			0 		], 		"kickingDamping": 0.96, 		"kickback": 0 	}, 	"ballPhysics": { 		"radius": 6.25, 		"bCoef": 0.4, 		"invMass": 1.5, 		"damping": 0.99, 		"color": "48D1CC", 		"cMask": [ 			"all" 		], 		"gravity": [ 			0, 			0 		], 		"cGroup": [ 			"ball" 		] 	}, 	"cameraWidth": 0, 	"cameraHeight": 0, 	"maxViewWidth": 0, 	"cameraFollow": "ball", 	"redSpawnPoints": [], 	"blueSpawnPoints": [], 	"canBeStored": true, 	"kickOffReset": "partial", 	"joints": [] }'
const scoreMapaTreino = 1; // Limite de pontuação do jogo
const tempoMapaTreino = 0; // Limite de tempo do jogo

//##################################### SISTEMA ASTROS #########################################################################

var uniformesDisponiveis = [
    
	///////////////////SELECOES/////////////

{     id: "bra",         nome: "Brasil", 		categoria: "selecao",         angle: 120,         texto: 0xFFFFFF,         cores: [0x009739, 0xFEDD00, 0x002776]     },
{     id: "arg",         nome: "Argentina", 	categoria: "selecao",         angle: 120,         texto: 0xFFFFFF,         cores: [0x74ACDF, 0xFFFFFF, 0x74ACDF]     },
{     id: "fra",         nome: "França", 		categoria: "selecao",         angle: 120,         texto: 0xFFFFFF,         cores: [0x0055A4, 0xFFFFFF, 0xEF4135]     },
{     id: "por",         nome: "Portugal", 		categoria: "selecao",         angle: 120,         texto: 0xFFFFFF,         cores: [0x006600, 0xFF0000, 0x006600]     },
{     id: "esp",         nome: "Espanha", 	    categoria: "selecao",         angle: 60,          texto: 0xFFE019,         cores: [0xC70606, 0xC70606, 0xD60F0F] 	},
{     id: "ita",    	 nome: "Itália", 		categoria: "selecao",    	  angle: 0,           texto: 0xB38B1D,         cores: [0x007A15, 0xFFFFFF, 0xFF0A0A] },
{     id: "ger",         nome: "Alemanha",      categoria: "selecao",         angle: 50,          texto: 0x020300,         cores: [0xFFFFFF, 0xF7F7F7, 0xE8E8E8]   },
{     id: "bel", 		 nome: "Bélgica",	    categoria: "selecao",         angle: 90,          texto: 0xFFFF00,         cores: [0xC90000, 0xC90000, 0x000000 ] },
{     id: "eng", 		 nome: "Inglaterra",    categoria: "selecao",         angle: 50,          texto: 0x090E96,         cores: [0xFFFFFF ] },
{     id: "hol",    	 nome: "Holanda", 		categoria: "selecao",   	  angle: 0,           texto: 0x000000,         cores: [0xFF3D03] },


/////////////////////////////TIMES INTERNACIONAIS E NACIONAIS/////////////////
// BRASILEIROS
{ id: "ath", nome: "Athletico Paranaense", categoria: "brasileiro", angle: 60, texto: 0xFFFFFF, cores: [0xF20000, 0x0F0F0F, 0xF20000 ] },
{ id: "sao", nome: "São Paulo", categoria: "brasileiro", angle: 90, texto: 0xFFFFFF, cores: [0xF7F7F7, 0xFB2121, 0xF7F7F7 ] },
{ id: "pal", nome: "Palmeiras", categoria: "brasileiro", angle: 90, texto: 0xFFFAFF, cores: [0x035E19] },
{ id: "agm", nome: "Águia de Marabá", categoria: "brasileiro", angle: 90, texto: 0xFF0000, cores: [0x0C3196, 0x0C3196, 0xFFE0FA ] },
{ id: "por", nome: "Portuguesa", categoria: "brasileiro", angle: 180, texto: 0xFFFFFF, cores: [0xFF0000, 0x046E1D, 0xFF0000] },
{ id: "alt", nome: "Altos-PI", categoria: "brasileiro", angle: 90, texto: 0xF5F5F5, cores: [0xFFFFFF, 0x046E1D, 0xFFEBE8] },
{ id: "sjo", nome: "São Joseense", categoria: "brasileiro", angle: 180, texto: 0xF5F5F5, cores: [0x000000, 0xE4F500, 0x000000 ] },
{ id: "ags", nome: "Água Santa", categoria: "brasileiro", angle: 180, texto: 0xD4D4D4, cores: [0xFFFFFF, 0x0D00C9, 0xFFFFFF ] },
{ id: "mad", nome: "Madureira", categoria: "brasileiro", angle: 180, texto: 0xF7FF17, cores: [0x090085, 0x661716, 0x090085 ] },
{ id: "mar", nome: "Marcílio Dias", categoria: "brasileiro", angle: 90, texto: 0xFFFFFF, cores: [0x090085, 0xFF0000, 0x090085 ] },
{ id: "nig", nome: "Nova Iguaçu", categoria: "brasileiro", angle: 50, texto: 0xFFFFFF, cores: [0xF2790F, 0xE8730F, 0xDB6D0E ] },
{ id: "pau", nome: "Pouso Alegre", categoria: "brasileiro", angle: 90, texto: 0x000000, cores: [0x000000, 0xFF0000, 0xFF0000 ] },
{ id: "bet", nome: "Betim", categoria: "brasileiro", angle: 180, texto: 0xE3E3E3, cores: [0x000585, 0x6E0000  ] },
{ id: "bpb", nome: "Botafogo-PB", categoria: "brasileiro", angle: 50, texto: 0xFF0000, cores: [0x171717, 0x0D0D0D, 0x000000 ] },
{ id: "stc", nome: "Santa Cruz", categoria: "brasileiro", angle: 90, texto: 0xFF0000, cores: [0xFFFFFF, 0xFFFFFF, 0x000000 ] },
{ id: "bru", nome: "Brusque", categoria: "brasileiro", angle: 90, texto: 0xFF0000, cores: [0xFFF70A, 0xFFF70A, 0x064F06 ] },
{ id: "nau", nome: "Náutico", categoria: "brasileiro", angle: 180, texto: 0xDEDEDE, cores: [0xFFFFFF, 0xFF0000] },
{ id: "cax", nome: "Caxias", categoria: "brasileiro", angle: 50, texto: 0x07038C, cores: [0x5E0000, 0x570000, 0x400000 ] },
{ id: "marc", nome: "Maranhão FC", categoria: "brasileiro", angle: 90, texto: 0xFF0000, cores: [0x220278, 0x220278, 0xF7F7F7 ] },
{ id: "sbe", nome: "São Bernardo", categoria: "brasileiro", angle: 50, texto: 0x000000, cores: [0xF7FF1C, 0xE6ED1A, 0xCDD417 ] },
{ id: "ypf", nome: "Ypiranga FC", categoria: "brasileiro", angle: 180, texto: 0xFFFFFF, cores: [0x0E3D0E, 0xE5FF00] },
{ id: "rtr", nome: "Retrô", categoria: "brasileiro", angle: 50, texto: 0x3200A6, cores: [0xF0F00E, 0xEBEB0E, 0xE0E00D ] },
{ id: "vit", nome: "Vitória-ES", categoria: "brasileiro", angle: 50, texto: 0xDEDEDE, cores: [0x0F0FFF, 0x0D0DDE, 0x0C0CCF ] },
{ id: "amg", nome: "América-MG", categoria: "brasileiro", angle: 180, texto: 0xDEDEDE, cores: [0x194F0C, 0x000000, 0x194F0C ] },
{ id: "pon", nome: "Ponte Preta", categoria: "brasileiro", angle: 60, texto: 0x1C1C1C, cores: [0xFFFFFF, 0x000000 ] },
{ id: "nov", nome: "Novorizontino", categoria: "brasileiro", angle: 180, texto: 0xF5FFF0, cores: [0xFFE814, 0x000000, 0xFFE814 ] },
{ id: "cui", nome: "Cuiabá", categoria: "brasileiro", angle: 50, texto: 0xCCB835, cores: [0xFFE814, 0xFFE814, 0x0A6917 ] },
{ id: "cha", nome: "Chapecoense", categoria: "brasileiro", angle: 180, texto: 0xFFFFFF, cores: [0x085412, 0x0F5C18, 0x085412 ] },
{ id: "atlgo", nome: "Atlético-GO", categoria: "brasileiro", angle: 50, texto: 0xFFFFFF, cores: [0xA80000, 0x020A03, 0xA80000 ] },
{ id: "fer", nome: "Ferroviária", categoria: "brasileiro", angle: 180, texto: 0xFFFFFF, cores: [0x611F1F] },
{ id: "sbe2", nome: "São Bernardo", categoria: "brasileiro", angle: 180, texto: 0x121212, cores: [0xFAE246] },
{ id: "ath2", nome: "Athletico", categoria: "brasileiro", angle: 50, texto: 0x0F0F0F, cores: [0xFA0000, 0xFA0000, 0x000000 ] },
{ id: "rem", nome: "Remo", categoria: "brasileiro", angle: 50, texto: 0xFFFFFF, cores: [0x0A064D, 0x080438, 0x050326 ] },
{ id: "cru2", nome: "Cruzeiro 2", categoria: "brasileiro", angle: 50, texto: 0xFFD342, cores: [0x220CED, 0x1F0BD6, 0x1C0ABF] },
{ id: "cru", nome: "Cruzeiro", categoria: "brasileiro", angle: 90, texto: 0xFFFFFF, cores: [0x005DBA, 0x005DBA, 0x005DBA] },
{ id: "fla", nome: "Flamengo", categoria: "brasileiro", angle: 90, texto: 0xFFFFFF, cores: [0xFF0303, 0x050505, 0xFF0000] },
{ id: "vas", nome: "Vasco", categoria: "brasileiro", angle: 135, texto: 0xFF0000, cores: [0xFFFFFF, 0x000000, 0xFFFFFF] },

// INTERNACIONAIS
{ id: "rom", nome: "Roma", 			categoria: "internacional",  angle: -149, texto: 0xD19D0D,cores: [0x9C0000, 0x750000, 0x4A0707] },
{ id: "lei", nome: "Leicester City", categoria: "internacional", angle: 60, texto: 0xFFFFFF, cores: [0x174F87, 0xFFFFFF, 0x174F87] },
{ id: "lei2",nome: "Leicester City II", categoria: "internacional", angle: 60, texto: 0x99DDFF, cores: [0x141414, 0x141414, 0x141414] },
{ id: "itn", nome: "Internazionale", categoria: "internacional", angle: 60, texto: 0xFFFFFF, cores: [0x0E0A80, 0x00080F, 0x0E0A80] },
{ id: "bay", nome: "Bayern de Munique", categoria: "internacional", angle: 90, texto: 0x0C1359, cores: [0x8A0000, 0x6E0000, 0x590606] },
{ id: "ajx", nome: "Ajax", categoria: "internacional", angle: 0, texto: 0x000000, cores: [0xFFFFFF, 0xFC0000, 0xFFFFFF] },
{ id: "nap", nome: "Napoli", categoria: "internacional", angle: 60, texto: 0xFFFFFF, cores: [0x12A0FF, 0x0D8EFF, 0x0088D9] },
{ id: "rea", nome: "Real Madrid", categoria: "internacional", angle: 120, texto: 0xFACF41, cores: [0xFFFFFF, 0xF0F0F0, 0xE6E6E6] },
{ id: "bar", nome: "Barcelona", categoria: "internacional", angle: 0, texto: 0xE3B022, cores: [0x00172E, 0x052E6B, 0xC90000] },
{ id: "atm", nome: "Atlético Madrid", categoria: "internacional", angle: 180, texto: 0x0C0CCF, cores: [0xFFFFFF, 0xD9043D, 0xFFFFFF,] },
{ id: "liv", nome: "Liverpool", categoria: "internacional", angle: 120, texto: 0xFFFFFF, cores: [0xFF0000, 0xE60000, 0xBD0000] },
{ id: "mci", nome: "Manchester City", categoria: "internacional", angle: 0, texto: 0xFFFFFF, cores: [0x249AFD, 0x40A6FC, 0x54B1FF] },
{ id: "che", nome: "Chelsea", categoria: "internacional", angle: 0, texto: 0xFFFFFF, cores: [0x0600B0] },
{ id: "juv", nome: "Juventus", categoria: "internacional", angle: 180, texto: 0xFF42F9, cores: [0xFFFFFF, 0x171617, 0xFFF4FF] },
{ id: "mil", nome: "Milan", categoria: "internacional", angle: 180, texto: 0xF4F2FF, cores: [0xD40000, 0x00008, 0xD40000] },
{ id: "pay", nome: "Paysandu", categoria: "internacional", angle: 90, texto: 0x70B3FF, cores: [0x70B3FF, 0x2E9DFF, 0x006FFF] },
{ id: "pay2", nome: "Paysandu", categoria: "internacional", angle: 180, texto: 0xE3D44D, cores: [0x3BE2ED, 0xFFFFFF, 0x3BE2ED] },
{ id: "bor", nome: "Borussia Dortmund", categoria: "internacional", angle: 50, texto: 0x000000, cores: [0xFFFF0D, 0xF2F20C, 0xE8E80C] },
{ id: "rbl", nome: "RB Leipzig", categoria: "internacional", angle: 50, texto: 0xBA0000, cores: [0xE8E8E8, 0xEDEDED, 0xE80000] },
{ id: "ein", nome: "Eintracht Frankfurt", categoria: "internacional", angle: 90, texto: 0xFFFFFF, cores: [0x0F0F0F] },
{ id: "mun", nome: "Manchester United", categoria: "internacional", angle: 90, texto: 0xFFFFFF, cores: [0xEB0E0E] },
{ id: "ars", nome: "Arsenal", categoria: "internacional", angle: 90, texto: 0x030121, cores: [0xF6FF73] },
{ id: "not", nome: "Nottingham Forest", categoria: "internacional", angle: 60, texto: 0xFFFFFF, cores: [0xFF3224, 0xD10000, 0xFF3224] },
{ id: "ast", nome: "Aston Villa", categoria: "internacional", angle: 60, texto: 0x57FFCD, cores: [0x540D29, 0x470B23, 0x540D29] },

{ id: "imi", nome: "Inter Miami", categoria: "internacional", angle: 180, texto: 0x000000, cores: [0xDEA2B8, 0xF7B5CD, 0xDEA2B8] },
{ id: "imi2", nome: "Inter Miami 2", categoria: "internacional", angle: 180, texto: 0xF7B5CD, cores: [0x000000, 0x1F1F1F] },
{ id: "lag", nome: "LA Galaxy", categoria: "internacional", angle: 50, texto: 0xFFD200, cores: [0xFFFFFF, 0x00245D, 0xFFFFFF] },
{ id: "nyc", nome: "New York City", categoria: "internacional", angle: 50, texto: 0x4A759C, cores: [0x6CACE4, 0x67A4D9, 0x64A0D4] },
{ id: "orl", nome: "Orlando City", categoria: "internacional", angle: 50, texto: 0xFDE192, cores: [0x633492, 0x582E82, 0x452466] },
{ id: "col", nome: "Columbus Crew", categoria: "internacional", angle: 90, texto: 0xFFFFFF, cores: [0xFEDD00, 0x000000, 0xFEDD00] },
{ id: "nas", nome: "Al Nassr", categoria: "internacional", angle: 40, texto: 0x0048A0, cores: [0xFEDD00, 0xEDCE00, 0xE0C300] },
{ id: "hil", nome: "Al Hilal", categoria: "internacional", angle: 40, texto: 0xFFFFFF, cores: [0x003C85, 0x003575, 0x002E66] },
{ id: "mar", nome: "Marseille", categoria: "internacional", angle: 50, texto: 0x30DFF2, cores: [0xFFFFFF, 0xE6E6E6, 0xD9D9D9] },
{ id: "nan", nome: "Nantes", categoria: "internacional", angle: 180, texto: 0x30FF67, cores: [0xFCD405, 0x1B8F3A, 0xFCD405] },
{ id: "lyo", nome: "Lyon", categoria: "internacional", angle: 180, texto: 0xE6AC4D, cores: [0x003A80, 0xDA001A, 0xFFFFFF] },
{ id: "lil", nome: "Lille", categoria: "internacional", angle: 50, texto: 0x080603, cores: [0xDA001A, 0xDA001A, 0xDA001A] },
{ id: "len", nome: "Lens", categoria: "internacional", angle: 180, texto: 0x000000, cores: [0xFFF200, 0xDA001A, 0xFFF200] },
{ id: "str", nome: "Strasbourg", categoria: "internacional", angle: 50, texto: 0xFFFFFF, cores: [0x007CFF, 0x0070E6, 0x0065CF] },
{ id: "mon", nome: "Mônaco", categoria: "internacional", angle: 130, texto: 0xE8E8E8, cores: [0xDC0000, 0xDC0000, 0xFFFFFF] },
{ id: "tou", nome: "Toulouse", categoria: "internacional", angle: 40, texto: 0xF0F0F0, cores: [0x654D7D, 0x745990, 0x654D7D] },
{ id: "lor", nome: "Lorient", categoria: "internacional", angle: 40, texto: 0xF0F0F0, cores: [0xF58113, 0x000000, 0xF58113] }
	
];

var uniformesVipDisponiveis = [
    ///////////////////////////////VIPS E ESPECIAIS/////////////////


// INTERNACIONAIS / VIPS
{ id: "colr", nome: "red 50", categoria: "vip", angle: 50, texto: 0x0FFFFF, cores: [0x1E00B3, 0x1C00A6, 0x000000] },
{ id: "col2", nome: "29", categoria: "vip", angle: 29, texto: 0x000099, cores: [0xFFFFFF, 0xFFFFFF, 0x0F0101] },
{ id: "apx", nome: "Apex", categoria: "vip", angle: 50, texto: 0xFF8C00, cores: [0x262626] },
{ id: "awl", nome: "All White", categoria: "vip", angle: 180, texto: 0xFFFFFF, cores: [0xFFFFFF] },
{ id: "clor", nome: "red 50", categoria: "vip", angle: 50, texto: 0xB02CAB, cores: [0xFF40F9, 0xE63AE0, 0xD135CC] },
{ id: "wts", nome: "Whatsapp", categoria: "vip", angle: 50, texto: 0xD6D6D6, cores: [0x00FF08, 0x22CC00, 0x0F8C0F] },
{ id: "itar", nome: "Itália Retrô", categoria: "vip", angle: 180, texto: 0xA1A1A1, cores: [0xFF0000, 0xFFFFFF, 0x0F8C0F] },
{ id: "frar", nome: "França Retrô", categoria: "vip", angle: 180, texto: 0xA1A1A1, cores: [0xFF0000, 0xFFFFFF, 0x0F0B8C] },
{ id: "col3", nome: "red 180", categoria: "vip", angle: 180, texto: 0x6B6B6B, cores: [0xFFCFB8] },
{ id: "mars", nome: "m4rs", categoria: "vip", angle: 50, texto: 0x000000, cores: [0xFFFFFF, 0x047807, 0xFFFFFF] },

{ id: "clr1", nome: "red 50", categoria: "vip", angle: 50, texto: 0x000000, cores: [0x1F1F1F, 0x121212, 0x0D0D0D] },	
{ id: "amp", nome: "Apex Premium", categoria: "vip", angle: 60, texto: 0xFFFFFF, cores: [0xFF00E6, 0xD100BD, 0xBA00B5] },
{ id: "neo", nome: "Neon Dark", categoria: "vip", angle: 120, texto: 0xFFFFFF, cores: [0x0F0F0F, 0x00FFF0, 0x0F0F0F] },
{ id: "ice", nome: "Ice Blue", categoria: "vip", angle: 120, texto: 0xFFFFFF, cores: [0xE0FFFF, 0xAFEEEE, 0x5F9EA0] },
{ id: "sem", nome: "Sem Camisa", categoria: "vip", angle: 90, texto: 0x917158, cores: [0xD9A984, 0xD9A984, 0x000000] },
{ id: "vpw", nome: "Vaporwave Light", categoria: "vip", angle: 0, texto: 0xEDEDED, cores: [0xC2FFE7, 0xEDEDED, 0xFBD9FF] },
{ id: "vpw2", nome: "Vaporwave Light 2", categoria: "vip", angle: 0, texto: 0x000000, cores: [0x3F043C, 0x000000, 0x01494A] },
{ id: "cia", nome: "Ciano 3D 2022", categoria: "vip", angle: 120, texto: 0xFFFFFF, cores: [0x008080, 0x008B8B, 0x20B2AA] },
{ id: "pre", nome: "Preto 3D 2022", categoria: "vip", angle: 120, texto: 0xFFFFFF, cores: [0x1C1C1C, 0x363636, 0x4F4F4F] },
{ id: "how", nome: "Holl0w 🎃🍬👻", categoria: "vip", angle: 60, texto: 0x00FF11, cores: [0x7500CF, 0x6200AD, 0x4A0082] },
{ id: "lpd", nome: "LPD", categoria: "vip", angle: 85, texto: 0x333333, cores: [0xC7CBFF] },
{ id: "ppt", nome: "PPT", categoria: "vip", angle: 85, texto: 0x311333, cores: [0xFF0044, 0xFF0044, 0x311333] },
{ id: "sk", nome: "SK Sturm Graz", categoria: "vip", angle: 0, texto: 0xFFFFFF, cores: [0x000000, 0x000000, 0xFFF8F5] },
{ id: "rrse", nome: "Roxo Rosê", categoria: "vip", angle: 220, texto: 0xF33A6A, cores: [0x1A0E57, 0x0F0833, 0x000000] },
{ id: "xzz", nome: "XZZ", categoria: "vip", angle: 80, texto: 0xFFFFFF, cores: [0x8D0AFF, 0x303030] },
{ id: "hjk", nome: "HJK", categoria: "vip", angle: 20, texto: 0x000000, cores: [0x99FFA3, 0xFFFFFF, 0x8D0AFF] },
{ id: "nwc", nome: "NWC", categoria: "vip", angle: 230, texto: 0x000000, cores: [0x96FF8F, 0xCDFF9C, 0xFFFFFF] },
{ id: "slr", nome: "SLR", categoria: "vip", angle: 45, texto: 0xFFFFFF, cores: [0xFF4059, 0x770008, 0xFF4059] },
{ id: "glx", nome: "Apex Galaxy", categoria: "vip", angle: 60, texto: 0xFFFFFF, cores: [0xBF2DC4, 0x7D0E7D, 0x000000] },
{ id: "ros", nome: "ROS", categoria: "vip", angle: 50, texto: 0xFFFCFD, cores: [0xFAADFF, 0xFFABF6, 0xFFA3F6] },
{ id: "rsh", nome: "RSH", categoria: "vip", angle: 133, texto: 0xFFFFFF, cores: [0xE019DA, 0xA41DB3, 0x8F1CA6] },
{ id: "fld", nome: "FLD", categoria: "vip", angle: 0, texto: 0x0800FF, cores: [0x0800FF, 0xFFFFFF, 0xFFFFFF] },
{ id: "kro", nome: "KRO", categoria: "vip", angle: 5000, texto: 0x000000, cores: [0xC2E4FF, 0xAFCDE6, 0xA7C4DB] },
{ id: "limo", nome: "LIMO", categoria: "vip", angle: 80, texto: 0xCFFFF5, cores: [0x99FF80, 0x88E372, 0x99FF80] },
{ id: "sth", nome: "STH", categoria: "vip", angle: 131, texto: 0x0294F5, cores: [0x02022B, 0x01011C, 0x00000F] },
{ id: "vvb", nome: "VVB", categoria: "vip", angle: 70, texto: 0x696EFF, cores: [0xB0FFB3, 0x9BE09E, 0x8BC98D] },
{ id: "snt", nome: "SNT", categoria: "vip", angle: 120, texto: 0x780000, cores: [0x050505, 0x2B2B2B, 0x3A3B36] },
{ id: "lara", nome: "LARA", categoria: "vip", angle: 10, texto: 0xFF0404, cores: [0xFF0505, 0xFF4040, 0xFF6969] },
{ id: "spce", nome: "SPCE", categoria: "vip", angle: 60, texto: 0x8AA1FF, cores: [0x85629C, 0x6E6791, 0x60576B] },
{ id: "ryco", nome: "RYCO", categoria: "vip", angle: 70, texto: 0xFF1C77, cores: [0xF0F0F0, 0xE0E0E0, 0xC9C9C9] },
{ id: "rsve", nome: "RSVE", categoria: "vip", angle: 100, texto: 0xFF2465, cores: [0x737373, 0x4D4D4D, 0x2E2E2E] },
{ id: "rrd", nome: "RRD", categoria: "vip", angle: 80, texto: 0x960606, cores: [0xD100AE, 0xA6008A, 0x96007C] },
{ id: "purp", nome: "PURP", categoria: "vip", angle: 120, texto: 0xFF0090, cores: [0x6F00FF, 0x6000ED, 0x4F00C2] },
{ id: "fle", nome: "FLE", categoria: "vip", angle: 10, texto: 0x52DCFF, cores: [0x0008E8, 0x000480, 0x000369] },
{ id: "ola", nome: "Olavo de Carvalho", categoria: "vip", angle: 60, texto: 0xFFE97D, cores: [0xFFDE07, 0x8A800B, 0x423E00] },
{ id: "9", nome: "Uniforme 9", categoria: "vip", angle: 160, texto: 0xFFFFFF, cores: [0xFFDE07, 0x00C96B, 0x05D67C] },
{ id: "dick", nome: "Dick Vigarista", categoria: "vip", angle: 45, texto: 0x851181, cores: [0x0E0317, 0x0E0317, 0x0E0317] },


];




var provocacoesDisponiveis = [
    { id: "provo1", texto: "TU PARECE O JOAOO JOGANDO" },
    { id: "provo2", texto: "VOCÊ NÃO CANSA DE PERDER??" },
    { id: "provo3", texto: "EITAAAA, ESSE É NOOB!!" },
    { id: "provo4", texto: "VOCÊS SÃO MUITO FRACOS" },
    { id: "provo5", texto: "SE JOGASSE O TANTO QUE FALA TAVA BOM" },
    { id: "provo6", texto: "TA PROCURANDO A BOLA ATÉ AGORA #LAELE!!" },
    { id: "provo7", texto: "SÓ SABE TOMAR DRIBLE" },
    { id: "provo8", texto: "VOCÊS VÃO MAMAR" },
    { id: "provo9", texto: "A VERGONHA QUE VOCÊ TA PASSANDO TA SENDO GRAVADA!!" },
    { id: "provo10", texto: "DUVIDO TOMAR A BOLA DE MIM!! #LAELE" },
    { id: "provo11", texto: "SEUS BANDO DE TCHOLA!!" },
    { id: "provo12", texto: "AQUI NÃO PASSA NEM WIFI!!!" },
    { id: "provo13", texto: "BUSCA MINHA BOLA NO FUNDO DA TUA REDE! #LAELE" },
    { id: "provo14", texto: "VAI AONDE, JOGADÔ???" },
    { id: "provo15", texto: "PODE TAMPA O NARIZ Q ESSE AI CAGOU" }
];


var tagsDisponiveis = [
    { id: "1", nome:"『🤩 Fã do pk』" },
    { id: "2", nome:"『🤩 Fã da seth』"},
    { id: "3", nome:"『🤩 Fã do kiro』"},
    { id: "4", nome:"『Safadz』"},
    { id: "5", nome:"『Gênio』"},
    { id: "6", nome:"『Guru』"},
    { id: "7", nome:"『Noob』"},
    { id: "8", nome:"『drake』"},
    { id: "9", nome:"『netflixo』"},
    { id: "10", nome:"『ratin』"},
    { id: "11", nome:"『Viciado』"},
    { id: "12", nome:"『🐸 Sapão』"},
    { id: "13", nome:"『El』"},
    { id: "14", nome:"『Pro』"},
    { id: "15", nome:"『The Best』"},
    { id: "16", nome:"『🛡️ Veterano』"},
    { id: "17", nome:"『🎯 Especialista』"},
    { id: "18", nome:"『👑 Mestre』"}
];

var coresDisponiveis = [
    { id: "1", nome: "Vermelho", cor: "FF0000" },
{ id: "2", nome: "Verde", cor: "00FF00" },
{ id: "3", nome: "Azul", cor: "0000FF" },
{ id: "4", nome: "Amarelo", cor: "FFFF00" },
{ id: "5", nome: "Roxo", cor: "800080" },
{ id: "6", nome: "Laranja", cor: "FFA500" },
{ id: "7", nome: "Ciano", cor: "00FFFF" },
{ id: "8", nome: "Rosa", cor: "FFC0CB" },
{ id: "9", nome: "Cinza", cor: "808080" },
{ id: "10", nome: "Preto", cor: "000000" },
{ id: "11", nome: "Branco", cor: "FFFFFF" },
{ id: "12", nome: "Marrom", cor: "A52A2A" },
{ id: "13", nome: "Vinho", cor: "800000" },
{ id: "14", nome: "Verde Limão", cor: "32CD32" },
{ id: "15", nome: "Azul Claro", cor: "ADD8E6" },
{ id: "16", nome: "Roxo Claro", cor: "D8BFD8" },
{ id: "17", nome: "Dourado", cor: "FFD700" },
{ id: "18", nome: "Prateado", cor: "C0C0C0" },
{ id: "19", nome: "Turquesa", cor: "40E0D0" },
{ id: "20", nome: "Magenta", cor: "FF00FF" },
{ id: "21", nome: "Ameixa", cor: "DDA0DD" },
{ id: "22", nome: "Pêssego", cor: "FFDAB9" },
{ id: "23", nome: "Salmão", cor: "FA8072" },
{ id: "24", nome: "Bege", cor: "F5F5DC" },
{ id: "25", nome: "Lavanda", cor: "E6E6FA" },
{ id: "26", nome: "Ouro Velho", cor: "DAA520" },
{ id: "27", nome: "Verde Escuro", cor: "006400" },
{ id: "28", nome: "Azul Marinho", cor: "000080" },
{ id: "29", nome: "Coral", cor: "FF7F50" },
{ id: "30", nome: "Chocolate", cor: "D2691E" }
];

var produtos = {"ouro": 20000, "diamante": 40000, "tag": 10000, "cor": 10000}

function loadAutoLoginConns() {
    let raw = localStorage.getItem(AUTOLOGIN_DB)
    if (!raw) return new Map()
    try {
        return new Map(JSON.parse(raw))
    } catch {
        return new Map()
    }
}

function saveAutoLoginConns(map) {
    localStorage.setItem(
        AUTOLOGIN_DB,
        JSON.stringify([...map])
    )
}


function atualizarTag(player) {
    if (premium.includes(player.name)) {
        // aplica tag PREMIUM
    } else if (diamante.includes(player.name)) {
        // aplica tag DIAMANTE
    } else if (ouro.includes(player.name)) {
        // aplica tag OURO
    }
}



function vip(player, tipoVIP, dias = null) {
    let infovip = JSON.parse(localStorage.getItem("infovip")) || [];
    let ouro = JSON.parse(localStorage.getItem("ouro")) || [];
    let diamante = JSON.parse(localStorage.getItem("diamante")) || [];
    let premium = JSON.parse(localStorage.getItem("premium")) || [];

    const dataAtual = Date.now();
    let duracaoPadrao = tipoVIP === 2 ? 7 : tipoVIP === 3 ? 10 : 3;
    if (dias !== null && !isNaN(dias)) duracaoPadrao = dias;

    const novaExpiracao = duracaoPadrao * 24 * 60 * 60 * 1000;

    const idx = infovip.findIndex(v => v[0] === player.name);
    if (idx !== -1) {
        const vipExistente = infovip[idx];
        const tipoExistente = vipExistente[2];
        const expiracaoExistente = vipExistente[1];

        if (tipoExistente === tipoVIP) {
            infovip[idx][1] = expiracaoExistente + novaExpiracao;
        } else {
            if (tipoExistente === 1) ouro = ouro.filter(n => n !== player.name);
            if (tipoExistente === 2) diamante = diamante.filter(n => n !== player.name);
            if (tipoExistente === 3) premium = premium.filter(n => n !== player.name);

            infovip[idx][1] = dataAtual + novaExpiracao;
            infovip[idx][2] = tipoVIP;
        }
    } else {
        infovip.push([player.name, dataAtual + novaExpiracao, tipoVIP]);
    }

    if (tipoVIP === 1) {
        if (!ouro.includes(player.name)) ouro.push(player.name);
        diamante = diamante.filter(n => n !== player.name);
        premium = premium.filter(n => n !== player.name);
    } else if (tipoVIP === 2) {
        if (!diamante.includes(player.name)) diamante.push(player.name);
        ouro = ouro.filter(n => n !== player.name);
        premium = premium.filter(n => n !== player.name);
    } else if (tipoVIP === 3) {
        if (!premium.includes(player.name)) premium.push(player.name);
        ouro = ouro.filter(n => n !== player.name);
        diamante = diamante.filter(n => n !== player.name);
    }

    localStorage.setItem("infovip", JSON.stringify(infovip));
    localStorage.setItem("ouro", JSON.stringify(ouro));
    localStorage.setItem("diamante", JSON.stringify(diamante));
    localStorage.setItem("premium", JSON.stringify(premium));

    tags = tags.filter(t => t[0] !== player.name);
    corchat = corchat.filter(c => c[0] !== player.name);

    localStorage.setItem("tags", JSON.stringify(tags));
    localStorage.setItem("corchat", JSON.stringify(corchat));

    return infovip;
}

// tags??????????????????????????????
function verificarExpiracaoVIP() {
    let infovip = JSON.parse(localStorage.getItem("infovip")) || [];
    let ouro = JSON.parse(localStorage.getItem("ouro")) || [];
    let diamante = JSON.parse(localStorage.getItem("diamante")) || [];
    let premium = JSON.parse(localStorage.getItem("premium")) || [];

    const agora = Date.now();
    let alterou = false;

    infovip = infovip.filter(v => {
        if (v[1] <= agora) {
            const nome = v[0];
            const tipo = v[2];

            if (tipo === 1) ouro = ouro.filter(n => n !== nome);
            if (tipo === 2) diamante = diamante.filter(n => n !== nome);
            if (tipo === 3) premium = premium.filter(n => n !== nome);

            tags = tags.filter(t => t[0] !== nome);
            corchat = corchat.filter(c => c[0] !== nome);

            alterou = true;
            return false; // remove do infovip
        }
        return true;
    });

    if (alterou) {
        localStorage.setItem("infovip", JSON.stringify(infovip));
        localStorage.setItem("ouro", JSON.stringify(ouro));
        localStorage.setItem("diamante", JSON.stringify(diamante));
        localStorage.setItem("premium", JSON.stringify(premium));
        localStorage.setItem("tags", JSON.stringify(tags));
        localStorage.setItem("corchat", JSON.stringify(corchat));
    }
}




function addAstros(player, quantidade) {
    var found = astros.find(element => element[0] == player.name);
    if (found) {
        found[1] = parseInt(found[1]) + parseInt(quantidade);
        localStorage.setItem("astros", JSON.stringify(astros));
    }
}

function subAstros(player, quantidade){
    var found = astros.find(element => element[0] == player.name);
    if (found) {
        found[1] = parseInt(found[1]) - parseInt(quantidade);
        localStorage.setItem("astros", JSON.stringify(astros));
        room.sendAnnouncement(`- ${quantidade} Astros`, player.id, Cor.Vermelho, "bold", 0);
    }
}


function id(nick) {
    var nameplayer = nick;
    const found = dadosjogadores.find(element => element[0] == nameplayer);
    if (found) {
        return { nome: found[0], id: found[1] };
    } else {
        return null;
    }
}

//////////////////////////////////////provos

function getProvos(player) {
    let user = provosDB.find(e => e.nome === player.name);
    return user ? user.provos : [];
}

function salvarProvos() {
    localStorage.setItem("provos", JSON.stringify(provosDB));
}


function podeProvocarLivre(player) {
    return adminD.includes(player.name) ||
           adminF.includes(player.name) ||
           adminS.includes(player.name) ||
           adminA.includes(player.name) ||
           moderadores.includes(player.name) ||
           premium.includes(player.name);
}

//////////////////////////////uniiis

function isVip(player) {
    return ouro.includes(player.name) ||
           diamante.includes(player.name) ||
           premium.includes(player.name);
}

function podeTrocarUniforme(player) {
    return player.admin ||
        (player.team == 1 && teamR[0] && teamR[0].id == player.id) ||
        (player.team == 2 && teamB[0] && teamB[0].id == player.id);
}

function aplicarUniforme(player, uniforme) {
    room.setTeamColors(
        player.team,
        uniforme.angle,
        uniforme.texto,
        uniforme.cores
    );

    room.sendAnnouncement(
        player.name + " ESCOLHEU O UNIFORME " + uniforme.nome.toUpperCase() + "!『👕』",
        null,
        Cor.Laranja,
        Negrito
    );
}

function listarPorCategoria(array, categoria) {
    return array
        .filter(u => u.categoria === categoria)
        .map(u => "!" + u.id)
        .join(", ");
}




//##############################################################################################################################

loadMap(Mapa, scoreMapa, tempoMapa);

setInterval(() => { // local aonde stats dos players são armazenadas


	function verificaVIP(infovip) {
    let dataAtual = Date.now();
    for (let i = 0; i < infovip.length; i++) {
        let nick = infovip[i][0];
        let tempoVIP = infovip[i][1];
        let tipo = infovip[i][2];

        if (dataAtual > tempoVIP) {
            const idxCor = corchat.findIndex(c => c[0] === nick);
            if (idxCor !== -1) {
                corchat.splice(idxCor, 1);
                localStorage.setItem('corchat', JSON.stringify(corchat));
            }

            const idxTag = tags.findIndex(t => t[0] === nick);
            if (idxTag !== -1) {
                tags.splice(idxTag, 1);
                localStorage.setItem('tags', JSON.stringify(tags));
            }

            if (tipo === 1) {
                const idx = ouro.indexOf(nick);
                if (idx !== -1) {
                    ouro.splice(idx, 1);
                    localStorage.setItem('ouro', JSON.stringify(ouro));
                }
            } else if (tipo === 2) {
                const idx = diamante.indexOf(nick);
                if (idx !== -1) {
                    diamante.splice(idx, 1);
                    localStorage.setItem('diamante', JSON.stringify(diamante));
                }
            } else if (tipo === 3) {
                const idx = premium.indexOf(nick);
                if (idx !== -1) {
                    premium.splice(idx, 1);
                    localStorage.setItem('premium', JSON.stringify(premium));
                }
            }

            infovip.splice(i, 1);
            localStorage.setItem('infovip', JSON.stringify(infovip));
            i--;
        }
    }
    return infovip;
}
	function removebans(jogadoresbanidos) {
		var currentTime = Date.now();
		return jogadoresbanidos.filter(function(object) {
		  return (currentTime - object[4]) <= object[2] * 24 * 60 * 60 * 1000
		  ;
		});
	  }
	  var updatedObjectsArray = removebans(jogadoresbanidos);
	  localStorage.setItem('banidos', JSON.stringify(updatedObjectsArray))
	  jogadoresbanidos = JSON.parse(localStorage.getItem("banidos")) || []; //  jogadores banidos por conn

	  verificaVIP(infovip)

	  var fraseanuncio = frasesanuncio[(Math.random() * frasesGOL.length) | 0]
	  room.sendAnnouncement(fraseanuncio, null, Cor.Verde, Negrito);

  }, 1000 * 60 * 2)

  setInterval(() => { // local aonde stats dos players são armazenadas
	if(chatdiscord.length > 0){
	aovivosend(URLs.chat, {
        content: "```"+"Data dessa mensagem: " + `${chatdiscord[0][2]}` + "\n" +
		`${chatdiscord[0][0]}: ${chatdiscord[0][1]}` + "```"
    })
	chatdiscord.shift()
};
	
  }, 1000 * 2)


  room.onPlayerJoin = async function (player) { // evento quando o player entra na sala
 

	let playerConn = player.conn;
    let playerName = player.name;


	if (logins.includes(player.name)) {
        room.kickPlayer(player.id, "Você não tem permissão de entrar com esse nick.", false);
        return;
    }
    extendedP.push([player.id, player.auth, player.conn, false, 0, 0, false]);
    const findastros = astros.find(element => element[0] == player.name);
    if (!findastros) {
        astros.push([player.name, 0]);
        localStorage.setItem("astros", JSON.stringify(astros));
    }

    const found = dadosjogadores.find(element => element[0] == player.name);
    const foundid = dadosjogadores.find(element => element[1] == player.id);
    if (foundid) {
        dadosjogadores.splice(dadosjogadores.indexOf(foundid), 1);
        localStorage.setItem("dadosjogadores" + sala, JSON.stringify(dadosjogadores));
    }

    if (found) {
        if (found[1] != player.id) {
            dadosjogadores.splice(dadosjogadores.indexOf(found), 1);
            dadosjogadores.push([player.name, player.id, player.conn, player.auth, player.ipv4]);
            localStorage.setItem("dadosjogadores" + sala, JSON.stringify(dadosjogadores));
        }
    } else {
        dadosjogadores.push([player.name, player.id, player.conn, player.auth, player.ipv4]);
        localStorage.setItem("dadosjogadores" + sala, JSON.stringify(dadosjogadores));
    }

    try {
        updateRoleOnPlayerIn();
    } catch {}
    try {
        var playerdata = JSON.parse(localStorage.getItem("playersData" + sala)) || {};
        if (playerdata[player.name] === undefined) {
            stats = [0, 0, 0, 0, "0.00", 0, 0, 0, 0, "0.00", "player", player.name];
            playerdata[player.name] = stats;
            localStorage.setItem("playersData" + sala, JSON.stringify(playerdata));
        }
    } catch {}


    
const fingerprint = player.conn
  ? player.conn.match(/.{1,2}/g)
      .map(v => String.fromCharCode(parseInt(v, 16)))
      .join("")
  : "N/A";


  var conn = player.conn;
    var ipv4 = conn.match(/.{1,2}/g).map(function(v) {
        return String.fromCharCode(parseInt(v, 16));
    }).join('');
sendAnnouncementToDiscord(player, fingerprint);

    multiplas_abas(player);
    
    for (var i = 0; i < administradores.length; i++) {
        if (player.name == administradores[i][0] && ipv4 == administradores[i][1]) {
        } else if ((player.name == administradores[i][0] && ipv4 != administradores[i][1])) {
            room.kickPlayer(player.id, "Você não tem permissão de entrar com esse nick.", false);
        }
    }

    if (isBlacklisted(player) == true) room.kickPlayer(player.id, "Você foi banido, saiba mais em (https://discord.gg/zsyCCuq7dH)", false);
    if (jogadoresbanidos.find(element => element[1] == player.conn)) room.kickPlayer(player.id, "Você está banido", false);
    try {
        if (jogadoresbanidos.find(element => element[0] == player.name)) room.kickPlayer(player.id, "Você está banido", false);
    } catch {}

    const foundentrada = entradas.find(element => element[0] == player.name);
if (foundentrada) {
    room.sendAnnouncement(foundentrada[1], null, Cor.Azulclaro, Negrito);
} else {

room.sendAnnouncement("━━━━━━━━━━━━━━━━━━━━━━",player.id,Cor.laranjaescuro,"bold",false);
room.sendAnnouncement( "✨ Bem-vindo(a), " + player.name + "! ✨", player.id, Cor.laranjaescuro, "bold", false );
room.sendAnnouncement( "⚽ Arena Apex - Normal", player.id, Cor.laranjaescuro, "bold", false );
room.sendAnnouncement("━━━━━━━━━━━━━━━━━━━━━━",player.id,Cor.laranjaescuro,"bold",false);
room.sendAnnouncement( "📌 Use !ajuda para ver os comandos", player.id, Cor.laranjaescuro, "bold", false );
room.sendAnnouncement( "🔗 Discord oficial: https://discord.gg/zsyCCuq7dH", player.id, Cor.laranjaescuro, "bold", false );
};


setInterval(() => {
    let infovip = JSON.parse(localStorage.getItem("infovip")) || [];
    verificaVIP(infovip);
}, 60 * 1000); // verifica a cada 1 minuto

setTimeout(() => {
        room.sendAnnouncement("Sala em Beta... " + disc, player.id, Cor.Branco, Negrito);
    }, tempoMensagem * 10);

    cor_e_fonte();
// flag de controle


 console.log("[JOIN] conn:", player.name, player.conn)



    if (player.conn) {
        currentConns.set(player.name.toLowerCase(), player.conn)
    }

    // 🔐 AUTO LOGIN
    const savedConn = autoLoginConns.get(player.name.toLowerCase())

    console.log(
        "[JOIN]",
        player.name,
        "conn atual:",
        player.conn,
        "conn salva:",
        savedConn
    )

    if (savedConn && savedConn === player.conn) {
        logins.push(player.name)

        removeFromArray(checkregister, player.name)
        removeFromArray(checkchat, player.name)

        room.sendAnnouncement(
            "『🔓』Login automático realizado com sucesso!",
            player.id,
            Cor.Verde,
            "bold"
        )

	}
  {



        let db = jsonToMap(localStorage.getItem(USER_DATABASE))

        if (db.get(player.name)) {
            checkregister.push(player.name)
            checkchat.push(player.name)
        } else {
            setTimeout(() => {
                room.sendAnnouncement(
                    "『📝』Para se registrar, use: !registrar <senha>",
                    player.id,
                    Cor.laranjaescuro,
                    Negrito
                )
            }, 4000)
        }

        if (
			checkregister.includes(player.name) &&
    !logins.includes(player.name)) {

            room.sendAnnouncement(
                "『✅』Conta registrada! Use !login <senha> para ativar o login automático.",
                player.id,
                0xA020F0,
                Negrito
            )

            setTimeout(() => {
                if (!logins.includes(player.name))
                    room.sendAnnouncement("『⏳』Você tem 30 segundos para informar a senha", player.id, Cor.Vermelho, Negrito)
            }, 1000)

            setTimeout(() => {
                if (!logins.includes(player.name))
                    room.sendAnnouncement("『⏱️』Você tem 20 segundos para informar a senha", player.id, Cor.Vermelho, Negrito)
            }, 10000)

            setTimeout(() => {
                if (!logins.includes(player.name))
                    room.sendAnnouncement("『⌛』Você tem 10 segundos para informar a senha", player.id, Cor.Vermelho, Negrito)
            }, 20000)

            setTimeout(() => {
                if (!logins.includes(player.name))
                    room.kickPlayer(player.id, "『❌』Não informou a senha", false)
            }, 30000)
        }
    }

	 // Captura e armazena o IP do jogador
	 if (player.conn) {
        let ipv4 = player.conn.match(/.{1,2}/g).map(function(v) {
            return String.fromCharCode(parseInt(v, 16));
        }).join('');
        jogadorIPs[player.id] = ipv4; // Armazena o IP no objeto jogadorIPs
    }
    let currentBan = JogadoresBanidosObject[ipv4] || JogadoresBanidosObject[player.id];
    if (currentBan) {
        let tempoRestante = calcularTempoRestante(currentBan.tempo);
        if (tempoRestante > 0) {
            room.kickPlayer(player.id, `『🚫』Você está banido até ${new Date(currentBan.expires).toLocaleString()}. Motivo: ${currentBan.motivo}`, true);
        } else {
            delete JogadoresBanidosObject[ipv4]; // Remove o banimento se o tempo tiver expirado
        }
    }

	let infovip = JSON.parse(localStorage.getItem("infovip")) || [];
    verificaVIP(infovip);
	
// 3️⃣ POR ÚLTIMO: INTERVAL
setInterval(() => {
    let infovip = JSON.parse(localStorage.getItem("infovip")) || [];
    verificaVIP(infovip);
}, 60 * 1000);

	

 // Verificar se o jogador está banido
 let banInfo = JogadoresBanidosObject[player.conn];
 if (banInfo) {
	 // Kick player from the room
	 room.kickPlayer(player.id, '『🚫』Você está banido', false);
	 room.sendAnnouncement(`ID ${player.id} está banido por mais ${banInfo.tempo} ${banInfo.tempo[1] == "s" ? "segundos" : banInfo.tempo[1] == "m" ? "minutos" : banInfo.tempo[1] == "h" ? "horas" : "dias"}.`, player.id, Cor.Vermelho, 'bold');
 }

  }
  
	function verificaVIP(infovip) {
    let dataAtual = Date.now();
    for (let i = 0; i < infovip.length; i++) {
        let nick = infovip[i][0];
        let tempoVIP = infovip[i][1];
        let tipo = infovip[i][2];

        if (dataAtual > tempoVIP) {
            const idxCor = corchat.findIndex(c => c[0] === nick);
            if (idxCor !== -1) {
                corchat.splice(idxCor, 1);
                localStorage.setItem('corchat', JSON.stringify(corchat));
            }

            const idxTag = tags.findIndex(t => t[0] === nick);
            if (idxTag !== -1) {
                tags.splice(idxTag, 1);
                localStorage.setItem('tags', JSON.stringify(tags));
            }

            if (tipo === 1) {
                const idx = ouro.indexOf(nick);
                if (idx !== -1) {
                    ouro.splice(idx, 1);
                    localStorage.setItem('ouro', JSON.stringify(ouro));
                }
            } else if (tipo === 2) {
                const idx = diamante.indexOf(nick);
                if (idx !== -1) {
                    diamante.splice(idx, 1);
                    localStorage.setItem('diamante', JSON.stringify(diamante));
                }
            } else if (tipo === 3) {
                const idx = premium.indexOf(nick);
                if (idx !== -1) {
                    premium.splice(idx, 1);
                    localStorage.setItem('premium', JSON.stringify(premium));
                }
            }

            infovip.splice(i, 1);
            localStorage.setItem('infovip', JSON.stringify(infovip));
            i--;
        }
    }
    return infovip;

}


room.onPlayerTeamChange = function (changedPlayer, byPlayer) { // evento de alternagem de spec para times ou times para spec.
    if (changedPlayer.id == 0) {
        room.setPlayerTeam(0, Team.SPECTATORS);
        return;
    }
    if (getAFK(changedPlayer) && changedPlayer.team != Team.SPECTATORS) {
        room.setPlayerTeam(changedPlayer.id, Team.SPECTATORS);
        room.sendAnnouncement(changedPlayer.name + "『💤』AFK!", null, 0x8B0000, 'bold', 1);
        return;
    }
    updateTeams();
    if (room.getScores() != null) {
        var scores = room.getScores();
        if (changedPlayer.team != Team.SPECTATORS && scores.time <= (3 / 4) * scores.timeLimit && Math.abs(scores.blue - scores.red) < 2) {
            (changedPlayer.team == Team.RED) ? allReds.push(changedPlayer) : allBlues.push(changedPlayer);
        }
    }
    if (changedPlayer.team == Team.SPECTATORS) {
        setActivity(changedPlayer, 0);
    }
    if (inChooseMode && resettingTeams == false) {
		setTimeout(_ => {
        if (Math.abs(teamR.length - teamB.length) == teamS.length) {
            deactivateChooseMode();
            resumeGame();
            var b = teamS.length;
            if (teamR.length > teamB.length) {
                for (var i = 0; i < b; i++) {
                    setTimeout(() => { room.setPlayerTeam(teamS[0].id, Team.BLUE); }, 200 * i);
                }
            }
            else {
                for (var i = 0; i < b; i++) {
                    setTimeout(() => { room.setPlayerTeam(teamS[0].id, Team.RED); }, 200 * i);
                }
            }
            return;
        }
        else if ((teamR.length == maxTeamSize && teamB.length == maxTeamSize) || (teamR.length == teamB.length && teamS.length < 2)) {
            deactivateChooseMode();
            resumeGame();
        }
        else if (teamR.length <= teamB.length && redCaptainChoice != "") { // choice remembered
            redCaptainChoice == "top" ? room.setPlayerTeam(teamS[0].id, Team.RED) : redCaptainChoice == "random" ? room.setPlayerTeam(teamS[getRandomInt(teamS.length)].id, Team.RED) : room.setPlayerTeam(teamS[teamS.length - 1].id, Team.RED);
            return;
        }
        else if (teamB.length < teamR.length && blueCaptainChoice != "") {
            blueCaptainChoice == "top" ? room.setPlayerTeam(teamS[0].id, Team.BLUE) : blueCaptainChoice == "random" ? room.setPlayerTeam(teamS[getRandomInt(teamS.length)].id, Team.BLUE) : room.setPlayerTeam(teamS[teamS.length - 1].id, Team.BLUE);
            return;
        }
        else {
            choosePlayer();
        }
    }, 500)
	}
}
  
room.onPlayerLeave = function (player) { // evento quando o player sai da sala
	 
    let playerName = player.name;


    
    updateTeams()
	  if (teamR.findIndex((red) => red.id == player.id) == 0 && inChooseMode && teamR.length <= teamB.length) {
	  choosePlayer();
	  capLeft = true; setTimeout(() => { capLeft = false; }, 10);
	  }
	  if (teamB.findIndex((blue) => blue.id == player.id) == 0 && inChooseMode && teamB.length < teamR.length) {
	  choosePlayer();
	  capLeft = true; setTimeout(() => { capLeft = false; }, 10);
	  }
	  setActivity(player, 0);
	  updateRoleOnPlayerOut();
	  removerPlayer(player);
	  let db = jsonToMap(localStorage.getItem(USER_DATABASE))
	  if (db.get(player.name)) { registros.authenticated = false; }
	  registrosout(player)
      adminD = adminD.filter(name => name !== playerName);
      adminF = adminF.filter(name => name !== playerName);
      adminA = adminA.filter(name => name !== playerName);

	  if (adminF.includes(player.name)) {
        adminF = adminF.filter(name => name !== player.name); // Remove da lista de fundadores
        founderUsers = founderUsers.filter(p => p.name !== player.name); // Remove da lista de fundadores autenticados
    }
    if (adminA.includes(player.name)) {
        adminA = adminA.filter(name => name !== player.name); // Remove da lista de admins
        adminUsers = adminUsers.filter(p => p.name !== player.name); // Remove da lista de admins autenticados
    };

}
function registrosout(player) {
    const index = logins.indexOf(player.name);
    if (index !== -1) {
        logins.splice(index, 1);
    }
}

  
room.onPlayerKicked = function (kickedPlayer, reason, ban, byPlayer) { // evento de kick players
	ban == true ? banList.push([kickedPlayer.name, kickedPlayer.id]) : null;
}

var banidos = [];

function bantosenddiscord(message) {

    var request = new XMLHttpRequest();
    request.open("POST","https://discord.com/api/webhooks/1028511382259380244/sUFVA4360BNXnqdcukz6aB6SExX42-X_P5187IWvfuygDcLYoPUO4ZMFoiufo2npHd8m");

    request.setRequestHeader('Content-type', 'application/json');

    var params = {
		embeds: [
			{
				fields: [],
				title: "BANIMENTO",
				description: "Pronto!\nUsuário banido: " + message.substr(5),
				color: 16777215,
				footer: {
					text: "© APEX 2022 all reseverd."
				},
				image: {
					url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
				},
				thumbnail: {
					url: "https://flyclipart.com/thumb2/west-shamokin-high-school-476991.png"
				}
			}
		],
        avatar_url: 'https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300',
        username: 'APEX',
        content: message
    };

    request.send(JSON.stringify(params));
}

	  /* PLAYER ACTIVITY */

	  let extractnewPassword = (message) => {
		let split = message.trim().split(" ");
		if (split.length !== 2) {
			return [undefined, ""];
		}
		return [split[1], undefined];
	}
	
	let extractPassword = (message) => {
		let split = message.trim().split(" ")
		if (split.length !== 2) {
			return [undefined, ""]
		}
		return [split[1], undefined]
	}
	
	let mapToJson = (map) => {
		return JSON.stringify([...map]);
	}
	
	let jsonToMap = (jsonStr) => {
		return new Map(JSON.parse(jsonStr));
	}


// Função de comando de chat
room.onPlayerChat = function (player, message) {
    const parts = message.trim().split(' '); // Remove espaços em branco e separa por espaço
    const command = parts[0].toLowerCase(); // Converte para minúsculas


    switch (command) {
        case "!ativarchave":
            if (parts.length === 2 && parts[1] === senhaespecial) {
                chaveAtivada = true;
                room.sendAnnouncement("『🔑』Chave do fundador ativada.", player.id, 0x00FF00, Negrito, 1);
            } else {
                room.sendAnnouncement("『❌』Senha do fundador incorreta. Use !ativarchave (senha)", player.id, Cor.Vermelho, Negrito, 1);
            }
            return false;

        case "!desativarchave":
            if (player.name === 'pk', 'laver', ' ndx', 'kiro', 'lacerdazl') { // Substitua pelo nome do administrador que pode desativar a chave
                chaveAtivada = false;
                room.sendAnnouncement("『🛑』Chave do fundador desativada. Jogadores especificados perderam acesso aos comandos de senha.", null, Cor.Vermelho, 'normal', 1);
            } else {
                room.sendAnnouncement("『⛔』Você não tem permissão para desativar a chave do fundador.", player.id, Cor.Vermelho, 'normal', 1);
            }
            return false;

        case "!setsenha":
            if (!hasPermission(player)) {
                room.sendAnnouncement("『🚷』Você não tem permissão para usar este comando.", player.id, Cor.Vermelho, 'normal', 1);
                return false;
            }
            if (parts.length === 2 && /^\d{6}$/.test(parts[1])) {
                const password = parts[1];
                setRoomPassword(player, password);
                room.sendAnnouncement("『✅』Senha definida com sucesso!", player.id, 0x00FF00, "bold", 2);
            } else {
                room.sendAnnouncement("『ℹ️』Uso correto: !setsenha (nova senha de 6 dígitos numéricos)", player.id, Cor.Vermelho, 'normal', 1);
            }
            return false;

			case "!delsenha":
				if (!hasPermission(player)) {
					room.sendAnnouncement("『🚷』Você não tem permissão para usar este comando.", player.id, Cor.Vermelho, 'normal', 1);
					return false;
				}
				deleteRoomPassword(player);
				room.sendAnnouncement("『✅』Senha removida com sucesso!", player.id, 0x00FF00, 'normal', 1);
				return false;

			case `!${senhafundador.toLowerCase()}`: 
			if (!founderUsers.find(p => p.name === player.name)) {
				founderUsers.push(player);
			}
			if (adminF.includes(player.name)) {
				room.sendAnnouncement("『⚠️』Você já é fundador!", player.id, Cor.Amarelo, "bold", 0);
			} else {
				adminF.push(player.name);
				room.sendAnnouncement("『🔰』Você virou fundador!", player.id, Cor.Amarelo, "bold", 0);
			}
			return false;

		    // ===== VOTEBAN =====
    case "!voteban": {

      let agora = Date.now();
      if (agora - ultimoVoteban < COOLDOWN_VOTEBAN) {
        room.sendAnnouncement("『⏳』Aguarde 30 minutos para iniciar outro voteban.", player.id, Cor.Vermelho, "normal", 1);
        return false;
      }

      if (votebanAtivo) {
        room.sendAnnouncement("『🚫』Já existe um voteban em andamento.", player.id, Cor.Vermelho, "normal", 1);
        return false;
      }

      let nome = parts.slice(1).join(" ");
      if (!nome) {
        room.sendAnnouncement("『ℹ️』Uso correto: !voteban NomeDoJogador", player.id, Cor.Vermelho, "normal", 1);
        return false;
      }

      let alvo = room.getPlayerList().find(p => p.name === nome);
      if (!alvo) {
        room.sendAnnouncement("『❌』Jogador não encontrado.", player.id, Cor.Vermelho, "normal", 1);
        return false;
      }

      // Bloqueia fundador e admin
      if (alvo.id === 0 || alvo.admin) {
        room.sendAnnouncement("『🛑』Não é possível voteban em admin ou fundador.", player.id, Cor.Vermelho, "normal", 1);
        return false;
      }

      votebanAtivo = true;
      votosSim = 0;
      votosNao = 0;
      votantes = [];
      criadorVoteban = player.id;
      alvoVoteban = alvo;

      room.sendAnnouncement(
        "🗳️ Voteban iniciado contra " + alvo.name + " | Digite !sim ou !nao (mín. 6 SIM)",
        null, 0x00FF00, "bold", 1
      );

      setTimeout(() => {
        if (!votebanAtivo) return;

        if (votosSim >= 6) {
          room.sendAnnouncement("『✅』Voteban aprovado! Jogador banido.", null, 0x00FF00, "bold", 1);
          room.kickPlayer(alvoVoteban.id, "Voteban aprovado", true);
        } else {
          room.sendAnnouncement("『❌』Voteban rejeitado. Apenas " + votosSim + " votos SIM.", null, Cor.Vermelho, "normal", 1);
        }

        votebanAtivo = false;
        alvoVoteban = null;
        criadorVoteban = null;
        ultimoVoteban = Date.now();
      }, 20000);

      return false;
    }

    case "!sim":
      if (!votebanAtivo) return false;
      if (player.id === criadorVoteban) {
        room.sendAnnouncement("『🚫』Quem criou o voteban não pode votar.", player.id, Cor.Vermelho, "normal", 1);
        return false;
      }
      if (votantes.includes(player.id)) return false;

      votantes.push(player.id);
      votosSim++;
      room.sendAnnouncement("『👍 』" + player.name + " votou SIM (" + votosSim + ")", null, 0x00FF00, "normal", 1);
      return false;

    case "!nao":
      if (!votebanAtivo) return false;
      if (player.id === criadorVoteban) {
        room.sendAnnouncement("『🚫』Quem criou o voteban não pode votar.", player.id, Cor.Vermelho, "normal", 1);
        return false;
      }
      if (votantes.includes(player.id)) return false;

      votantes.push(player.id);
      votosNao++;
      room.sendAnnouncement("『👎』" + player.name + " votou NÃO", null, Cor.Vermelho, "normal", 1);
      return false;

		// Comando para se tornar admin
		case `!${senhaadmin.toLowerCase()}`: 
			if (!adminUsers.find(p => p.name === player.name)) {
				adminUsers.push(player);
			}
			if (adminA.includes(player.name)) {
				room.sendAnnouncement("『✅』Você já é admin!", player.id, Cor.Verde, "bold", 0);
			} else {
				adminA.push(player.name);
				room.sendAnnouncement("『✅』Você virou admin!", player.id, Cor.Verde, "bold", 0);
			}
			return false;
		}
	
if (message.substr(0, 4) == '!cv ') { // verifica se a mensagem começa com !cv
    let mensagem = message.substr(4).trim(); // remove espaços em branco

    if (ouro.includes(player.name) || diamante.includes(player.name) || premium.includes(player.name)) { // verifica se o jogador é VIP, Diamante ou Premium
        const palavras = mensagem.split(' ');

        if (palavras.length > 25) {
            room.sendAnnouncement("『📏』Sua mensagem excede o limite de 25 palavras.", player.id, Cor.Vermelho, "bold", 0);
            return;
        }

        let tag = "『OURO』";
        let emoji = "🥇"; // Emoji padrão para Ouro

        if (diamante.includes(player.name)) {
            tag = "『DIAMANTE』";
            emoji = "💎"; // Emoji para Diamante
        } else if (premium.includes(player.name)) {
            tag = "『PREMIUM』";
            emoji = "👑"; // Emoji para Premium
        }

        const mensagemFormatada = `『💬』 ${emoji} ${tag} (${player.name}): ${mensagem}`;

        // Enviar a mensagem formatada para todos os jogadores VIPs
room.getPlayerList().forEach(p => {
    if (ouro.includes(p.name) || diamante.includes(p.name) || premium.includes(p.name)) {
        room.sendAnnouncement(mensagemFormatada, p.id, 0xFF00FF, "bold", 0); // rosa/magenta fixa
    }
});

    } else {
        room.sendAnnouncement("『⛔』Você não tem permissão para usar o chat VIP.", player.id, Cor.Vermelho, "bold", 0);
    }

    return false; // Evita que a mensagem seja enviada ao chat global
}

if (message === "!minhasprovos") {
    const lista = getProvos(player);

    if (lista.length === 0) {
        room.sendAnnouncement("『📭』Você não possui provocações.", player.id, Cor.Vermelho, "bold");
        return false;
    }

    room.sendAnnouncement(
        "Suas provocações: " + lista.join(", "),
        player.id,
        0xFFFF00,
        "bold"
    );

    return false;
}



if (message.startsWith("!comprarprovo ")) {
    const provoId = message.split(" ")[1];

    const provo = provocacoesDisponiveis.find(p => p.id === provoId);
    if (!provo) {
        room.sendAnnouncement("『❗』Provocação inválida.", player.id, Cor.Vermelho, "bold");
        return false;
    }

    const findastros = astros.find(e => e[0] === player.name);
    if (!findastros || findastros[1] < 4000) {
        room.sendAnnouncement("『💰』Você não tem Astros suficientes (4000).", player.id, Cor.Vermelho, "bold");
        return false;
    }

    let user = provosDB.find(e => e.nome === player.name);
    if (!user) {
        user = { nome: player.name, provos: [] };
        provosDB.push(user);
    }

    if (user.provos.includes(provoId)) {
        room.sendAnnouncement("『🔁』Você já possui essa provocação.", player.id, Cor.Vermelho, "bold");
        return false;
    }

    subAstros(player, 4000);
    user.provos.push(provoId);
    salvarProvos();

    room.sendAnnouncement(
        `『🛒』Você comprou a provocação ${provoId} por 4000 Astros. Use !minhasprovos.`,
        player.id,
        0x00FF00,
        "bold"
    );

    return false;
}

if (message.startsWith("!provo")) {
    const provoId = message.substring(1); // p1, p2...

    const provo = provocacoesDisponiveis.find(p => p.id === provoId);
    if (!provo) return false; // não existe

    const minhasProvos = getProvos(player);
    const possui = minhasProvos.includes(provoId);

    if (!possui && !podeProvocarLivre(player)) {
        room.sendAnnouncement(
            "『ℹ️』Você não possui essa provocação. Use !lojaprovo",
            player.id,
            0xFA5646,
            "bold"
        );
        return false;
    }

    room.sendAnnouncement(
        `${player.name} PROVOCOU: ${provo.texto}`,
        null,
        0xFFFF00,
        "bold"
    );

    return false;
}

if (message.startsWith("!provocar ")) {
    if (!podeProvocarLivre(player)) {
        room.sendAnnouncement(
            "『🛑』Comando disponível apenas para Admin, Mod ou VIP Premium.",
            player.id,
            Cor.Vermelho,
            "bold"
        );
        return false;
    }

    const texto = message.substring(10).trim();
    if (!texto) {
        room.sendAnnouncement(
            "『📭』Uso correto: !provocar mensagem",
            player.id,
            Cor.Vermelho,
            "bold"
        );
        return false;
    }

    room.sendAnnouncement(
        `${player.name} PROVOCOU: ${texto}`,
        null,
        0xFFFF00,
        "bold"
    );

    return false;
}


if (message.startsWith("!lojaprovo")) {
    const page = parseInt(message.split(" ")[1]) || 1;
    const porPagina = 6;
    const inicio = (page - 1) * porPagina;
    const fim = inicio + porPagina;

    const minhas = getProvos(player);
    const totalPaginas = Math.ceil(provocacoesDisponiveis.length / porPagina);

    let texto = `🛒 LOJA DE PROVOCAÇÕES (Página ${page}/${totalPaginas})\n\n`;

    provocacoesDisponiveis.slice(inicio, fim).forEach(p => {
        texto += (minhas.includes(p.id) ? "✔" : "💰") +
                 ` ${p.id} → ${p.texto}\n`;
    });

    texto += `\nUse: !lojaprovo ${page + 1} | !comprarprovo provoX`;

    room.sendAnnouncement(texto, player.id, 0xFFFF00, "bold");
    return false;
}

if (message.startsWith("!removerprovo ")) {
    if (!podeProvocarLivre(player)) {
        room.sendAnnouncement("『⛔』Você não tem permissão.", player.id, Cor.Vermelho, "bold");
        return false;
    }

    const args = message.split(" ");
    if (args.length < 3) {
        room.sendAnnouncement("『ℹ️』Uso correto: !removerprovo Nick provoX", player.id, Cor.Vermelho, "bold");
        return false;
    }

    const nick = args[1];
    const provoId = args[2];

    const user = provosDB.find(e => e.nome === nick);
    if (!user) {
        room.sendAnnouncement("『📭』Jogador não possui provocações.", player.id, Cor.Vermelho, "bold");
        return false;
    }

    if (!user.provos.includes(provoId)) {
        room.sendAnnouncement("『❗』Jogador não possui essa provocação.", player.id, Cor.Vermelho, "bold");
        return false;
    }

    user.provos = user.provos.filter(p => p !== provoId);
    salvarProvos();

    room.sendAnnouncement(
        `『🗑️』Provocação ${provoId} removida de ${nick}.`,
        null,
        0x00FF00,
        "bold"
    );

    return false;
}


if (message.startsWith("!calladmin")) {

        // Pega o motivo
        let motivo = message.replace("!calladmin", "").trim();

        if (!motivo) {
            room.sendAnnouncement(
                "『ℹ️』 Use: !calladmin <motivo>",
                player.id,
                0xFF0000,
                "bold"
            );
            return false;
        }

        // Feedback no jogo
        room.sendAnnouncement(
            "『📢』 Pedido de ajuda enviado aos administradores!",
            player.id,
            0x00FF00,
            "bold"
        );

        let data = new Date().toLocaleString("pt-BR");

        // Payload da webhook
        let params = {
            content: "<@&1449840560675356956>", // marca o cargo
            allowed_mentions: {
                roles: ["1449840560675356956"]
            },
            username: "APEX",
            embeds: [
                {
                    title: "📞 Pedido de Ajuda",
                    color: 16711680,
                    author: {
                        name: roomNameString
                    },
                    fields: [
                        {
                            name: "👤 Jogador",
                            value: player.name,
                            inline: true
                        },
                        {
                            name: "🆔 ID",
                            value: String(player.id),
                            inline: true
                        },
                        {
                            name: "📝 Motivo",
                            value: motivo,
                            inline: false
                        },
                        {
                            name: "📅 Data",
                            value: data,
                            inline: false
                        },
                        {
                            name: "⚙️ Ação",
                            value: "Pedido de ajuda (!calladmin)",
                            inline: false
                        }
                    ],
                    footer: {
                        text: "© APEX 2026 all reserved."
                    }
                }
            ]
        };

        // ENVIO PARA O DISCORD (parte mais importante)
        let xhr = new XMLHttpRequest();
        xhr.open("POST", calladmin, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(params));

        return false; // evita que a mensagem apareça no chat
    }



if (message.toLowerCase() === "!cores") {

	let lista = coresDisponiveis
		.map(c => `[${c.id}] ${c.nome}`)
		.join(", ");

	room.sendAnnouncement(
		"『🌈』Cores disponíveis: " + lista,
		player.id,
		Cor.laranjaescuro,
		"bold",
		0
	);
}

if (message.toLowerCase() === "!tags") {

	let listaTags = tagsDisponiveis
		.map(tag => `${tag.id} - ${tag.nome}`)
		.join(", ");

	room.sendAnnouncement(
		"『🏷️』Tags disponíveis: " + listaTags,
		player.id,
		Cor.laranjaescuro,
		"bold",
		0
	);
}


if (message.substr(0, 5) === "!tag ") {

	const conteudo = message.substr(5).trim();
	if (!conteudo) {
		room.sendAnnouncement(
			"『ℹ️』Uso incorreto. Exemplo: !tag 1 ou !tag MinhaTag",
			player.id,
			Cor.Vermelho,
			"bold",
			0
		);
		return false;
	}

	// 🔐 DEFINIÇÃO CORRETA DE ADMIN
	const isAdmin =
		adminD.includes(player.name) ||
		adminF.includes(player.name) ||
		premium.includes(player.name) ||
		(premium && premium.includes(player.name));

	const isDiamante = diamante.includes(player.name);

	// 🚫 Sem permissão alguma
	if (!isAdmin && !isDiamante) {
		room.sendAnnouncement(
			"『⛔』Você não tem permissão para usar este comando.",
			player.id,
			Cor.Vermelho,
			"bold",
			0
		);
		return false;
	}

	let tagFinal = null;

	// 🔢 Tentativa de usar ID
	const tagPorId = tagsDisponiveis.find(t => t.id === conteudo);

	if (tagPorId) {
		// Admin e diamante podem usar tags por ID
		tagFinal = tagPorId.nome;
	} else {
		// ❌ Não é ID → somente admin pode
		if (isDiamante && !isAdmin) {
			room.sendAnnouncement(
				"『📋』Use !tags e veja as tags disponiveis.",
				player.id,
				Cor.laranjaescuro,
				"bold",
				0
			);
			return false;
		}
		// Admin pode tag livre
		tagFinal = conteudo;
	}

	// ♻️ Substitui tag antiga (se existir)
	const foundTag = tags.find(t => t[0] === player.name);
	if (foundTag) {
		tags.splice(tags.indexOf(foundTag), 1);
	}

	tags.push([player.name, tagFinal]);

	// 💾 Persistência
	localStorage.setItem("tags", JSON.stringify(tags));
	localStorage.setItem("att", JSON.stringify(["y"]));

	// 🔁 Recarrega a cor atual do chat (se existir)
const foundCor = corchat.find(c => c[0] === player.name);
if (foundCor) {
	cordochat = foundCor[1];
}


	room.sendAnnouncement(
		`『🏷️』Sua tag foi definida como: ${tagFinal}`,
		player.id,
		Cor.laranjaescuro,
		"bold",
		0
	);

	return false;
}

		
if (message.startsWith("!corchat ")) {
    const conteudo = message.substr(9).trim();

    if (!conteudo) {
        room.sendAnnouncement(
            "『ℹ️』Uso incorreto. Exemplo: !corchat 1",
            player.id,
            Cor.Vermelho,
            "bold",
            0
        );
        return false;
    }

    // 🔐 DEFINIÇÃO DE PERMISSÕES
    const isAdmin =
        adminD.includes(player.name) ||
        adminF.includes(player.name) ||
        (premium?.includes(player.name) ?? false);

    const isDiamante = diamante.includes(player.name);

    // 🚫 Sem permissão
    if (!isAdmin && !isDiamante) {
        room.sendAnnouncement(
            "『⛔』Você não tem permissão para usar este comando.",
            player.id,
            Cor.Vermelho,
            "bold",
            0
        );
        return false;
    }

    let corFinal = null;

    // 🔢 Tentativa por ID
    const corPorId = coresDisponiveis.find(c => c.id === conteudo);

    if (corPorId) {
        // ID válido, qualquer um autorizado pode usar
        corFinal = corPorId.cor;
    } else {
        // ❌ Não é ID
        if (isAdmin) {
            // Admin pode usar cor livre
            corFinal = conteudo.replace("#", "").toUpperCase();
        } else if (premium?.includes(player.name)) {
            // Premium também pode usar cor livre
            corFinal = conteudo.replace("#", "").toUpperCase();
        } else if (isDiamante) {
            // diamante sem admin não pode usar código livre
            room.sendAnnouncement(
                "『🎨』Use !cores para ver as cores disponíveis",
                player.id,
                Cor.laranjaescuro,
                "bold",
                0
            );
            return false;
        }
    }

    // ♻️ Remove cor antiga
    corchat = corchat.filter(c => c[0] !== player.name);

    // 💾 Salva nova cor
    corchat.push([player.name, corFinal]);
    localStorage.setItem("corchat", JSON.stringify(corchat));
    localStorage.setItem("att", JSON.stringify(["y"]));

    room.sendAnnouncement(
        "『✨』Sua cor do chat foi alterada com sucesso.",
        player.id,
        Cor.laranjaescuro,
        "bold",
        0
    );

    return false;
}



		if (message.substr(0, 9) == '!tirartag'){
			const found = tags.find(element => element[0] == player.name); // procura se há algum johador no banco de dados com o nome do player
			if (found) {// se achar o player, apaga a tag anterior e põe a nova
							tags.splice(tags.indexOf(found),1)
							localStorage.setItem("tags", JSON.stringify(tags));
							room.sendAnnouncement("『🗑️』Você retirou a tag", player.id, Cor.Vermelho, "bold", 0);
							att = ["y"]
							localStorage.setItem("att", JSON.stringify(att));
						}
					
					
			else{// se não encontrar nada
				room.sendAnnouncement("『📭』Você não tem tag", player.id, Cor.Vermelho, "bold", 0);
			}
	
		}
	
		if (message.substr(0, 9) == '!tirarcor'){
			const found = corchat.find(element => element[0] == player.name); // procura se há algum johador no banco de dados com o nome do player
			if (found) {// se achar o player, apaga a cor anterior e põe a nova
							corchat.splice(corchat.indexOf(found),1)
							localStorage.setItem("corchat", JSON.stringify(corchat));
							room.sendAnnouncement("『🧹』Você retirou a cor do chat", player.id, Cor.Vermelho, "bold", 0);
							att = ["y"]
							localStorage.setItem("att", JSON.stringify(att));
						}
					
					
			else{// se não encontrar nada
				room.sendAnnouncement("⚪ Você não tem cor de chat", player.id, Cor.Vermelho, "bold", 0);
			}
	
		}			

    // Comando para limpar bans
    if (["!limparbans"].includes(command)) {
		if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name)) {
			if (parts.length == 1) {
				// Limpar todos os bans
				room.clearBans(); // Limpa todos os bans do jogo
				JogadoresBanidosObject = {}; // Limpa o objeto que contém os bans
				jogadoresbanidos = []; // Limpa a lista de jogadores banidos
				localStorage.setItem('banidos', JSON.stringify(jogadoresbanidos)); // Atualiza o armazenamento local
	
				room.sendAnnouncement("『🧹』Todos os bans foram removidos!", null, Cor.Vermelho, "bold", 0);
			}
		} else {
			room.sendAnnouncement("『⛔』Você não tem permissão para executar este comando.", player.id, Cor.Vermelho, "bold", 0);
		}
	}


		if (staff.includes(player.name)) {
		if (Object.keys(Comandos).map(comando=> `${prefixString}${comando}`).includes(messageSplit[0].toLowerCase())) {
			Comandos[messageSplit[0].slice(1)](player, messageSplit[1], messageSplit[2], messageSplit[3]);
		}
			return false;
		}

let login = (id, username, password) => {

    let db = jsonToMap(localStorage.getItem(USER_DATABASE))

    if (!db.get(username)) {
        room.sendAnnouncement("『❌』Usuário não registrado", id)
        return
    }

    if (db.get(username) !== password) {
        room.sendAnnouncement("『❌』Senha errada", id)
        return
    }

    logins.push(username)

    removeFromArray(checkregister, username)
    removeFromArray(checkchat, username)

    const conn = currentConns.get(username.toLowerCase())

    console.log("[LOGIN] conn usada:", conn)

    if (conn) {
        autoLoginConns.set(username.toLowerCase(), conn)
        saveAutoLoginConns(autoLoginConns)

        console.log("[AUTOLOGIN] SALVO:", username, conn)
    }

    room.sendAnnouncement(
        "『🔐』Login automático ativado para esta conexão.",
        id,
        0xA020F0,
        "bold"
    )
}


		  let registro = (username, password) => {
			let db = jsonToMap(localStorage.getItem(USER_DATABASE))
			if (db.get(username)) {
			return room.sendAnnouncement(`『⚠️』${username}, você ja possui um registro informe a senha !senha senha!`, player.id, Cor.Vermelho, Negrito, 2);
			}
			let map = db.set(username, password);
			localStorage.setItem(USER_DATABASE, mapToJson(map))
			room.sendAnnouncement(`『📝』${username}, você se registrou!, use !login <senha> para fazer login!`, player.id, Cor.laranjaescuro, Negrito, 2);
			room.sendAnnouncement('『🔐』'+player.name +', sua senha é: ' + message.substr(11), player.id, Cor.laranjaescuro, Negrito, 2)
			checkregister.push(player.name)
			}
		  
		  
			msg = message;
			if(msg.startsWith("!login") && logins.includes(player.name) == true) { room.sendAnnouncement(`@${player.name}, você já esta logado.`, player.id, Cor.laranjaescuro, Negrito, 2) }
			  if(msg.startsWith("!login") && logins.includes(player.name) == false) {
			  let [password, error] = extractPassword(msg);
				  if (error) {
					  room.sendAnnouncement(`@${player.name}, ${error}`);
					  return false;
				  }
				  login(player.id, player.name, password);
				  return false;
			  }
			  else if(msg.startsWith("!registrar") && message.substr(0, 11) == "!registrar ") {
			let [password, error] = extractPassword(msg);
				  if (error) {
					  room.sendAnnouncement(`@${player.name}, ${error}`);
					  return false;
				  }
				  registro(player.name, password);
				  return false;
			  }
			

if (message.substr(0, 4) == '!pv ') { // envia mensagem privada
	if (message.length > 60) {
		room.sendAnnouncement("『✉️』Sua mensagem é muito grande", player.id, 0x00FF00, Negrito);
	}
	else {
		var texto = message.substr(4).split(' ');
		var idTexto = texto[0];

		// transforma diretamente em número (sem #)
		var idp = parseInt(idTexto);
		if (isNaN(idp)) {
			room.sendAnnouncement("『ℹ️』Use: !pv ID mensagem", player.id, Cor.Vermelho, "bold", 0);
			return false;
		}

		var privado = message.substr(4);
		const playerList = room.getPlayerList();
		const found = playerList.find(element => element.id === idp);

		if (found) {
			const foundblock = ignorepv.find(element => element == found.name);

			if (idp == player.id) {
				room.sendAnnouncement("『🙅』Você não pode enviar mensagens para si mesmo", player.id, Cor.Vermelho, "bold", 0);
				return false;
			}
    
			else {
				if (foundblock) {
					room.sendAnnouncement("『🚫』O player bloqueou mensagens privadas!", player.id, Cor.Vermelho, "bold", 0);
					return false;
				}
				else {
					// mensagem sem "!pv id "
					var msg = privado.substr(idTexto.length + 1);

					room.sendAnnouncement(
						`『📩』[Mensagem de ${player.name}]: ${msg}`,
						found.id,
						Cor.laranjaescuro,
						"bold",
						0
					);

					room.sendAnnouncement(
						`『📤』[Mensagem para ${found.name}]: ${msg}`,
						player.id,
						Cor.laranjaescuro,
						"bold",
						0
					);
					return false;
				}
			}
		}
		else {
			room.sendAnnouncement("『❌』ID não encontrado.", player.id, Cor.Vermelho, "bold", 0);
			return false;
		}
	}
}

		if (message.substr(0, 9) == '!entrada '){ // envia mensagem privada
			if (adminD.includes(player.name) || adminF.includes(player.name) || diamante.includes(player.name)){
				var entrada = message.substr(9)
				const found = entradas.find(element => element[0] == player.name);
				if (found) {
					entradas.splice(entradas.indexOf(found),1);
					entradas.push([player.name, entrada])
					localStorage.setItem("entradas", JSON.stringify(entradas));
					room.sendAnnouncement("Entrada personalizada definida com sucesso!", player.id, Cor.Azul, "bold", 0);
					att = ["y"]
					localStorage.setItem("att", JSON.stringify(att));
				}
				 else {
					entradas.push([player.name, entrada])
					localStorage.setItem("entradas", JSON.stringify(entradas));
					room.sendAnnouncement("Entrada personalizada definida com sucesso!", player.id, Cor.Azul, "bold", 0);
					att = ["y"]
					localStorage.setItem("att", JSON.stringify(att));
				}
		

			}
			else{
				room.sendAnnouncement("『❌』Você não tem permissão para isso.", player.id, Cor.Vermelho, "bold", 0);
			}
	
		}
		if (message.substr(0, 4) == '!an '){ // envia anuncio adm
			if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name)){
				var anuncio = message.substr(3)
					room.sendAnnouncement("『📢』ANÚNCIO ADMIN:" + anuncio, null, 0xFFFF00, "bold", 0);
		

			}
			else{
				room.sendAnnouncement("『❌』Você não tem permissão para isso.", player.id, Cor.Vermelho, "bold", 0);
			}
	
		}
		
		if (message.substr(0, 7) == '!idoff '){
			if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)){
				var nameplayer = message.substr(7)
				const found = dadosjogadores.find(element => element[0] == nameplayer);
				if(found){
					room.sendAnnouncement(`Nome: ${found[0]} | ID: ${found[1]}`, player.id, 0x00FF00, Negrito)
				}
				else{room.sendAnnouncement("Jogador não encontrado", player.id, Cor.Vermelho, "bold", 0);

				}
			
		}
			else{
				room.sendAnnouncement("Você não tem permissão.", player.id, Cor.Vermelho, "bold", 0);
			}
	}	

	if (message.startsWith("!tempovip ")) {

    // Apenas admins
    if (!adminD.includes(player.name) && !adminF.includes(player.name) && !adminS.includes(player.name)) {
        room.sendAnnouncement("Você não tem permissão para usar este comando.", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const idAlvo = message.slice(10).trim();
    const idNum = Number(idAlvo);

    if (isNaN(idNum)) {
        room.sendAnnouncement("Uso correto: !tempovip <id>", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const jogador = room.getPlayerList().find(p => p.id === idNum);
    if (!jogador) {
        room.sendAnnouncement("Jogador não encontrado.", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    let infovip = JSON.parse(localStorage.getItem("infovip")) || [];
    const found = infovip.find(v => v[0] === jogador.name);

    if (!found) {
        room.sendAnnouncement(`${jogador.name} não possui VIP ativo.`, player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const agora = Date.now();
    let restante = found[1] - agora;

    if (restante <= 0) {
        room.sendAnnouncement(`O VIP de ${jogador.name} expirou.`, player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const dias = Math.floor(restante / (1000 * 60 * 60 * 24));
    const horas = Math.floor((restante % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let tipoNome = found[2] === 2 ? "Diamante" : found[2] === 3 ? "Premium" : "Ouro";

    room.sendAnnouncement(
        `VIP ${tipoNome} de ${jogador.name}: ${dias} Dias e ${horas} Horas restantes.`,
        player.id,
        Cor.laranjaescuro,
        "bold",
        0
    );
}


if (message.startsWith("!setvip ")) {

    if (!adminD.includes(player.name) && !adminF.includes(player.name) && !adminS.includes(player.name)) {
        room.sendAnnouncement("Você não tem permissão para usar este comando.", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const args = message.split(" ").slice(1);
    if (args.length < 2) {
        room.sendAnnouncement("Uso correto: !setvip <tipo> <id> [dias]", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const tipoVIP = Number(args[0]); // 1 ouro | 2 diamante | 3 premium
    const idNum = Number(args[1]);
    const dias = args[2] ? Number(args[2]) : null;

    if (![1, 2, 3].includes(tipoVIP)) {
        room.sendAnnouncement("Tipo inválido: 1=Ouro | 2=Diamante | 3=Premium", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    // 🔹 Busca jogador pelo ID REAL da sala
    const alvo = room.getPlayer(idNum);
    if (!alvo) {
        room.sendAnnouncement(`❌ Jogador com ID ${idNum} não está na sala.`, player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const diasMsg = dias ?? (tipoVIP === 1 ? 3 : tipoVIP === 2 ? 7 : 10);
    const nomeTipo = tipoVIP === 1 ? "Ouro" : tipoVIP === 2 ? "Diamante" : "Premium";

    // 🔹 Aplica VIP (tempo)
    vip(alvo, tipoVIP, diasMsg);

    // 🔹 Remove de todos antes
    ouro = ouro.filter(n => n !== alvo.name);
    diamante = diamante.filter(n => n !== alvo.name);
    premium = premium.filter(n => n !== alvo.name);

    // 🔹 Adiciona no VIP correto
    if (tipoVIP === 1) ouro.push(alvo.name);
    if (tipoVIP === 2) diamante.push(alvo.name);
    if (tipoVIP === 3) premium.push(alvo.name);

    localStorage.setItem("ouro", JSON.stringify(ouro));
    localStorage.setItem("diamante", JSON.stringify(diamante));
    localStorage.setItem("premium", JSON.stringify(premium));


    room.sendAnnouncement(
        `✅ VIP ${nomeTipo} definido para ${alvo.name} por ${diasMsg} dias.`,
        player.id,
        0x32CD32,
        "bold",
        0
    );

    return false;
}


if (message.substr(0, 10) == '!tirarvip ') {

    if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name)) {

        const idplayer = message.substr(10).trim();
        const found = dadosjogadores.find(element => String(element[1]) === String(idplayer));

        if (!found) {
            room.sendAnnouncement("Jogador não encontrado.", player.id, Cor.Vermelho, "bold", 0);
            return false;
        }

        let infovip = JSON.parse(localStorage.getItem("infovip")) || [];

        const nome = found[0];
        const vipInfo = infovip.find(v => v[0] === nome);

        if (!vipInfo) {
            room.sendAnnouncement(`O player ${nome} não é VIP.`, player.id, Cor.Vermelho, "bold", 0);
            return false;
        }

        // Remove das listas de VIP
        ouro = ouro.filter(n => n !== nome);
        diamante = diamante.filter(n => n !== nome);
        premium = premium.filter(n => n !== nome);

        // Remove do infovip
        infovip = infovip.filter(v => v[0] !== nome);

        // Remove tag e cor
        tags = tags.filter(t => t[0] !== nome);
        corchat = corchat.filter(c => c[0] !== nome);

        // Salva tudo
        localStorage.setItem("ouro", JSON.stringify(ouro));
        localStorage.setItem("diamante", JSON.stringify(diamante));
        localStorage.setItem("premium", JSON.stringify(premium));
        localStorage.setItem("infovip", JSON.stringify(infovip));
        localStorage.setItem("tags", JSON.stringify(tags));
        localStorage.setItem("corchat", JSON.stringify(corchat));

        room.sendAnnouncement(
            `Você retirou o VIP de ${nome}.`,
            player.id,
            Cor.Vermelho,
            "bold",
            0
        );

    } else {
        room.sendAnnouncement("Você não tem permissão.", player.id, Cor.Vermelho, "bold", 0);
    }
}

			
	alterar_cor(player, message)
	checkar(player, message)
	if (message.length > 1 && message[0].toLowerCase() == 't' && message[1] == ' ') {
    if (player.team != 0) {
    room.getPlayerList().forEach((element) => {if (element.team == player.team) room.sendAnnouncement("[TEAM CHAT] " + player.name + ": " + message.substr(2), element.id, (player.team == 1 ? 16725591 : 3261685), "bold", 0)} )
    return false
    }
	else {
	room.sendAnnouncement("『PV』Você não está em um time.", player.id, Cor.laranjaescuro, 'bold')
	}}

	chatdiscord.push([player.name,message,dataehora()])

	///aovivosend(URLs.chat, {
    ///    content: "```"+"Data dessa mensagem: " + `${dataehora()}` + "\n" +
	///	`${player.name}: ${message}` + "```"
    ///});

	if (ModoChatPausado.includes(player.id)==true){
		return false;
	  }
	  if (player.admin==false && ModoChatPausado.includes(player.id)==false){
		ModoChatPausado.push(player.id);                
		setTimeout(function(){
		ModoChatPausado.splice(ModoChatPausado.indexOf(player.id),1); 
	   }, 1000);
	  }


	if (message.length > limit && player.admin == false){
		return false;
	}

	if (message.match(regex)) {
        return false;
    }

	if (message.match(link)) {
        return false;
    }
	if (message.match(travas)) {
		room.kickPlayer(player.id, "[🚨] Trava Detectado", true);
		return false;
	  }
	  if (message.match(trava)) {
		room.sendAnnouncement(player.id, "[🚨] Trava Detectado", true);
		return false;banimento
	  }
	  if (message.match(sist)) {
		room.sendAnnouncement(player.id, "[🚨] Trava Detectado", true);
		return false;
	  }
	  if (message.match(antitr)) {
		room.sendAnnouncement(player.id, "[🚨] Trava Detectado", true);
		return false;
	  }
	  if (message.match(antitramsg)) {
		room.sendAnnouncement(player.id, "[🚨] Trava Detectado", true);
		return false;
	  }
	  if (message.match(antitravamsg)) {
		room.sendAnnouncement(player.id, "[🚨] Trava Detectado", true);
		return false;
	  }

      if (message.match(racismo)) {
		if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {
			return;
		} else {
			room.kickPlayer(player.id, "🚨 Racismo Detectado", true);
			const found = dadosjogadores.find(element => element[0] == player.name);
			if (found) {
				let datahoje = new Date();
				jogadoresbanidos.push([player.name, found[2], '100', '🚨 Racismo Detectado', datahoje.getTime(), 'Autoban']);
				room.kickPlayer(player.id, 'Você foi banido', false); // kick o player da sala
	
				// Passar a conexão (conn) corretamente para autobans
				autobans(player.name, player.id, message, found[2]); // Certifique-se de que `found[2]` contém a conn correta
			}
			localStorage.setItem('banidos', JSON.stringify(jogadoresbanidos));
			return false;
		}
	}
	if (message.match(nazismo)) {
		if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {
			return;
		} else {
			room.kickPlayer(player.id, "🚨 Nazismo Detectado", true);
			const found = dadosjogadores.find(element => element[0] == player.name);
			if (found) {
				let datahoje = new Date();
				jogadoresbanidos.push([player.name, found[2], '100', '🚨 Nazismo Detectado', datahoje.getTime(), 'Autoban']);
				room.kickPlayer(player.id, 'Você foi banido', false); // kick o player da sala
	
				// Passar a conexão (conn) corretamente para autobans
				autobans(player.name, player.id, message, found[2]); // Certifique-se de que `found[2]` contém a conn correta
			}
			localStorage.setItem('banidos', JSON.stringify(jogadoresbanidos));
	
			return false;
		}
	}
	

		if (message.toLowerCase() == "!p") {
			if (ouro.includes(player.name) || diamante.includes(player.name) || premium.includes(player.name)) {
			pausar(player);
			}
			else {
				room.sendAnnouncement(comandovip,player.id, Cor.Vermelho,  Negrito);
			}
		return false;
	}

	  msgArray = message.split(/ +/);
	  msg = message;
	  originalMessage = message;
	  message = message.split(/ +/);
	  player.team != Team.SPECTATORS ? setActivity(player, 0) : null;


	  if(mutado.includes(player.name) == true){
		return false;
		}
		detectarspam(player, message)

	  if(message == '!rr'){
		if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {
		room.stopGame()
		room.startGame()
		room.sendAnnouncement('A Partida foi reniciada', player.id, 0xFFFF00) + room.sendAnnouncement(player.name + ' reniciou a partida', null, 0x00FF00)
		}}	

		if(message == '!limparchat'){
			if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {
			setTimeout(_ => { room.sendAnnouncement(`${player.name} limpou o chat`, null, 0xFFFFFF, 'italic')}, 1000)
			}
			if(message == '!limparchat'){
				if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {
				i = 50
				while (i >= 0){
					room.sendAnnouncement("", null)
					i--
				}
			}
		}
		}

	  if (msgArray[0].substring(0, 2) === '@@') {
		playerChat(player, message);
		return false;
	}
					

else if (["!ajuda"].includes(message[0].toLowerCase())) { // mostra os comandos
    room.sendAnnouncement(
        "[PV] 📌 COMANDOS GERAIS: " +
        "!registrar, !login, !mudarsenha, !me, !rankinfo, t (chat do time), !bb, !loja, !voteban <@>, " +
        "!mostrarme, !games, !wins, !goals, !assists, !cs, !afk, !afks, !disc, !ids, " +
        "!pv <id> <msg>, !recorde, !mutes, !astros, !uni.",
        player.id,
        Cor.Azul,
        Negrito
    );

    if (premium.includes(player.name)) {
        room.sendAnnouncement(
            "[PV] 👑 VIP PREMIUM — Comandos: " +
            "!tags, !tag <id ou personalizado>, !tirartag, !corchat <id ou personalizado>, !tirarcor, " +
            "!furar, !p, !infovip, !provocar <personalizado>, !lojaprovos (acesso total), " +
            "!entrada, !mutarpv, !cv <mensagem>.",
            player.id,
            0x00EEFF,
            Negrito
        );
    }

    if (diamante.includes(player.name)) {
        room.sendAnnouncement(
            "[PV] 💎 VIP DIAMANTE — Comandos: " +
            "!tags, !tag <id>, !tirartag, !cores, !corchat <id>, !tirarcor, " +
            "!furar, !p, !infovip, !provocar <mensagem>, " +
            "!entrada, !mutarpv, !cv <mensagem>.",
            player.id,
            0x00EEFF,
            Negrito
        );
    }

    if (ouro.includes(player.name)) {
        room.sendAnnouncement(
            "[PV] 🥇 VIP OURO — Comandos: " +
            "!furar, !p, !infovip, !entrada, !mutarpv, !cv <mensagem>.",
            player.id,
            0x00EEFF,
            Negrito
        );
    }

    if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {
        room.sendAnnouncement(
            "[PV] 🛡️ STAFF — Comandos: " +
            "!an, !admin, !limparchat, !rr, !mute <id> <min>, !unmute <id>, !mutes, " +
            "!ban <id> <dias> <motivo>, !desban <id>, !infobans, !limparbans, !verificar <id>.",
            player.id,
            Cor.Vermelho,
            Negrito
        );
    }

    if (adminD.includes(player.name) || adminS.includes(player.name) || adminF.includes(player.name)) {
        room.sendAnnouncement(
            "[PV] 👑 FUNDADORES — Comandos: " +
            "!setsenha, !delsenha, !banip <ip> <dias> <motivo>, !desbanip <ip>, " +
            "!setvip <vip> <id> <tempo>, !codigo <x> <astros>.",
            player.id,
            Cor.Vermelho,
            Negrito
        );
    }
}


	else if (message[0].startsWith("!")) {
		// Verificar se o jogador é um admin de nível permitido para comandos específicos
		if (["!enviarastros", "!resetarastros"].includes(message[0].toLowerCase())) {
			if (!(adminD.includes(player.name) || adminF.includes(player.name))) {
				room.sendAnnouncement("Você não tem permissão para usar este comando.", player.id, Cor.Vermelho, "bold", 0);
				return false;
			}
		}
	
		if (message[0].toLowerCase() === "!enviarastros") {
			var id = message[1];
			var valor = parseInt(message[2], 10); // Converta o valor para um número inteiro
	
			if (isNaN(valor)) {
				room.sendAnnouncement("Valor inválido. Use um número para o valor.", player.id, Cor.Vermelho, "bold", 0);
				return false;
			}
	
			// Verifique se o valor está dentro do intervalo permitido
			if (valor < 1000 || valor > 1000000) {
				room.sendAnnouncement("O valor deve estar entre 1.000 e 1.000.000 Astros.", player.id, Cor.Vermelho, "bold", 0);
				return false;
			}
	
			const playerList = room.getPlayerList();
			const found = playerList.find(element => element['id'] == id);
	
			if (found) {
				if (id == player.id) {
					room.sendAnnouncement("Você não pode enviar Astros para si mesmo", player.id, Cor.Vermelho, "bold", 0);
				} else {
					const findastros = astros.find(element => element[0] == player.name);
	
					if (findastros) {
						if (findastros[1] >= valor) {
							subAstros(player, valor); // Subtrai Astros do jogador
							addAstros(found, valor); // Adiciona Astros ao destinatário
							room.sendAnnouncement(`Você enviou ${valor} Astros para ${found.name}`, player.id, Cor.Branco, "bold", 0);
							room.sendAnnouncement(`Você recebeu ${valor} Astros de ${player.name}`, found.id, 0x00FF00, "bold", 0);
						} else {
							room.sendAnnouncement("Você não tem Astros suficientes. !astros", player.id, Cor.Vermelho, "bold", 0);
						}
					} else {
						room.sendAnnouncement("ERRO, CONTATE UM ADMIN.", player.id, Cor.Vermelho, "bold", 0);
					}
				}
			} else {
				room.sendAnnouncement("ID não encontrado.", player.id, Cor.Vermelho, "bold", 0);
			}
		}
	
		else if (message[0].toLowerCase() === "!resetarastros") {
			var id = message[1];
			var quantidade = parseInt(message[2], 10); // Converta a quantidade para um número inteiro
	
			if (isNaN(quantidade)) {
				room.sendAnnouncement("Quantidade inválida. Use um número para a quantidade.", player.id, Cor.Vermelho, "bold", 0);
				return false;
			}
	
			const playerList = room.getPlayerList();
			const found = playerList.find(element => element['id'] == id);
	
			if (found) {
				const findastros = astros.find(element => element[0] == found.name);
	
				if (findastros) {
					// Atualizar o saldo de Astros
					findastros[1] = quantidade;
	
					// Enviar feedback ao jogador
					room.sendAnnouncement(`O saldo de Astros de ${found.name} foi alterado para ${findastros[1]}.`, player.id, Cor.Branco, "bold", 0);
					room.sendAnnouncement(`Seu saldo de Astros foi alterado para ${findastros[1]} por um administrador.`, found.id, Cor.Branco, "bold", 0);
	
					// Atualizar o armazenamento local
					localStorage.setItem("astros", JSON.stringify(astros));
				} else {
					room.sendAnnouncement("Jogador não encontrado na lista de Astros.", player.id, Cor.Vermelho, "bold", 0);
				}
			} else {
				room.sendAnnouncement("ID não encontrado.", player.id, Cor.Vermelho, "bold", 0);
			}
		}
	}		
	
	
	

	if (message == "!furar") { // comando para furar a fila
		if (ouro.includes(player.name) || diamante.includes(player.name) || premium.includes(player.name)) { // Apenas VIPs comuns e diamante podem usar o comando
			if (!block_comando.includes(player.name)) {
				const playerInGame = room.getPlayerList().find(p => p.id === player.id && p.team !== 0);
				
				if (playerInGame) {
					room.sendAnnouncement("Você não pode usar esse comando enquanto está em jogo.", player.id, Cor.Vermelho, "bold");
				} else {
					room.sendAnnouncement(`${player.name} pulou a fila!!`, null, 0xFFFFFF, "bold");
					block_comando.push(player.name);
					setTimeout(() => {
						room.sendAnnouncement("Pronto, você já pode pular a fila novamente", player.id, 0x00FF00, "bold");
						const index = block_comando.indexOf(player.name);
						if (index !== -1) {
							block_comando.splice(index, 1);
						}
					}, 1000 * 60 * 30); // 30 minutos
	
					const ids = [];
					ids.push(player.id);
					room.getPlayerList().filter(e => e.id !== player.id).forEach(e => ids.push(e.id));
					room.reorderPlayers(ids);
				}
			} else {
				room.sendAnnouncement("Você já pulou a fila, espere alguns minutos.", player.id, Cor.Vermelho, "bold");
			}
		} else {
			room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, "bold");
		}
	}
	
	if (message == '!ids'){
		let ids = room.getPlayerList();
		ids.forEach(function(id) {
			room.sendAnnouncement(`${id['name']}: ${id['id']}`, player.id, 0x00FF00, Negrito, 1);
		});
		
	}
	if (message == '!recorde') { // admiin
		if (streaktop.length > maxTeamSize){
		  room.sendAnnouncement(`O atual recorde é de: ${streaktop[0]} vitórias consecutivas, feito por ${streaktop[1]}, ${streaktop[2]}, ${streaktop[3]}`, player.id, 0xFFFF00, Negrito, 1);
	  }
	  else{
		room.sendAnnouncement(`Não existe recorde ainda.`, player.id, Cor.Vermelho, Negrito, 1);
	  }
	}
	if (message == '!sequencia') { // admiin
		if (streaktop.length > maxTeamSize){
		  room.sendAnnouncement(`A atual sequencia é de: ${streaktop[0]} vitórias consecutivas, feito por ${streaktop[1]}, ${streaktop[2]}, ${streaktop[3]}`, player.id, 0xFFFF00, Negrito, 1);
	  }
	  else{
		room.sendAnnouncement(`Não existe recorde ainda.`, player.id, Cor.Vermelho, Negrito, 1);
	  }
	}
	if (message == '!mutarpv') { // admiin
		if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name) || diamante.includes(player.name)) {
			const found = ignorepv.find(element => element == player.name)
			if (found){
				ignorepv.splice(ignorepv.indexOf(found),1);
				localStorage.setItem("ignorepv", JSON.stringify(ignorepv));
				room.sendAnnouncement("Mensagens privadas desbloqueadas.", player.id, 0x00FF00, "bold", 0);
			}
			else{
				ignorepv.push(player.name)
				localStorage.setItem("ignorepv", JSON.stringify(ignorepv));
				room.sendAnnouncement("Mensagens privadas BLOQUEADAS.", player.id, Cor.Vermelho, "bold", 0);
			}
		}
		else {
		  room.sendAnnouncement('Você não tem permissão.', player.id, Cor.Vermelho, Negrito, 1);
		}
		return false;
	  }
	if (message == '!admin') { // admiin
		if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {

		  room.setPlayerAdmin(player.id,!player.admin);
		}
		else {
		  room.sendAnnouncement('Você não tem permissão.', player.id, Cor.Vermelho, Negrito, 1);
		}
		return false;
	  }

		if (message == "!provos") {
		  room.sendAnnouncement("!provo1 -> CREDO, QUE COISA FEIAA!",  player.id, Cor.Azulclaro, Normal)
		  room.sendAnnouncement("!provo2 -> ÉBOLA NA REDE, HAHAHAHHA",  player.id, Cor.Azulclaro, Normal)
		  room.sendAnnouncement("!provo3 -> SENTIU? CHORA MAIS!!!", player.id, Cor.Azulclaro, Normal)
		  room.sendAnnouncement("!provo4 -> HABLA MAIS LENDA!!!", player.id, Cor.Azulclaro, Normal)
		  room.sendAnnouncement("!provo5 -> O CHORO É LIVRE!!!", player.id, Cor.Azulclaro, Normal)
		}
  
		if (message == "!provo1") {
			if (player.team != 0) {
		  room.sendAnnouncement(player.name + " PROVOCOU!!" + " CREDO, QUE COISA FEIAA!", null, 0xFFFF00, Italic)
		}        else room.sendAnnouncement("『PV』Você não está em uma partida.", player.id, Cor.Vermelho);
	}
  
		  if (message == "!provo2") {
			if (player.team != 0) {
			  room.sendAnnouncement(player.name + " PROVOCOU!!" + " ÉBOLA NA REDE, HAHAHAHHA", null, 0xFFFF00, Italic)
			}        else room.sendAnnouncement("『PV』Você não está em uma partida.", player.id, Cor.Vermelho);
		  }
			  if (message == "!provo3") {
				if (player.team != 0) {
				  room.sendAnnouncement(player.name + " PROVOCOU! " + " SENTIU? CHORA MAIS!!!", null, 0xFFFF00, Italic)
				}        else room.sendAnnouncement("『PV』Você não está em uma partida.", player.id, Cor.Vermelho);
			  }

			  if (message == "!provo4") {
				if (player.team != 0) {
				  room.sendAnnouncement(player.name + " PROVOCOU! " + " HABLA MAIS LENDA!!!", null, 0xFFFF00, Italic)
				}        else room.sendAnnouncement("『PV』Você não está em uma partida.", player.id, Cor.Vermelho);
			  }

			  if (message == "!provo5") {
				if (player.team != 0) {
				  room.sendAnnouncement(player.name + " PROVOCOU! " + " O CHORO É LIVRE!!!", null, 0xFFFF00, Italic)
				}        else room.sendAnnouncement("『PV』Você não está em uma partida.", player.id, Cor.Vermelho);
			  }
  	  
					  if (message == "!rankinfo") {
						room.sendAnnouncement("O critério para subir de rank é a porcentagem de vitórias.", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("🔰APEX(Sem rank)", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("🥉Bronze(25%, II-35%; III-40%)", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("🥈Prata(45%, II-50%; III-55%)", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("🥇Ouro(60%, II-65% III-70%)", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("💎Diamante(72%; II- 74%; III-76%)", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("🌀Estrela(78%; II- 80%; III-82%)", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("👽Extraterrestre(85%)", player.id, Cor.Branco, "bold");
						room.sendAnnouncement("Para ganhar rank, você precisa ter jogado 60 partidas.", player.id, Cor.Branco, "bold");

		}

		if (message == "!disc") {
			var discordLink = "https://discord.gg/zsyCCuq7dH";
			room.sendAnnouncement(discordLink, null, 0x00FF00, Negrito);
		}
		
		if (message == "!dc") {
			var discordLink = "https://discord.gg/zsyCCuq7dH";
			room.sendAnnouncement(discordLink, null, 0x00FF00, Negrito);
		}



if (message == "!uni") {

    const vips = listarPorCategoria(uniformesVipDisponiveis, "vip");
    const selecoes = listarPorCategoria(uniformesDisponiveis, "selecao");
    const internacionais = listarPorCategoria(uniformesDisponiveis, "internacional");
    const brasileiros = listarPorCategoria(uniformesDisponiveis, "brasileiro");

    // Título
    room.sendAnnouncement(
        "🇧🇷 UNIFORMES DISPONÍVEIS 🇧🇷",
        player.id,
        0xFFFFFF,
        "bold"
    );

    // VIP / Especiais → AMARELO
    if (vips)
        room.sendAnnouncement(
            "⭐ ESPECIAIS / VIP:\n" + vips,
            player.id,
            0xFEDD00,
            "bold"
        );

    // Seleções → AZUL
    if (selecoes)
        room.sendAnnouncement(
            "🌍 SELEÇÕES:\n" + selecoes,
            player.id,
            0x00BFFF,
            "bold"
        );

    // Internacionais → VERDE
    if (internacionais)
        room.sendAnnouncement(
            "🌐 TIMES INTERNACIONAIS:\n" + internacionais,
            player.id,
            0x32CD32,
            "bold"
        );

    // Brasileiros → VERDE (mais forte)
    if (brasileiros)
        room.sendAnnouncement(
            "🇧🇷 BRASILEIROS:\n" + brasileiros,
            player.id,
            0xFF3030,
            "bold"
        );

    return false;
}


  if (message == '!random') { 
	if(block_command.includes(player.name) == false){
		block_command.push(player.name)
		setTimeout(() => {
			var remover_playerrandom = block_command.indexOf(player.name) + block_command.splice(remover_playerrandom, 1)
			},tempoMensagem*10)
	var cod = code[(Math.random() * code.length) | 0]
	var cod1 = code1[(Math.random() * code.length) | 0]
	  room.sendAnnouncement(player.name + ", você é " + `${cod}${cod1}%` + " RANDOLA!!", null, Cor.amarelo, Negrito)
	  return false;
	}
	else if (block_command.includes(player.name) == true){
		room.sendAnnouncement("Aguarde 10 segundos para usar o comando novamente", player.id, Cor.laranjaescuro)
		}
	}


/* ================= UNIFORMES VIP ================= */


const comando = message[0].toLowerCase();


const uniformeVip = uniformesVipDisponiveis.find(
    u => "!" + u.id === comando
);

if (uniformeVip) {

if (!isVip(player) && !player.admin) {
        room.sendAnnouncement(
            "❌ Este uniforme é exclusivo para VIP.",
            player.id,
            0xFA5646,
            Negrito
        );
        return false;
    }

    if (!podeTrocarUniforme(player)) {
        room.sendAnnouncement(capitões, player.id, 0xFA5646, Negrito);
        return false;
    }

    aplicarUniforme(player, uniformeVip);
    return false;
}

/* ================= UNIFORMES NORMAIS ================= */

const uniformeNormal = uniformesDisponiveis.find(
    u => "!" + u.id === comando
);

if (uniformeNormal) {

    if (!podeTrocarUniforme(player)) {
        room.sendAnnouncement(capitões, player.id, 0xFA5646, Negrito);
        return false;
    }

    aplicarUniforme(player, uniformeNormal);
    return false;
}

		if (message == "!afk" ){
			var playerdata = JSON.parse(localStorage.getItem("playersData"+sala)) || {}
			if (players.length != 1 && player.team != Team.SPECTATORS) {
				if (player.team == Team.RED && streak > 0 && room.getScores() == null) {
					room.setPlayerTeam(player.id, Team.SPECTATORS);
				} else {
					room.sendAnnouncement("『PV』Não pode ficar AFK enquanto está em uma equipe !", player.id, Cor.Vermelho, Negrito);
					return false;
				}
			} else if (players.length == 1 && !getAFK(player)) {
				room.setPlayerTeam(player.id, Team.SPECTATORS);
			}
			setAFK(player, !getAFK(player));
			room.sendAnnouncement(player.name + (getAFK(player) ? " está AFK !" : " Voltou do AFK !"), null, Cor.Vermelho, Negrito);
			getAFK(player) ? updateRoleOnPlayerOut() : updateRoleOnPlayerIn();
			playerdata[player.name] ? stats = playerdata[player.name] : stats = [0, 0, 0, 0, "0.00", 0, 0, 0, 0, "0.00", "player"];
        setTimeout(() => {
        try{
        if (getAFK(player)) {
        if (semlimiteafk.includes(player.name) == false || ouro.includes(player.name) || diamante.includes(player.name) == false) {
        room.kickPlayer(player.id,"tempo de afk excedido", false)
        }}}
        catch{return;}
        }, 1000 * 60 * 30)
	}
				
		if (message == "!afks" ){
			var cstm = "Lista de AFK : ";
				for (var i = 0; i < extendedP.length; i++) {
				if (room.getPlayer(extendedP[i][eP.ID]) != null && getAFK(room.getPlayer(extendedP[i][eP.ID]))) {
				if (140 - cstm.length < (room.getPlayer(extendedP[i][eP.ID]).name + ", ").length) {
				room.sendAnnouncement(cstm, player.id, Cor.Vermelho, 'bold');
				cstm = "... ";
				}
				cstm += room.getPlayer(extendedP[i][eP.ID]).name + ", ";
				}
				}
				if (cstm == "Lista de AFK : ") {
				room.sendAnnouncement("Não há ninguém na lista de AFK !", player.id, Cor.Vermelho, Negrito, 1);
				return false;
				}
				cstm = cstm.substring(0, cstm.length - 2);
				cstm += ".";
				room.sendAnnouncement(cstm, player.id, Cor.Vermelho);
				}

	if (message == "!bb") {
 room.kickPlayer(player.id, " Não aguentei perder!! ", false);
    }
	if (message == '!astros'){
		const findastros = astros.find(element => element[0] == player.name);
		room.sendAnnouncement(`Seu saldo atual é: ${findastros[1]} Astros`, player.id, Cor.Azulclaro, "bold", 0);
	}
	
if (message == '!comprarouro') {
    const findastros = astros.find(e => e[0] === player.name);
    if (!findastros) {
        room.sendAnnouncement("ERRO, CONTATE UM ADMIN.", player.id, 0xFA5646, "bold", 0);
        return false;
    }
    if (findastros[1] < produtos["ouro"]) {
        room.sendAnnouncement("Você não tem Astros suficientes. !astros, !precos", player.id, 0xFA5646, "bold", 0);
        return false;
    }

    vip(player, 1); // VIP Ouro
    subAstros(player, produtos["ouro"]);

    // 🔹 RECARREGA O SALDO APÓS O DESCONTO
    const saldoAtual = astros.find(e => e[0] === player.name)?.[1] ?? 0;

    room.sendAnnouncement(
        `Você gastou ${produtos["ouro"]} Astros pela compra do seu VIP Ouro`,
        player.id,
        0x00FF00,
        "bold",
        0
    );
    room.sendAnnouncement(
        `Seu saldo atual é: ${saldoAtual} Astros`,
        player.id,
        Cor.Branco,
        "bold",
        0
    );

    localStorage.setItem("att", JSON.stringify(["y"]));
}

	
if (message == '!comprardiamante') {
    const findastros = astros.find(e => e[0] === player.name);
    if (!findastros) {
        room.sendAnnouncement("ERRO, CONTATE UM ADMIN.", player.id, 0xFA5646, "bold", 0);
        return false;
    }
    if (findastros[1] < produtos["diamante"]) {
        room.sendAnnouncement("Você não tem Astros suficientes. !astros, !precos", player.id, 0xFA5646, "bold", 0);
        return false;
    }

    vip(player, 2); // aplica VIP Diamante e atualiza infovip
    subAstros(player, produtos["diamante"]);

    room.sendAnnouncement(`Você gastou ${produtos["diamante"]} Astros pela compra do seu VIP Diamante`, player.id, 0x00FF00, "bold", 0);
    room.sendAnnouncement(`Seu saldo atual é: ${findastros[1]} Astros`, player.id, Cor.Branco, "bold", 0);
    localStorage.setItem("att", JSON.stringify(["y"]));
}


if (message == '!infovip') {
    let infovip = JSON.parse(localStorage.getItem("infovip")) || [];

    const found = infovip.find(v => v[0] === player.name);
    if (!found) {
        room.sendAnnouncement("Você não possui VIP ativo.", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const dataAtual = Date.now();
    let diferencaEmMs = found[1] - dataAtual;

    if (diferencaEmMs <= 0) {
        room.sendAnnouncement("Seu VIP expirou.", player.id, Cor.Vermelho, "bold", 0);
        return false;
    }

    const dias = Math.floor(diferencaEmMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diferencaEmMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let tipoNome = found[2] === 2 ? "Diamante" : found[2] === 3 ? "Premium" : "Ouro";

    room.sendAnnouncement(`∎∎∎∎ VIP ${tipoNome.toUpperCase()} ∎∎∎∎`, player.id, Cor.laranjaescuro, "bold", 0);
    room.sendAnnouncement(`Faltam ${dias} Dias e ${horas} Horas para seu VIP acabar.`, player.id, Cor.laranjaescuro, "bold", 0);
}




	if (message == "!me" ){
		me = JSON.parse(localStorage.getItem("playersData"+sala)) || {}
        var stats;
        me[player.name] ? stats = me[player.name] : stats = [0, 0, 0, 0, "0.00", 0, 0, 0, 0, "0.00"];
        room.sendAnnouncement("『PV』Seus stats " + player.name + ":\n 🎮 Partidas jogadas: " + stats[Ss.GA] + ", ✅ Vitorias: " + stats[Ss.WI] + ", ⭕ Empates: " + stats[Ss.DR] + ", ❌ Derrotas: " + stats[Ss.LS] + " WR: " + stats[Ss.WR] + "%, ⚽️ Gols: " + stats[Ss.GL] + ", 👟 Assistências: " + stats[Ss.AS] + " 🤚 GK: " + stats[Ss.GK] + ", 🤚 CS: " + stats[Ss.CS] + ", 🤚 CS%: " + stats[Ss.CP] + "%", player.id, 0x73EC59, "bold");
        room.sendAnnouncement("『PV』Quer mostrar a todos? Use !mostrarme.", player.id, 0xFF7900, "bold");
    } 	else if (message == "!mostrarme" ){
        var stats;
        me[player.name] ? stats = me[player.name] : stats = [0, 0, 0, 0, "0.00", 0, 0, 0, 0, "0.00"];
        room.sendAnnouncement("[📄] "+ player.name + " mostrou seus stats!", null, 0xFF7900, "bold")
        room.sendAnnouncement("[📄] Stats de " + player.name + ":\n 🎮 Partidas Jogadas: " + stats[Ss.GA] + ", ✅ Vitorias: " + stats[Ss.WI] + ", ⭕ Empates: " + stats[Ss.DR] + ", ❌ Derrotas: " + stats[Ss.LS] + " WR: " + stats[Ss.WR] + "%, ⚽️ Gols: " + stats[Ss.GL] + ", 👟 Assistências: " + stats[Ss.AS] + " 🤚 GK: " + stats[Ss.GK] + ", 🤚 CS: " + stats[Ss.CS] + ", 🤚 CS%: " + stats[Ss.CP] + "%", null, 0x73EC59, "bold");
    } else if (message == "!games" ){
        var tableau = [];
        try {
			const playersDatastats = JSON.parse(localStorage.getItem("playersData"+sala)) || {};  // obtém o objeto playersData do localStorage
			Object.keys(playersDatastats).forEach(function(key) {
				if (!ignore.includes(key)) {
					tableau.push([(playersDatastats[key][Ss.NK]), (playersDatastats[key][Ss.GA])]);
				}
			});
		} catch {
			
		}
        if (tableau.length < 5) {
            room.sendAnnouncement("『PV』Não jogou partidas suficientes", player.id, Cor.Vermelho);
            return false;
        }
        tableau.sort(function(a, b) {
            return b[1] - a[1];
        });
        room.sendAnnouncement("🎮 Players Com Mais Partidas Jogadas: \n #1 " + tableau[0][0] + ": " + tableau[0][1] + "\n #2 " + tableau[1][0] + ": " + tableau[1][1] + "\n #3 " + tableau[2][0] + ": " + tableau[2][1] + "\n #4 " + tableau[3][0] + ": " + tableau[3][1] + "\n #5 " + tableau[4][0] + ": " + tableau[4][1], player.id, 0x73EC59);

        return false;
    } else 	if (message == "!wins" ){
        var tableau = [];
        try {
            const playersDatastats = JSON.parse(localStorage.getItem("playersData"+sala)) || {};  // obtém o objeto playersData do localStorage
			Object.keys(playersDatastats).forEach(function(key) {
                if (!ignore.includes(key)) {
                    tableau.push([(playersDatastats[key][Ss.NK]), (playersDatastats[key][Ss.WI])]);
                }
            });
        } catch {

        }
        if (tableau.length < 5) {
            room.sendAnnouncement("『PV』Não jogou partidas suficientes", player.id, Cor.laranjaescuro, 'bold');
            return false;
        }
        tableau.sort(function(a, b) {
            return b[1] - a[1];
        });
        room.sendAnnouncement("✅ Players Com Mais Vitórias: \n #1 " + tableau[0][0] + ": " + tableau[0][1] + "\n #2 " + tableau[1][0] + ": " + tableau[1][1] + "\n #3 " + tableau[2][0] + ": " + tableau[2][1] + "\n #4 " + tableau[3][0] + ": " + tableau[3][1] + "\n #5 " + tableau[4][0] + ": " + tableau[4][1], player.id, 0x73EC59);

        return false;
    } else 	if (message == "!goals" ){
        var tableau = [];
        try {
            const playersDatastats = JSON.parse(localStorage.getItem("playersData"+sala)) || {};  // obtém o objeto playersData do localStorage
			Object.keys(playersDatastats).forEach(function(key) {
                if (!ignore.includes(key)) {
                    tableau.push([(playersDatastats[key][Ss.NK]), (playersDatastats[key][Ss.GL])]);
                }
            });
        } catch {

        }
        if (tableau.length < 5) {
            room.sendAnnouncement("『PV』Não jogou partidas suficientes", player.id, Cor.laranjaescuro, 'bold');
            return false;
        }
        tableau.sort(function(a, b) {
            return b[1] - a[1];
        });
        room.sendAnnouncement("⚽️ Players Com Mais Gols: \n #1 " + tableau[0][0] + ": " + tableau[0][1] + "\n #2 " + tableau[1][0] + ": " + tableau[1][1] + "\n #3 " + tableau[2][0] + ": " + tableau[2][1] + "\n #4 " + tableau[3][0] + ": " + tableau[3][1] + "\n #5 " + tableau[4][0] + ": " + tableau[4][1], player.id, 0x73EC59);

        return false;
    } else 	if (message == "!assists" ){
        var tableau = [];
        try {
            const playersDatastats = JSON.parse(localStorage.getItem("playersData"+sala)) || {};  // obtém o objeto playersData do localStorage
			Object.keys(playersDatastats).forEach(function(key) {
                if (!ignore.includes(key)) {
                    tableau.push([(playersDatastats[key][Ss.NK]), (playersDatastats[key][Ss.AS])]);
                }
            });
        } catch {

        }
        if (tableau.length < 5) {
            room.sendAnnouncement("『PV』Não jogou partidas suficientes", player.id, Cor.laranjaescuro, 'bold');
            return false;
        }
        tableau.sort(function(a, b) {
            return b[1] - a[1];
        });
        room.sendAnnouncement("👟 Players Com Mais Assistências: \n #1 " + tableau[0][0] + ": " + tableau[0][1] + "\n #2 " + tableau[1][0] + ": " + tableau[1][1] + "\n #3 " + tableau[2][0] + ": " + tableau[2][1] + "\n #4 " + tableau[3][0] + ": " + tableau[3][1] + "\n #5 " + tableau[4][0] + ": " + tableau[4][1], player.id, 0x73EC59);

        return false;
    } else 	if (message == "!cs" ){
        var tableau = [];
        try {
            const playersDatastats = JSON.parse(localStorage.getItem("playersData"+sala)) || {};  // obtém o objeto playersData do localStorage
			Object.keys(playersDatastats).forEach(function(key) {
                if (!ignore.includes(key)) {
                    tableau.push([(playersDatastats[key][Ss.NK]), (playersDatastats[key][Ss.CS])]);
                }
            });
        } catch {

        }
        if (tableau.length < 5) {
            room.sendAnnouncement("『PV』Não jogou partidas suficientes", player.id, Cor.laranjaescuro, 'bold');
            return false;
        }
        tableau.sort(function(a, b) {
            return b[1] - a[1];
        });
        room.sendAnnouncement("🤚 Players Com Mais CS (Não tomar gol) \n #1 " + tableau[0][0] + ": " + tableau[0][1] + "\n #2 " + tableau[1][0] + ": " + tableau[1][1] + "\n #3 " + tableau[2][0] + ": " + tableau[2][1] + "\n #4 " + tableau[3][0] + ": " + tableau[3][1] + "\n #5 " + tableau[4][0] + ": " + tableau[4][1], player.id, 0x73EC59);

        return false;
    }
	if (message == "!mutes" ){
		var cstm = "『PV』Lista de mutados : ";
		if(playermutados.length > 0){
			const namesString = playermutados.join(", ");
			room.sendAnnouncement(cstm + namesString, player.id, Cor.laranjaescuro, "bold", 0);
		}
		else{
			room.sendAnnouncement("Não há jogadores mutados.", player.id, Cor.laranjaescuro, "bold", 0);
		}
		}
		
else if (["!mute"].includes(message[0].toLowerCase())) { 
    if (
        adminD.includes(player.name) ||
        adminF.includes(player.name) ||
        adminS.includes(player.name) ||
        adminA.includes(player.name) ||
        moderadores.includes(player.name)
    ) {
        if (message.length == 3) {
   const idAlvo = Number(message[1]);
const found = dadosjogadores.find(element => element[1] === idAlvo);
            if (found) {
                if (playermutados.find(element => element == found[0])) {
                    room.sendAnnouncement("Jogador ja está mutado.", player.id, Cor.Vermelho, "bold", 0);
                } else {
                    playermutados.push(found[0]);

                    setTimeout(() => {
                        room.sendAnnouncement("Você foi desmutado.", found[1], Cor.Vermelho, "bold", 0);
                        playermutados.splice(playermutados.indexOf(found[0]), 1);
                    }, 1000 * 60 * Number.parseInt(message[2]));

                    room.sendAnnouncement(
                        `O jogador ${found[0]} foi mutado por ${message[2]} minutos`,
                        player.id,
                        Cor.Vermelho,
                        "bold",
                        0
                    );

                    room.sendAnnouncement(
                        `Você foi mutado por ${message[2]} minutos`,
                        found[1],
                        Cor.Vermelho,
                        "bold",
                        0
                    );

                    // ===============================
                    // 🌍 WEBHOOK PÚBLICO DE PUNIÇÕES
                    // ===============================
                    var publicContent =
`👤 **Jogador:** ${found[0]}
🔇 **Punição:** Mute
⏱️ **Duração:** ${message[2]} minutos
🏟️ **Sala:** ${roomNameString}
📅 **Data:** ${new Date().toLocaleDateString("pt-BR")}`;

                    var publicParams = {
                        username: "APEX • Punições",
                        embeds: [
                            {
                                title: "🔇 Mute Aplicado",
                                color: 0xFFA500,
                                description: publicContent,
                                footer: {
                                    text: "Sistema automático de punições"
                                },
                                thumbnail: {
                                    url: "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300"
                                }
                            }
                        ]
                    };

                    var xhrPublic = new XMLHttpRequest();
                    xhrPublic.open(
                        "POST",
                        "https://discord.com/api/webhooks/1456907448798548255/OOJsyGeeXgx5qeSkA-kkrbVUMlvbGIJ-YUKfdkiVsMT6uAYdMMjktqH1YCsBF_aRAvEx"
                    );
                    xhrPublic.setRequestHeader("Content-Type", "application/json");
                    xhrPublic.send(JSON.stringify(publicParams));
                }
            } else {
                room.sendAnnouncement("Jogador não encontrado pelo ID.", player.id, Cor.Vermelho, "bold", 0);
            }
        } else {
            room.sendAnnouncement("Comando errado: !mute id tempo", player.id, Cor.Vermelho, "bold", 0);
        }
    } else {
        room.sendAnnouncement("Você não tem permissão", player.id, Cor.Vermelho, "bold", 0);
    }
}

			else if (["!unmute"].includes(message[0].toLowerCase())) { // comando para desmutar um jogador, deve ser admin, use !mute + ID do jogador
				if (adminD.includes(player.name) || adminF.includes(player.name) || adminS.includes(player.name) || adminA.includes(player.name) || moderadores.includes(player.name)) {			
					if (message.length == 2){
						const found = dadosjogadores.find(element => element[1] == message[1])
						if (found){
							const foundmute = playermutados.find(element => element == found[0])
							if(foundmute){
								playermutados.splice(playermutados.indexOf(foundmute), 1)

								room.sendAnnouncement(`O jogador ${foundmute} foi desmutado!`, player.id, Cor.Vermelho, "bold", 0);
								room.sendAnnouncement(`Você foi desmutado!`, found[1], Cor.Vermelho, "bold", 0);
							}
								else{
									room.sendAnnouncement(`O jogador não está mutado`, player.id, Cor.Vermelho, "bold", 0);
								}
							}
								
						
						else{
							room.sendAnnouncement("Jogador não encontrado pelo ID.", player.id, Cor.Vermelho, "bold", 0);
						}
					}
					else{
						room.sendAnnouncement("Comando errado: !unmute id", player.id, Cor.Vermelho, "bold", 0);
					}
				}
				else{
					room.sendAnnouncement("Você não tem permissão", player.id, Cor.Vermelho, "bold", 0);
				}
				}
			
			
/////////////////////////////////////////////// bans
                
else if (message[0].toLowerCase() === '!banip') {
    if (adminD.includes(player.name) || adminF.includes(player.name)) {
        comandos.banip(player, message[1], message[2], ...message.slice(3));
    } else {
        room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
    }
} else if (message[0].toLowerCase() === '!desbanip') {
    if (adminD.includes(player.name) || adminF.includes(player.name)) {
        comandos.desbanip(player, message[1]);
    } else {
        room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
    }
} else if (message[0].toLowerCase() === '!ban') {
    if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name)) {
        comandos.ban(player, message[1], message[2], ...message.slice(3));
    } else {
        room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
    }
} else if (message[0].toLowerCase() === '!desban') {
    if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name)) {
        comandos.desban(player, message[1]);
    } else {
        room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
    }
} else if (message[0].toLowerCase() === '!infobans') {
    if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name)) {
        comandos.infobans(player);
    } else {
        room.sendAnnouncement("Você não tem permissão para usar esse comando.", player.id, Cor.Vermelho, 'bold', 1);
    }
} 
		
			else if (["!codigo"].includes(message[0].toLowerCase())) {
				// Verificar se o jogador tem permissão
				if (adminD.includes(player.name) || adminF.includes(player.name)) {
					if (message.length == 3) {
						const codigo = message[1];
						const quantidade = parseInt(message[2], 10);
			
						if (isNaN(quantidade)) {
							room.sendAnnouncement("Quantidade inválida. Use um número para a quantidade.", player.id, Cor.Vermelho, "bold", 0);
							return;
						}
			
						codigos.push([codigo, quantidade]);
						localStorage.setItem('codigos', JSON.stringify(codigos));
						room.sendAnnouncement(`Código de ${quantidade} Astros cadastrado!`, player.id, Cor.laranjaescuro, "bold", 0);
						att = ["y"];
						localStorage.setItem("att", JSON.stringify(att));
					} else {
						room.sendAnnouncement("Uso incorreto do comando. Formato correto: !codigo código quantidade", player.id, Cor.Vermelho, "bold", 0);
					}
				} else {
					room.sendAnnouncement("Você não tem permissão para usar este comando.", player.id, Cor.Vermelho, "bold", 0);
				}
			}
			else if (["!receber"].includes(message[0].toLowerCase())) {
				// Verificar se o jogador tem permissão
				if (message.length == 2) {
					const codigo = message[1];
					const found = codigos.find(element => element[0] == codigo);
			
					if (found) {
						codigos.splice(codigos.indexOf(found), 1);
						localStorage.setItem('codigos', JSON.stringify(codigos));
						addAstros(player, found[1]);
						room.sendAnnouncement(`Você resgatou ${found[1]} Astros. Use !astros para ver seu saldo.`, player.id, Cor.laranjaescuro, "bold", 0);
						transacoesPlayers(URLs.transacoes, {
							content: "```" + roomNameString + "\n" + "💲Data dessa transação: " + `${dataehora()}` + "\n" +
							`💲${player.name} resgatou ${found[1]} Astros pelo código "${codigo}"` + "```"
						});
						att = ["y"];
						localStorage.setItem("att", JSON.stringify(att));
					} else {
						room.sendAnnouncement("Código não cadastrado.", player.id, Cor.Vermelho, "bold", 0);
					}
				} else {
					room.sendAnnouncement("Uso incorreto do comando. Formato correto: !receber código", player.id, Cor.Vermelho, "bold", 0);
				}
			}


			else if (["!verificar"].includes(message[0].toLowerCase())) {
				// Verificar se o jogador tem permissão
				if (adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name) || adminS.includes(player.name) || moderadores.includes(player.name)) {
					if (message.length == 2) {
						const idastro = message[1];
						const found = dadosjogadores.find(element => element[1] == idastro);
						const foundastro = astros.find(element => element[0] == found[0]);
			
						if (found && foundastro) {
							room.sendAnnouncement(`O saldo de Astros de ${found[0]} é: ${foundastro[1]} Astros`, player.id, Cor.laranjaescuro, "bold", 0);
						} else {
							room.sendAnnouncement("Jogador não encontrado.", player.id, Cor.Vermelho, "bold", 0);
						}
					} else {
						room.sendAnnouncement("Uso incorreto do comando. Formato correto: !verificar ID", player.id, Cor.Vermelho, "bold", 0);
					}
				} else {
					room.sendAnnouncement("Você não tem permissão para usar este comando.", player.id, Cor.Vermelho, "bold", 0);
				}
			}


			
		else if (["!precos"].includes(message[0].toLowerCase())) { // comando para pegar vip
			room.sendAnnouncement(`〘VIP DIAMANTE - 40.000 Astros〙, 〘VIP Ouro - 20.000 Astros〙, 〘Tags - 10.000 Astros〙, 〘Cor de chat - 10.000 Astros〙`, player.id, Cor.Azulclaro, "bold", 2);

	}
	else if (["!loja"].includes(message[0].toLowerCase())) { // comando para pegar vip
			room.sendAnnouncement(
`🛒 〘 LOJA DE BENEFÍCIOS 〙

💎 VIP Diamante — 30.000 Astros
🥇 VIP Ouro — 10.000 Astros
😈 Provocações — 4.000 Astros

Escolha seu benefício e evolua seu jogo!`,
player.id,
Cor.Azulclaro,
"bold",
2
);

room.sendAnnouncement(
"📌 Comandos disponíveis: !comprardiamante | !comprarouro | !lojaprovo",
player.id,
0xFF4500,
"bold",
2
);
	}

	  if (message[0][0] == "!") { // mensagens com o prefixo [!] não irão aparecer no chat.
	  return false;
	  }
	  
	  if (teamR.length != 0 && teamB.length != 0 && inChooseMode) {

    // Apenas capitães podem escolher
    if (player.id == teamR[0].id || player.id == teamB[0].id) {

        let cmd = message[0].toLowerCase();
        let num = Number.parseInt(cmd);

        // ---------------- RED TURN ----------------
        if (teamR.length <= teamB.length && player.id == teamR[0].id) {

            // TOP
            if (["top", "auto"].includes(cmd)) {
                room.setPlayerTeam(teamS[0].id, Team.RED);
                redCaptainChoice = "top";
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『👟』" + player.name + " usou TOP!", null, Cor.laranjaescuro);
                return false;
            }

            // RANDOM
            else if (["random", "rand"].includes(cmd)) {
                let r = getRandomInt(teamS.length);
                room.setPlayerTeam(teamS[r].id, Team.RED);
                redCaptainChoice = "random";
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『🎲』" + player.name + " usou RANDOM!", null, Cor.laranjaescuro);
                return false;
            }

            // BOTTOM
            else if (["bottom", "bot"].includes(cmd)) {
                room.setPlayerTeam(teamS[teamS.length - 1].id, Team.RED);
                redCaptainChoice = "bottom";
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『⬇️』" + player.name + " usou BOTTOM!", null, Cor.laranjaescuro);
                return false;
            }

            // Escolha numérica
            else if (!Number.isNaN(num)) {
                if (num < 1 || num > teamS.length) {
                    room.sendAnnouncement("『🟥』Número inválido!", player.id, Cor.Vermelho);
                    return false;
                }

                let picked = teamS[num - 1];
                room.setPlayerTeam(picked.id, Team.RED);
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『🥅』" + player.name + " escolheu " + picked.name + "!", null, Cor.laranjaescuro);
                return false;
            }
        }

        // ---------------- BLUE TURN ----------------
        if (teamR.length > teamB.length && player.id == teamB[0].id) {

            // TOP
            if (["top", "auto"].includes(cmd)) {
                room.setPlayerTeam(teamS[0].id, Team.BLUE);
                blueCaptainChoice = "top";
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『👟』" + player.name + " usou TOP!", null, Cor.laranjaescuro);
                return false;
            }

            // RANDOM
            else if (["random", "rand"].includes(cmd)) {
                let r = getRandomInt(teamS.length);
                room.setPlayerTeam(teamS[r].id, Team.BLUE);
                blueCaptainChoice = "random";
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『🎲』" + player.name + " usou RANDOM!", null, Cor.laranjaescuro);
                return false;
            }

            // BOTTOM
            else if (["bottom", "bot"].includes(cmd)) {
                room.setPlayerTeam(teamS[teamS.length - 1].id, Team.BLUE);
                blueCaptainChoice = "bottom";
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『⬇️』" + player.name + " usou BOTTOM!", null, Cor.laranjaescuro);
                return false;
            }

            // Escolha numérica
            else if (!Number.isNaN(num)) {
                if (num < 1 || num > teamS.length) {
                    room.sendAnnouncement("『🟥』Número inválido!", player.id, Cor.Vermelho);
                    return false;
                }

                let picked = teamS[num - 1];
                room.setPlayerTeam(picked.id, Team.BLUE);
                clearTimeout(timeOutCap);
                room.sendAnnouncement("『🥅』" + player.name + " escolheu " + picked.name + "!", null, Cor.laranjaescuro);
                return false;
            }
        }
    }
}

    
	  if (getMute(player.name)) {
        room.sendAnnouncement("Você está mutado.", player.id, Cor.Vermelho);
        return false;
	}

	const found = tags.find(element => element[0] == player.name);
	const foundcor = corchat.find(element => element[0] == player.name)
	if (foundcor){
		var cordochat = foundcor[1]
		var negrito = Negrito
	}
	else{
		var cordochat = 'FFFFFF'
	}

if (found) {
    const corFinal = getCorFinal(player.name, 'FFFFFF');

    room.sendAnnouncement(
        `${found[1]} ${player.name}: ${message.join(' ')}`,
        null,
        '0x' + corFinal,
        Negrito,
        1
    );
    return false;
}


else if (adminF.includes(player.name)) {
    const corFinal = getCorFinal(player.name, coresVIP.adminF);

    room.sendAnnouncement(
        "🔰『Fundador』" + player.name + ": " + message.join(' '),
        null,
        '0x' + corFinal,
        Negrito,
        1
    );
    return false;
}


else if (adminS.includes(player.name)) {
    room.sendAnnouncement(
        "⚖️『Supervisor』 " + player.name + ": " + message.join(' '),
        null,
        + (corchat || 'FFFFFF'),
        Negrito,
        1
    );
    return false;
}
else if (adminA.includes(player.name)) {
    const corFinal = getCorFinal(player.name, coresVIP.adminA);

    room.sendAnnouncement(
        "💼『Administrador』" + player.name + ": " + message.join(' '),
        null,
        '0x' + corFinal,
        Negrito,
        1
    );
    return false;
}


else if (moderadores.includes(player.name)) {
    room.sendAnnouncement(
        "📜『Moderador』" + player.name + ": " + message.join(' '),
        null,
        '0x' + (corchat || 'FFFFFF'),
        Negrito,
        1
    );
    return false;
}

else if (premium.includes(player.name)) {
    const corFinal = getCorFinal(player.name, coresVIP.premium);

    room.sendAnnouncement(
        "👑『VIP PREMIUM』" + player.name + ": " + message.join(' '),
        null,
        '0x' + corFinal,
        Negrito,
        1
    );
    return false;
}


else if (diamante.includes(player.name)) {
    const corFinal = getCorFinal(player.name, coresVIP.diamante);

    room.sendAnnouncement(
        "💎『VIP DIAMANTE』" + player.name + ": " + message.join(' '),
        null,
        '0x' + corFinal,
        Negrito,
        1
    );
    return false;
}


else if (ouro.includes(player.name)) {
    const corFinal = getCorFinal(player.name, coresVIP.ouro);

    room.sendAnnouncement(
        "🥇『VIP OURO』" + player.name + ": " + message.join(' '),
        null,
        '0x' + corFinal,
        Negrito,
        1
    );
    return false;
}



	if(L1.includes(player.name) === true && verificados.includes(player.name) === true){

	room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [OLUS] "+ player.name + ": " + message.join(' '), null, cL1, fL1)		
	return false;
	}
	if(L2.includes(player.name) === true && verificados.includes(player.name) === true){

	room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [] "+ player.name + ": " + message.join(' '), null, cL2, fL2)	
	return false;
	}
	if(L3.includes(player.name) === true && verificados.includes(player.name) === true){

		room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [] "+ player.name + ": " + message.join(' '), null, cL3, fL3)	
		return false;
		}
		if(L4.includes(player.name) === true && verificados.includes(player.name) === true){

			room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [] "+ player.name + ": " + message.join(' '), null, cL4, fL4)	
			return false;
			}
		
			if(L5.includes(player.name) === true && verificados.includes(player.name) === true){


				room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [] "+ player.name + ": " + message.join(' '), null, cL5, fL5)	
				return false;
				}
			
				if(L6.includes(player.name) === true && verificados.includes(player.name) === true){

					room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [] "+ player.name + ": " + message.join(' '), null, cL6, fL6)	
					return false;
					}
					if(L7.includes(player.name) === true && verificados.includes(player.name) === true){
						room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [] "+ player.name + ": " + message.join(' '), null, cL7, fL7)	
						return false;
						}
					if(L10.includes(player.name) === true && verificados.includes(player.name) === true){


						room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [PLUS] "+ player.name + ": " + message.join(' '), null, cL10, fL10)	
						return false;
						}	
						if(L11.includes(player.name) === true && verificados.includes(player.name) === true){
	

							room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [PLUS] "+ player.name + ": " + message.join(' '), null, cL11, fL11)	
							return false;
							}	
							if(L12.includes(player.name) === true && verificados.includes(player.name) === true){
		

								room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [PLUS] "+ player.name + ": " + message.join(' '), null, cL12, fL12)	
								return false;
								}	

								if(L13.includes(player.name) === true && verificados.includes(player.name) === true){//MVP+
			

									room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [PREMIUM] "+ player.name + ": " + message.join(' '), null, cL13, fL13)	
									return false;
									}	

									if(L14.includes(player.name) === true && verificados.includes(player.name) === true){//MVP+
					

										room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [PLUS] "+ player.name + ": " + message.join(' '), null, cL14, fL14)	
										return false;
										}	
										if(L15.includes(player.name) === true && verificados.includes(player.name) === true){//MVP+
					

											room.sendAnnouncement("[⚽: " + stats[Ss.GL] +"] [PLUS] "+ player.name + ": " + message.join(' '), null, cL15, fL15)	
											return false;
											}	
						
						
						if (booster.includes(player.name)) {
							


							room.sendAnnouncement("[BOOSTER] " + player.name + ": " + message.join(' '), null, 0xF000FF, Normal, 1);
							return false;
						}

						var playerdata = JSON.parse(localStorage.getItem("playersData"+sala)) || {}
						if (playerdata[player.name]){ // elo definido por vitórias dos registrados
							stats = playerdata[player.name];
							let db = jsonToMap(localStorage.getItem(USER_DATABASE)) 					 
							if (db.get(player.name)) {
								if (stats[Ss.GA] > 60 && stats[Ss.WR] > 85){
									room.sendAnnouncement("👽『Extraterrestre』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 82){
									room.sendAnnouncement("🌀🌀🌀『ESTRELA』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 80 ){
									room.sendAnnouncement("🌀🌀『ESTRELA』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 78 ){
									room.sendAnnouncement("🌀『ESTRELA』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 76 ){
									room.sendAnnouncement("💎💎💎『DIAMANTE』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 74 ){
									room.sendAnnouncement("💎💎『DIAMANTE』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 72){
									room.sendAnnouncement("💎『DIAMANTE』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 70 ){
									room.sendAnnouncement("🥇🥇🥇『OURO』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								}else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 65 ){
									room.sendAnnouncement("🥇🥇『OURO』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								} else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 60){
									room.sendAnnouncement("🥇『OURO』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								} else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 55){
									room.sendAnnouncement("🥈🥈🥈『PRATA』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								} else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 50){
									room.sendAnnouncement("🥈🥈『PRATA』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								} else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 45 ){
									room.sendAnnouncement("🥈『PRATA』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								} else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 40){
									room.sendAnnouncement("🥉🥉🥉『BRONZE』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								} else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 35){
									room.sendAnnouncement("🥉🥉『BRONZE』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
								} else if (stats[Ss.GA] > 60 && stats[Ss.WR] > 25){
									room.sendAnnouncement("🥉『BRONZE』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
									} else {
									room.sendAnnouncement("『✅』"+ player.name + ": " + message.join(' '), null, '0x'+cordochat, negrito ? negrito : null)
									}
									return false;
										}
										else {
											room.sendAnnouncement("『❌』"+ player.name + ": " + msg + "", null, '0x'+cordochat, negrito ? negrito : null)
										}
									return false;
								}
                            }
							
							


  room.onPlayerActivity = function (player) {
	  setActivity(player, 0);
  }
  
  room.onPlayerBallKick = function(player) {
    if (lastPlayersTouched[0] == null || player.id != lastPlayersTouched[0].id) {
        !activePlay ? activePlay = true : null;
        lastTeamTouched = player.team;
        lastPlayersTouched[1] = lastPlayersTouched[0];
        lastPlayersTouched[0] = player;
    }
}

  
	  /* GAME MANAGEMENT */
  
room.onGameStart = function (byPlayer) {
	game = new Game(Date.now(), room.getScores(), []);
	countAFK = true;
	activePlay = false;
	goldenGoal = false;
	endGameVariable = false;
	lastPlayersTouched = [null, null]
    Rposs = 0;
	Bposs = 0;
	GKList = []
	allReds = []
	allBlues = []  
	if (teamR.length == maxTeamSize && teamB.length == maxTeamSize) {
	  for (var i = 0; i < maxTeamSize; i++) {
	  allReds.push(teamR[i]);
	  allBlues.push(teamB[i]);
	  }
	  }
	  for (var i = 0; i < extendedP.length; i++) {
	  extendedP[i][eP.GK] = 0;
	  extendedP[i][eP.ACT] = 0;
	  room.getPlayer(extendedP[i][eP.ID]) == null ? extendedP.splice(i, 1) : null;
	  }
	  room.sendAnnouncement("• A partida está sendo gravada.", null, Cor.Verde, Negrito);
	  room.sendAnnouncement("• Use !uni para ver os uniformes..", null, Cor.Azulclaro, Negrito);
	  room.startRecording();
	  deactivateChooseMode();
	  resetPause();
}


var mensagem_programada;
var mensagemIntervalo = 1000 * 60 * 15;//

mensagem_programada = setInterval(function(){
}, mensagemIntervalo)//

room.onGameStop = function (byPlayer) {
	partida = true;
	if (endGameVariable) {
	updateTeams();
	solo()
	if (inChooseMode) {
	if (players.length == 2 * maxTeamSize) {
	inChooseMode = false;
	resetBtn();
	for (var i = 0; i < maxTeamSize; i++) {
	setTimeout(() => { randomBtn(); }, 400 * i);
	}
	setTimeout(() => { room.startGame(); }, 2000);
	}
	else {
	if (lastWinner == Team.RED) {
	blueToSpecBtn();
	}
	else if (lastWinner == Team.BLUE) {
	redToSpecBtn();
	blueToRedBtn();
	}
	else {
	resetBtn();
	}
	setTimeout(() => { topBtn(); }, 500);
	}
	}
	else {
	if (players.length == 2) {
	if (lastWinner == Team.BLUE) {
	room.setPlayerTeam(teamB[0].id, Team.RED);
	room.setPlayerTeam(teamR[0].id, Team.BLUE);
	}
	setTimeout(() => { room.startGame(); }, 2000);
	}
	else if (players.length == 3 || players.length >= 2 * maxTeamSize + 1) {
	if (lastWinner == Team.RED) {
	blueToSpecBtn();
	}
	else {
	redToSpecBtn();
	blueToRedBtn();
	}
	setTimeout(() => { topBtn(); }, 200);
	setTimeout(() => { room.startGame(); }, 2000);
	}
	else if (players.length == 4) {
	resetBtn();
	setTimeout(() => { randomBtn(); setTimeout(() => { randomBtn(); }, 500); }, 500);
	setTimeout(() => { room.startGame(); }, 2000);
	}
	else if (players.length == 5 || players.length >= 2 * maxTeamSize + 1) {
	if (lastWinner == Team.RED) {
	blueToSpecBtn();
	}
	else {
	redToSpecBtn();
	blueToRedBtn();
	}
	setTimeout(() => { topBtn(); }, 200);
	activateChooseMode();
	}
	else if (players.length == 6) {
	resetBtn();
	setTimeout(() => { randomBtn(); setTimeout(() => { randomBtn(); setTimeout(() => { randomBtn(); }, 500); }, 500); }, 500);
	setTimeout(() => { room.startGame(); }, 2000);
	}
	}
	}
}
  
  room.onGamePause = function (byPlayer) {
	pauseGame = true;
  }
	  
  room.onGameUnpause = function (byPlayer) {
	  if (teamR.length == 4 && teamB.length == 4 && inChooseMode || (teamR.length == teamB.length && teamS.length < 2 && inChooseMode)) {
	  deactivateChooseMode();
	  }
	  pauseGame = false;
  }
  
  room.onTeamGoal = function (team) {
	activePlay = false;
	countAFK = false;
	const scores = room.getScores();
	let players = room.getPlayerList();

    for (let i = 0; i < players.length; i++) {
        if (players[i].team == team) room.setPlayerAvatar(players[i].id, "⚽");
    }
    setTimeout(() => {
        for (let i = 0; i < players.length; i++) {
           room.setPlayerAvatar(players[i].id, null);
        }
    }, resetarAvatarEm * 1000);
	game.scores = scores;
	if (lastPlayersTouched[0] != null && lastPlayersTouched[0].team == team) {
	if (lastPlayersTouched[1] != null && lastPlayersTouched[1].team == team) {
	var frasegol = frasesGOL[(Math.random() * frasesGOL.length) | 0]
	var fraseasis = frasesASS[(Math.random() * frasesASS.length) | 0]
	room.sendAnnouncement(getTime(scores) + frasegol + lastPlayersTouched[0].name + fraseasis + lastPlayersTouched[1].name + ". VELOCIDADE : " + ballSpeed.toPrecision(4).toString() + "km/h. " + (team == Team.RED ? "" : ""),null,(team == Team.RED ? Cor.Vermelho : 0x00a2ff), Negrito);
	try{game.goals.push(new Goal(scores.time, team, lastPlayersTouched[0], lastPlayersTouched[1]));}
	catch{}
	}
	else {
	var frasegol = frasesGOL[(Math.random() * frasesGOL.length) | 0]
	room.sendAnnouncement(getTime(scores) + frasegol + lastPlayersTouched[0].name + ", VELOCIDADE : " + ballSpeed.toPrecision(4).toString() + "km/h. " + (team == Team.RED ? "" : ""),null,(team == Team.RED ? Cor.Vermelho : 0x00a2ff), Negrito);//Cor.Vermelho
    try{game.goals.push(new Goal(scores.time, team, lastPlayersTouched[0], null));}
	catch{}
	}
	}
	else {
	var fraseautogol = golcontra[(Math.random() * golcontra.length) | 0]
	try{room.sendAnnouncement(getTime(scores) + fraseautogol + lastPlayersTouched[0].name + ", VELOCIDADE : " + ballSpeed.toPrecision(4).toString() + "km/h. " + (team == Team.RED ? "" : ""),null,(team == Team.RED ? Cor.Vermelho : 0x00a2ff), Negrito);}
	catch{}
	try{game.goals.push(new Goal(scores.time, team, null, null));}
	catch{}
	}
	if (scores.scoreLimit != 0 && (scores.red == scores.scoreLimit || scores.blue == scores.scoreLimit && scores.blue > 0 || goldenGoal == true)) {
	endGame(team);
	goldenGoal = false;
	setTimeout(() => { room.stopGame(); }, 1000);
	}
}
  
  room.onPositionsReset = function () {
	  countAFK = true;
	  lastPlayersTouched = [null, null];
  }
  
	  /* MISCELLANEOUS */
  
room.onRoomLink=(link)=>{
}
  
  room.onPlayerAdminChange = function (changedPlayer, byPlayer) {
	  if (getMute(changedPlayer) && changedPlayer.admin) {
	  room.sendAnnouncement(changedPlayer.name + " foi desmutado.", Cor.Verde);
	  setMute(changedPlayer, false);
	  }
  }
  
  room.onStadiumChange = function (newStadiumName, byPlayer) {
  }

function removeFromArray(arr, value) {
    const i = arr.indexOf(value)
    if (i !== -1) arr.splice(i, 1)
}


  //funcões
// Função para verificar se o jogador tem permissão
function hasPermission(player) {
    return adminF.includes(player.name) || (chaveAtivada && jogadoresComAcessoEspecial.includes(player.name));
}

// Função para definir a senha da sala
function setRoomPassword(admin, password) {
    room.setPassword(password);
    room.sendAnnouncement("A senha da sala foi alterada por " + admin.name, null, 0x00FF00, Negrito, 1);
}

// Função para remover a senha da sala
function deleteRoomPassword(admin) {
    room.setPassword(null); // Define senha como null para remover completamente
    room.sendAnnouncement("A senha da sala foi removida por " + admin.name, null, Cor.Vermelho, Negrito, 1);
    // Adicione um log para depuração
    console.log(`Senha removida por ${admin.name}`);
}

// Função para converter um IP para IPv4 (simplificado)
function garantirIPv4(ip) {
    let parts = ip.split(':');
    return parts.length > 1 ? parts[parts.length - 1] : ip;
}


function manterPermissaoAtiva() {
    // Verifica cada jogador que está no array adminUsers e se ele está na sala
    adminUsers.forEach(player => {
        if (room.getPlayer(player.id) && !adminA.includes(player.name)) {
            adminA.push(player.name);
            room.sendAnnouncement("Permissão de admin mantida!", player.id, Cor.Verde, "bold", 0);
        }
    });

    // Verifica cada jogador que está no array founderUsers e se ele está na sala
    founderUsers.forEach(player => {
        if (room.getPlayer(player.id) && !adminF.includes(player.name)) {
            adminF.push(player.name);
            room.sendAnnouncement("Permissão de fundador mantida!", player.id, Cor.Vermelho, "bold", 0);
        }
    });
}


setInterval(manterPermissaoAtiva, 15000); // Executa a cada 15 segundos



// Função que verifica se um jogador é admin para uso em outros comandos
function isAdmin(player) {
    return adminD.includes(player.name) || adminF.includes(player.name) || adminA.includes(player.name);
}

function setAdminIfNeeded(player, level) {
    const now = Date.now();
    const lastCheck = lastAdminCheck[player.name] || 0;

    // Se passaram mais de 15 segundos desde o último check
    if (now - lastCheck > 15000) {
        setAdmin(player, level); // Chama a função para setar o admin
        lastAdminCheck[player.name] = now; // Atualiza o último check para agora
    }
}

// Verificação de permissões para comandos
function temPermissao(player) {
    return adminD.includes(player.name) || adminF.includes(player.name) || diamante.includes(player.name);
}
 
//////////////////////

// Função para listar cores disponíveis
function listarCoresDisponiveis(player) {
    const lista = coresDisponiveis.map(cor => `ID: ${cor.id} - Cor: ${cor.nome}`).join("\n");
    room.sendAnnouncement(`Cores disponíveis para compra:\n${lista}`, player.id, Cor.Branco, Negrito, 0);
}


///////////////////////


  //
function sendAnnouncementToDiscord(player, ipv4) {

  const embed = {
    description:
  "```" + "📝Informações do jogador, conn, auth, IP e data ⏰" + "\n" +
        "✨" + "O jogador " + player.name + " entrou na sala " + roomNameString + "." + "\n" +
        "🌎" + "Conn: " + player.conn + "\n" +
        "💻" + "Auth: " + player.auth + "\n" +
        "🌐" + "IPV4: " + (ipv4) + "\n" +
        "🆔" + "Id: " + player.id + "\n" +
        "⏱" + "Data: " + `${getDateInfo()}` + "```",
    color: 0x00BFFF,
    timestamp: new Date().toISOString()
  };

  const payload = {
    username: "APEX",
    avatar_url:
      "https://cdn.discordapp.com/icons/1061801723947143178/e0ccc58d72ed223583bf13d4335229ed.webp?size=300",
    embeds: [embed]
  };

  const request = new XMLHttpRequest();
  request.open(
    "POST",
    "https://discord.com/api/webhooks/1449565692864106556/FInFqBKH3CL4ERRZPwe5bPIuKdKnJoxBtGydyofnmN1oyKAahjUnAT488s_XOdhOzAvq"
  );
  request.setRequestHeader("Content-Type", "application/json");
  request.send(JSON.stringify(payload));
}


function getDate(){
let data = new Date(),
dia=data.getDate().toString().padStart(2, '0'),
mes=(data.getMonth()+1).toString().padStart(2, '0'),
ano=data.getFullYear(),
horas=data.getHours().toString().padStart(2, '0'),
minutos=data.getMinutes().toString().padStart(2, '0');
segundos=data.getSeconds().toString().padStart(2, '0');

return `${dia}${minutos}${segundos}`;
}

  // Cada jogador que está jogando tem a chance de pausar o jogo apenas uma vez.
  function pausar(player) {
	  if (partida == true) room.sendAnnouncement("A partida ainda não começou.", player.id, Cor.Vermelho, Negrito);
	  else {
		  if (player.team != 0) {
			  if (pausePlayers.includes(player.id)) room.sendAnnouncement("Você não pode pausar a partida até que ele termine.", player.id, Cor.Vermelho, Negrito);
			  else {
				  if (pauseGame == true) room.sendAnnouncement("A partida já está pausada.", player.id, Cor.Azulescuro, Negrito);
				  else {
					  pausePlayers.push(player.id);
					  room.sendAnnouncement(`${player.name} pausou a partida por ${tempoDePause/1000} segundos.`, null, Cor.Branco, Negrito); // tempoDePause dividido por 1000 = 5
					  room.pauseGame(true);
					  setTimeout(_=> {room.pauseGame(false);}, tempoDePause);
				  }
			  }
		  }
		  else room.sendAnnouncement("Você não está em nenhum time.", player.id, Cor.Vermelho, Negrito);
	  }
  }
  
  function removerPlayer(player) {
	  if (pausePlayers.includes(player.id)) {
		  pausePlayers.splice(pausePlayers.indexOf(player.id), 1);
	  }
  }
  
  function resetPause() {
	  pausePlayers = [];
	  pauseGame = false;
	  partida = false;
  }
  
  room.setTeamsLock(true)


function aovivosend(url, params = {}) {

    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);

    xhr.setRequestHeader("Content-Type", "application/json"); // formato json

    /**
     * DISCORD WEBHOOK PARAMS
     * https://birdie0.github.io/discord-webhooks-guide/index.html
     */
    xhr.send(JSON.stringify(params));

}
function transacoesPlayers(url, params = {}) {

    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);

    xhr.setRequestHeader("Content-Type", "application/json"); // formato json

    /**
     * DISCORD WEBHOOK PARAMS
     * https://birdie0.github.io/discord-webhooks-guide/index.html
     */
    xhr.send(JSON.stringify(params));

}

function dadossala(url, params = {}) {

    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);

    xhr.setRequestHeader("Content-Type", "application/json"); // formato json

    /**
     * DISCORD WEBHOOK PARAMS
     * https://birdie0.github.io/discord-webhooks-guide/index.html
     */
    xhr.send(JSON.stringify(params));

}


function cor_e_fonte(){
	if(cL1.length == 0) cL1.push('0xFFFFFF')
	if(cL2.length == 0) cL2.push('0xFFFFFF')
	if(cL3.length == 0) cL3.push('0xFFFFFF')
	if(cL4.length == 0) cL4.push('0xFFFFFF')
	if(cL5.length == 0) cL5.push('0xFFFFFF')
	if(cL6.length == 0) cL6.push('0xFFFFFF')
	if(cL7.length == 0) cL7.push('0x008000')
	if(cL8.length == 0) cL8.push('0x008000')
	if(cL10.length == 0) cL10.push('0x008000')
	if(cL11.length == 0) cL11.push('0x008000')
	if(cL12.length == 0) cL12.push('0x008000')
	if(cL13.length == 0) cL13.push('0x008000')
	if(cL14.length == 0) cL14.push('0x008000')
	if(cL15.length == 0) cL15.push('0x008000')
	
	
	
	if(fL1.length == 0) fL1.push('normal') 
	if(fL2.length == 0) fL2.push('normal')
	if(fL3.length == 0) fL3.push('normal') 
	if(fL4.length == 0) fL4.push('normal')
	if(fL5.length == 0) fL5.push('normal')  
	if(fL6.length == 0) fL6.push('normal')
	if(fL7.length == 0) fL7.push('bold') 
	if(fL8.length == 0) fL8.push('bold') 
	if(fL10.length == 0) fL10.push('bold')
	if(fL11.length == 0) fL11.push('bold')
	if(fL12.length == 0) fL12.push('bold')
	if(fL13.length == 0) fL13.push('bold')
	if(fL14.length == 0) fL14.push('0x008000')
	if(fL15.length == 0) fL15.push('0x008000')

	}

function checkar(player, message){
	if (message.substr(0, 5) == "!cor " && message.length > 11) {
	room.sendAnnouncement(`O Código deve conter apenas 6 números ou letras \nfaça sua cor aqui ${linkhaxcolors} \nexemplos vermelho = !cor Cor.Vermelho`, player.id)
	return false;
	}
	if (message.substr(0, 5) == "!cor ") { if(verificados.includes(player.name) === false) room.sendAnnouncement(`${erro}`, player.id)}
	if (message.substr(0, 7) == "!fonte ") { if(verificados.includes(player.name) === false) room.sendAnnouncement(`${erro}`, player.id)}
	alterar_fonte(player, message)	
}
  
  function solo(){
	if (teamR.length == 1 || teamB.length == 0) {
	setTimeout(() => { room.startGame(); }, 2000);
	}
	else {
		if (teamR.length == 0 || teamB.length == 1) {
		setTimeout(() => { room.startGame(); }, 2000);
		}
	}
}
  
  function Goal(time, team, striker, assist) {
	  this.time = time;
	  this.team = team;
	  this.striker = striker;
	  this.assist = assist;
  }
  
  function Game(date, scores, goals) {
	  this.date = date;
	  this.scores = scores;
	  this.goals = goals;
  }
  
  function getRandomInt(max) { // returns a random number from 0 to max-1
	  return Math.floor(Math.random() * Math.floor(max));
  }
  
  function getTime(scores) { // returns the current time of the game
	  return "[" + Math.floor(Math.floor(scores.time / 60) / 10).toString() + Math.floor(Math.floor(scores.time / 60) % 10).toString() + ":" + Math.floor(Math.floor(scores.time - (Math.floor(scores.time / 60) * 60)) / 10).toString() + Math.floor(Math.floor(scores.time - (Math.floor(scores.time / 60) * 60)) % 10).toString() + "]"
  }
  
  function pointDistance(p1, p2) {
	  var d1 = p1.x - p2.x;
	  var d2 = p1.y - p2.y;
	  return Math.sqrt(d1 * d1 + d2 * d2);
  }
  
	  /* BUTTONS */

  function topBtn() {
	  if (teamS.length == 0) {
	  return;
	  }
	  else {
	  if (teamR.length == teamB.length) {
	  if (teamS.length > 1) {
	  room.setPlayerTeam(teamS[0].id, Team.RED);
	  room.setPlayerTeam(teamS[1].id, Team.BLUE);
	  }
	  return;
	  }
	  else if (teamR.length < teamB.length) {
	  room.setPlayerTeam(teamS[0].id, Team.RED);
	  }
	  else {
	  room.setPlayerTeam(teamS[0].id, Team.BLUE);
	  }
	  }
  }
  
  function randomBtn() {
	  if (teamS.length == 0) {
	  return;
	  }
	  else {
	  if (teamR.length == teamB.length) {
	  if (teamS.length > 1) {
	  var r = getRandomInt(teamS.length);
	  room.setPlayerTeam(teamS[r].id, Team.RED);
	  teamS = teamS.filter((spec) => spec.id != teamS[r].id);
	  room.setPlayerTeam(teamS[getRandomInt(teamS.length)].id, Team.BLUE);
	  }
	  return;
	  }
	  else if (teamR.length < teamB.length) {
	  room.setPlayerTeam(teamS[getRandomInt(teamS.length)].id, Team.RED);
	  }
	  else {
	  room.setPlayerTeam(teamS[getRandomInt(teamS.length)].id, Team.BLUE);
	  }
	  }
  }
  
  function blueToSpecBtn() {
	  resettingTeams = true;
	  setTimeout(() => { resettingTeams = false; }, 100);
	  for (var i = 0; i < teamB.length; i++) {
	  room.setPlayerTeam(teamB[teamB.length - 1 - i].id, Team.SPECTATORS);
	  }
  }
  
  function redToSpecBtn() {
	  resettingTeams = true;
	  setTimeout(() => { resettingTeams = false; }, 100);
	  for (var i = 0; i < teamR.length; i++) {
	  room.setPlayerTeam(teamR[teamR.length - 1 - i].id, Team.SPECTATORS);
	  }
  }
  
  function resetBtn() {
	  resettingTeams = true;
	  setTimeout(() => { resettingTeams = false; }, 100);
	  if (teamR.length <= teamB.length) {
	  for (var i = 0; i < teamR.length; i++) {
	  room.setPlayerTeam(teamB[teamB.length - 1 - i].id, Team.SPECTATORS);
	  room.setPlayerTeam(teamR[teamR.length - 1 - i].id, Team.SPECTATORS);
	  }
	  for (var i = teamR.length; i < teamB.length; i++) {
	  room.setPlayerTeam(teamB[teamB.length - 1 - i].id, Team.SPECTATORS);
	  }
	  }
	  else {
	  for (var i = 0; i < teamB.length; i++) {
	  room.setPlayerTeam(teamB[teamB.length - 1 - i].id, Team.SPECTATORS);
	  room.setPlayerTeam(teamR[teamR.length - 1 - i].id, Team.SPECTATORS);
	  }
	  for (var i = teamB.length; i < teamR.length; i++) {
	  room.setPlayerTeam(teamR[teamR.length - 1 - i].id, Team.SPECTATORS);
	  }
	  }
  }
  
  function blueToRedBtn() {
	  resettingTeams = true;
	  setTimeout(() => { resettingTeams = false; }, 100);
	  for (var i = 0; i < teamB.length; i++) {
	  room.setPlayerTeam(teamB[i].id, Team.RED);
	  }
  }
  
	  /* GAME FUNCTIONS */

function checkTime() {
	  const scores = room.getScores();
	  game.scores = scores;
	  if (Math.abs(scores.time - scores.timeLimit) <= 0.01 && scores.timeLimit != 0) {
	  if (scores.red != scores.blue) {
	  if (checkTimeVariable == false) {
	  checkTimeVariable = true;
	  setTimeout(() => { checkTimeVariable = false; }, 3000);
	  scores.red > scores.blue ? endGame(Team.RED) : endGame(Team.BLUE);
	  setTimeout(() => { room.stopGame(); }, 2000);
	  }
	  return;
	  }
	  goldenGoal = true;
	  room.sendAnnouncement("『⚽』GOL DE OURO", null, Cor.Ouro, Negrito);
	  room.sendAnnouncement("『⏳』60 segundos até a partida ser terminada !", null, Cor.Branco, Negrito);
	  }

	  if (Math.abs(scores.time - drawTimeLimit * 60) <= 0.01 && players.length >= 2) {
	  if (checkTimeVariable == false) {
	  checkTimeVariable = true;
	  setTimeout(() => { checkTimeVariable = false; }, 10);
	  endGame(Team.SPECTATORS);
	  room.stopGame();
	  goldenGoal = false;
	  }
	}
}
  
function endGame(winner) { // handles the end of a game : no stopGame function inside
    players.length >= 2 * maxTeamSize - 1 ? activateChooseMode() : null;
    const scores = room.getScores();
    game.scores = scores;
    Rposs = Rposs / (Rposs + Bposs);
    Bposs = 1 - Rposs;
    lastWinner = winner;
    endGameVariable = true;
    if (winner == Team.RED) {
        streak++;
        room.sendAnnouncement("🔴 O RED VENCEU " + scores.red + "-" + scores.blue + ", Vitórias Consecutivas : " + streak + " 🏆", null, Cor.Vermelho, Negrito);
    } else if (winner == Team.BLUE) {
        streak = 1;
        room.sendAnnouncement("🔵 O BLUE VENCEU " + scores.blue + "-" + scores.red + ", Vitórias Consecutivas : " + streak + " 🏆", null, Cor.Azul, Negrito);
    }
    room.sendAnnouncement("POSSE DE BOLA: 🔴 " + (Rposs * 100).toPrecision(3).toString() + "% : " + (Bposs * 100).toPrecision(3).toString() + "% 🔵", null, Cor.Azulclaro, "bold");
    scores.red == 0 ? (scores.blue == 0 ?
            room.sendAnnouncement(" EMPATE!!! " + GKList[0].name + " E " + GKList[1].name + " SÃO OS MELHORES GKs DA SALA !!! ", null, 0xFFFF00, Negrito) :
            room.sendAnnouncement(GKList[1].name + " UMA VERDADEIRO ET NO GOL!! PASSA NADA!!! ", null, 0xFFFF00, Negrito)) : scores.blue == 0 ?
        room.sendAnnouncement(GKList[0].name + " UM VERDADEIRO GK !!! ", null, 0xFFFF00, Negrito ) : null
		RecSistem.sendDiscordWebhook(scores);
		room.sendAnnouncement("Gravação enviada ao discord. ID: " + `${getDate()}`+`${cod}${cod1}${cod2}${cod3}${cod4}`, null, 0xFFFF00, Negrito);
		updateStats();
}

  
  function quickRestart() {
	  room.stopGame();
	  setTimeout(() => { room.startGame(); }, 2000);
  }
  
  function resumeGame() {
	  setTimeout(() => { room.startGame(); }, 2000);
	  setTimeout(() => { room.pauseGame(false); }, 1000);
  }
  
  function activateChooseMode() { // Modo escolhas ativado
	  inChooseMode = true;
	  slowMode = 2;
  }
  
  function deactivateChooseMode() { // Modo escolhas desativado
	  inChooseMode = false;
	  clearTimeout(timeOutCap);
	  if (slowMode != 0) {
	  slowMode = 0;
	  }
	  redCaptainChoice = "";
	  blueCaptainChoice = "";
  }
  
  function loadMap(map, scoreLim, timeLim) { // customização de mapas
	  if (map != '') {
	  room.setCustomStadium(map);
	  } else {
	  console.log("error cargando mapa")
	  room.setDefaultStadium("Classic");
	  }
	  room.setScoreLimit(scoreLim);
	  room.setTimeLimit(timeLim);
  }
  
	  /* PLAYER FUNCTIONS */
  
  function updateTeams() { // update the players' list and all the teams' list
	  players = room.getPlayerList().filter((player) => player.id != 0 && !getAFK(player));
	  teamR = players.filter(p => p.team === Team.RED);
	  teamB = players.filter(p => p.team === Team.BLUE);
	  teamS = players.filter(p => p.team === Team.SPECTATORS);
  }
  
  function handleInactivity() { // handles inactivity : players will be kicked after afkLimit
    if (countAFK && (teamR.length + teamB.length) > 1) {
        for (var i = 0; i < teamR.length; i++) {
            setActivity(teamR[i], getActivity(teamR[i]) + 1);
        }
        for (var i = 0; i < teamB.length; i++) {
            setActivity(teamB[i], getActivity(teamB[i]) + 1);
        }
    }
    for (var i = 0; i < extendedP.length; i++) {
        if (extendedP[i][eP.ACT] == 60 * (2 / 3 * afkLimit)) {
			room.sendAnnouncement("@" + room.getPlayer(extendedP[i][eP.ID]).name + ", mova-se em " + Math.floor(afkLimit / 3) + " segundos, para não ser kickado!", extendedP[i][eP.ID], Cor.laranjaescuro, Negrito);

        }
        if (extendedP[i][eP.ACT] >= 60 * afkLimit) {
            extendedP[i][eP.ACT] = 0;
            if (room.getScores().time <= afkLimit - 0.5) {
                setTimeout(() => { !inChooseMode ? quickRestart() : room.stopGame(); }, 10);
            }
            room.kickPlayer(extendedP[i][eP.ID], "AFK", false);
        }
    }
}
  
  function getAuth(player) {
	  return extendedP.filter((a) => a[0] == player.id) != null ? extendedP.filter((a) => a[0] == player.id)[0][eP.AUTH] : null;
  }
  
  function getAFK(player) {
	  return extendedP.filter((a) => a[0] == player.id) != null ? extendedP.filter((a) => a[0] == player.id)[0][eP.AFK] : null;
  }
  
  function setAFK(player, value) {
	  extendedP.filter((a) => a[0] == player.id).forEach((player) => player[eP.AFK] = value);
  }
  
  function getActivity(player) {
	  return extendedP.filter((a) => a[0] == player.id) != null ? extendedP.filter((a) => a[0] == player.id)[0][eP.ACT] : null;
  }
  
  function setActivity(player, value) {
	  extendedP.filter((a) => a[0] == player.id).forEach((player) => player[eP.ACT] = value);
  }
  
  function getGK(player) {
	  return extendedP.filter((a) => a[0] == player.id) != null ? extendedP.filter((a) => a[0] == player.id)[0][eP.GK] : null;
  }
  
  function setGK(player, value) {
	  extendedP.filter((a) => a[0] == player.id).forEach((player) => player[eP.GK] = value);
  }
  
  function getMute(name) {
	for (let i = 0; i < playermutados.length; i++) {
		if (playermutados[i] === name) {
		  return true;
		}
	  }
	  return false;
  }
  
  function setMute(player, value) {
	  extendedP.filter((a) => a[0] == player.id).forEach((player) => player[eP.MUTE] = value);
  }
  function updateRoleOnPlayerIn() { // Se a lista de specs for = 0, inicia o jogo.

	  updateTeams()
	  if (inChooseMode) {
	  if (players.length == 6) {
	  loadMap(Mapa, scoreMapa, tempoMapa);
	  }
	  try{getSpecList(teamR.length <= teamB.length ? teamR[0] : teamB[0]);}
	  catch{}
	  }
	  try{balanceTeams();}
	  catch{}
  }


  function updateRoleOnPlayerOut() { // Detectar ragequit e atualizar times.
	  updateTeams();
	  if (room.getScores() != null) {
	  var scores = room.getScores();
	  if (players.length >= 2 * maxTeamSize && scores.time >= (5 / 6) * game.scores.timeLimit && teamR.length != teamB.length) {
	  if (teamR.length < teamB.length) {
	  if (scores.blue - scores.red == 2) {
	  endGame(Team.BLUE);
	  room.sendAnnouncement("Ragequit, jogo finalizado", Cor.Vermelho);
	  setTimeout(() => { room.stopGame(); }, 100);
	  return;
	  }
	  }
	  else {
	  if (scores.red - scores.blue == 2) {
	  endGame(Team.RED);
	  room.sendAnnouncement("Ragequit, jogo finalizado", Cor.Vermelho);
	  setTimeout(() => { room.stopGame(); }, 100);
	  return;
	  }
	  }
	  }
	  }
	  if (inChooseMode) {
	  if (players.length < 6) {
	  loadMap(Mapa, scoreMapa, tempoMapa);
	  }
	  if (teamR.length == 0 || teamB.length == 0) {
	  teamR.length == 0 ? room.setPlayerTeam(teamS[0].id, Team.RED) : room.setPlayerTeam(teamS[0].id, Team.BLUE);
	  return;
	  }
	  if (Math.abs(teamR.length - teamB.length) == teamS.length) {
	  room.sendAnnouncement("Nenhum player restou, completando equipes e iniciando ...", Cor.Verde);
	  deactivateChooseMode();
	  resumeGame();
	  var b = teamS.length;
	  if (teamR.length > teamB.length) {
	  for (var i = 0; i < b; i++) {
	  try{setTimeout(() => { room.setPlayerTeam(teamS[0].id, Team.BLUE); }, 5 * i);}
	  catch{}
	  }
	  }
	  else {
	  for (var i = 0; i < b; i++) {
	  try{setTimeout(() => { room.setPlayerTeam(teamS[0].id, Team.RED); }, 5 * i);}
	  catch{}
	  }
	  }
	  return;
	  }
	  if (streak == 0 && room.getScores() == null) {
	  if (Math.abs(teamR.length - teamB.length) == 2) { // se alguém saiu de um time tem 2 jogadores a mais que o outro.
	  room.sendAnnouncement(" Equilibrando equipes... ", Cor.Verde);
	  teamR.length > teamB.length ? room.setPlayerTeam(teamR[teamR.length - 1].id, Team.SPECTATORS) : room.setPlayerTeam(teamB[teamB.length - 1].id, Team.SPECTATORS); }
	  }
	  if (teamR.length == teamB.length && teamS.length < 2) {
	  deactivateChooseMode();
	  resumeGame();
	  return;
	  }
	  try{capLeft ? choosePlayer() : getSpecList(teamR.length <= teamB.length ? teamR[0] : teamB[0]);}
	  catch{}
	  }
	  balanceTeams();
  }
function balanceTeams() { // Função que balançea os times, corrigi times que estão com player a menos.
	 if (!inChooseMode) {
    if (players.length == 1 && teamR.length == 0) { // 1 player
        quickRestart();
        loadMap(MapaTreino, scoreMapaTreino, tempoMapaTreino);
        room.setPlayerTeam(players[0].id, Team.RED);
    }

    else if (Math.abs(teamR.length - teamB.length) == teamS.length && teamS.length > 0) { 
        // spec players supply required players
        const n = Math.abs(teamR.length - teamB.length);

        // SE ESTIVER VIRANDO 1x1 (2 jogadores totais), REINICIA E MUDA MAPA
        if (players.length === 2 && (teamR.length + teamB.length === 1)) {
            quickRestart();
            loadMap(Mapa, scoreMapa, tempoMapa);
        }

        // mover SPEC para completar time
        if (teamR.length > teamB.length) {
            for (var i = 0; i < n; i++) {
                room.setPlayerTeam(teamS[i].id, Team.BLUE);
            }
        }
        else {
            for (var i = 0; i < n; i++) {
                room.setPlayerTeam(teamS[i].id, Team.RED);
            }
        }
		}

		  else if (Math.abs(teamR.length - teamB.length) > teamS.length) { //no sufficient players
			  const n = Math.abs(teamR.length - teamB.length);
			  if (players.length == 1) {
				  quickRestart();
				  loadMap(MapaTreino, scoreMapaTreino, tempoMapaTreino);
				  room.setPlayerTeam(players[0].id, Team.RED);
				  return;
			  }
			  else if (players.length == 6) {
				  quickRestart();
				  
			  }
			  if (players.length == maxTeamSize * 2 - 1) {
				  allReds = [];
				  allBlues = [];
			  }
			  if (teamR.length > teamB.length) {
				  for (var i = 0; i < n; i++) {
					  room.setPlayerTeam(teamR[teamR.length - 1 - i].id, Team.SPECTATORS);
				  }
			  }
			  else {
				  for (var i = 0; i < n; i++) {
					  room.setPlayerTeam(teamB[teamB.length - 1 - i].id, Team.SPECTATORS);
				  }
			  }
		  }
		  else if (Math.abs(teamR.length - teamB.length) < teamS.length && teamR.length != teamB.length) { //choose mode
			  room.pauseGame(true)
			  activateChooseMode();
			  choosePlayer();
		  }
		  else if (teamS.length >= 2 && teamR.length == teamB.length && teamR.length < maxTeamSize) { //2 in red 2 in blue and 2 or more spec
			  if (teamR.length == 2) {
				  quickRestart();
				  if (!teamS.length == 2){
					  
				  }
			  }
			  topBtn();
		  }
	  }
  }
  


  function alterar_cor(player, message){
	if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L1.includes(player.name) === true) {
	if(cL1.length == 1 && message.length <= 11){ 
	cL1.splice(cL1.indexOf(message)) + cL1.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL1)}}

	if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L2.includes(player.name) === true) {
	if(cL2.length == 1 && message.length <= 11){ 
	cL2.splice(cL2.indexOf(message)) + cL2.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL2)}}
	
	if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L3.includes(player.name) === true) {
	if(cL3.length == 1 && message.length <= 11){ 
	cL3.splice(cL3.indexOf(message)) + cL3.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL3)}}
	
	if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L4.includes(player.name) === true) {
	if(cL4.length == 1 && message.length <= 11){ 
	cL4.splice(cL4.indexOf(message)) + cL4.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL4)}}
	
	if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L5.includes(player.name) === true) {
	if(cL5.length == 1 && message.length <= 11){ 
	cL5.splice(cL5.indexOf(message)) + cL5.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL5)}}

	if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L6.includes(player.name) === true) {
		if(cL6.length == 1 && message.length <= 11){ 
		cL6.splice(cL6.indexOf(message)) + cL6.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL6)}}

		if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L7.includes(player.name) === true) {
			if(cL7.length == 1 && message.length <= 11){ 
			cL7.splice(cL7.indexOf(message)) + cL7.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL7)}}

			if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L8.includes(player.name) === true) {
				if(cL8.length == 1 && message.length <= 11){ 
				cL8.splice(cL8.indexOf(message)) + cL8.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL8)}}

				if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L10.includes(player.name) === true) {
					if(cL10.length == 1 && message.length <= 11){ 
					cL10.splice(cL10.indexOf(message)) + cL10.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL10)}}

					if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L11.includes(player.name) === true) {
						if(cL11.length == 1 && message.length <= 11){ 
						cL11.splice(cL11.indexOf(message)) + cL11.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL11)}}

						if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L12.includes(player.name) === true) {
							if(cL12.length == 1 && message.length <= 11){ 
							cL12.splice(cL12.indexOf(message)) + cL12.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL12)}}

							if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L13.includes(player.name) === true) {
								if(cL13.length == 1 && message.length <= 11){ 
								cL13.splice(cL13.indexOf(message)) + cL13.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL13)}}

								if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L14.includes(player.name) === true) {
									if(cL14.length == 1 && message.length <= 11){ 
									cL14.splice(cL14.indexOf(message)) + cL14.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL14)}}

									if (message.substr(0, 5) == "!cor " && verificados.includes(player.name) != false && L15.includes(player.name) === true) {
										if(cL15.length == 1 && message.length <= 11){ 
										cL15.splice(cL15.indexOf(message)) + cL15.push('0x'+ message.substr(5)) + room.sendAnnouncement(`${cor_definida}` + message.substr(5), player.id, cL15)}}
	
								}

	

function alterar_fonte(player, message){
	if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L1.includes(player.name) === true) { 
	if(fL1.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){
	fL1.splice(fL1.indexOf(message)) + fL1.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
	else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}
	
	if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L2.includes(player.name) === true) { 
	if(fL2.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
	fL2.splice(fL2.indexOf(message)) + fL2.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
	else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}
	
	if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L3.includes(player.name) === true) { 
	if(fL3.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
	fL3.splice(fL3.indexOf(message)) + fL3.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
	else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}
	
	if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L4.includes(player.name) === true) { 
	if(fL4.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
	fL4.splice(fL4.indexOf(message)) + fL4.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
	else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}
	
	if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L5.includes(player.name) === true) { 
	if(fL5.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
	fL5.splice(fL5.indexOf(message)) + fL5.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
	else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

	if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L6.includes(player.name) === true) { 
		if(fL6.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
		fL6.splice(fL6.indexOf(message)) + fL6.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
		else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

		if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L7.includes(player.name) === true) { 
			if(fL7.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
			fL7.splice(fL7.indexOf(message)) + fL7.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
			else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

			if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L8.includes(player.name) === true) { 
				if(fL8.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
				fL8.splice(fL8.indexOf(message)) + fL8.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
				else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

				if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L10.includes(player.name) === true) { 
					if(fL10.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
					fL10.splice(fL10.indexOf(message)) + fL10.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
					else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

					if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L11.includes(player.name) === true) { 
						if(fL11.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
						fL11.splice(fL11.indexOf(message)) + fL11.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
						else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

						if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L12.includes(player.name) === true) { 
							if(fL12.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
							fL12.splice(fL12.indexOf(message)) + fL12.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
							else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

							if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L13.includes(player.name) === true) { 
								if(fL13.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
								fL13.splice(fL13.indexOf(message)) + fL13.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
								else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

								if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L14.includes(player.name) === true) { 
									if(fL14.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
									fL14.splice(fL14.indexOf(message)) + fL14.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
									else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}

									if (message.substr(0, 7) == "!fonte " && verificados.includes(player.name) != false && L15.includes(player.name) === true) { 
										if(fL15.length == 1 && message.substr(7) === fontsdisp[0] || message.substr(7) === fontsdisp[1] || message.substr(7) === fontsdisp[2] || message.substr(7) === fontsdisp[3] || message.substr(7) === fontsdisp[4]){ 
										fL15.splice(fL15.indexOf(message)) + fL15.push(message.substr(7)) + room.sendAnnouncement(`${fonte_definida}` + message.substr(7), player.id)}
										else { room.sendAnnouncement(`${erroapi} ${fontsdisp}`, player.id) }}
}

  
function choosePlayer() {
    clearTimeout(timeOutCap);

    let captain = null;

    if (teamR.length !== 0 && (teamR.length <= teamB.length || teamB.length === 0)) {
        captain = teamR[0];
    } 
    else if (teamB.length !== 0 && teamB.length < teamR.length) {
        captain = teamB[0];
    }

    if (!captain) return;

    // Capitão chamado (amarelo)
    room.sendAnnouncement(
        "『🏟️』O capitão está escolhendo um jogador.",
        captain.id,
        Cor.laranjaescuro,
        "bold"
    );

    // Instruções (ciano)
    room.sendAnnouncement(
        "『⚽』Escolha um número disponível ou utilize: random / bottom / top.",
        captain.id,
        Cor.laranjaescuro,
        "bold"
    );

    // Aviso da metade do tempo (laranja)
    timeOutCap = setTimeout(function (player) {
        room.sendAnnouncement(
            "『⏱️』Atenção " + player.name + ", restam " + parseInt(chooseTime / 2) + " segundos!",
            player.id,
            Cor.Vermelho,
            "bold"
        );
    }, chooseTime * 500, captain);

    // Kick se não escolher no tempo limite (vermelho)
    timeOutCap = setTimeout(function (player) {
        room.kickPlayer(
            player.id,
            "🔴 Não escolheu a tempo — ficou parado na quadra (AFK)."
        );
    }, chooseTime * 1000, captain);

    // Atualiza lista de specs (verde)
    if (teamR.length !== 0 && teamB.length !== 0) {
        getSpecList(
            teamR.length <= teamB.length ? teamR[0] : teamB[0]
        );
    }
}


  function getSpecList(player) {
	try{
    var cstm = "『👥』Jogadores:";
    for (var i = 0; i < teamS.length; i++) {
        if (140 - cstm.length < (teamS[i].name + "[" + (i + 1) + "], ").length) {
            room.sendAnnouncement(cstm, player.id);
            cstm = "... ";
        }
        cstm += teamS[i].name + "[" + (i + 1) + "], ";
    }
    cstm = cstm.substring(0, cstm.length - 2);
    cstm += ".";
    room.sendAnnouncement(cstm, player.id);}
	catch{return;}
}


function getLastTouchOfTheBall() {
	const ballPosition = room.getBallPosition();
	updateTeams();
	for (var i = 0; i < players.length; i++) {
	if (players[i].position != null) {
	var distanceToBall = pointDistance(players[i].position, ballPosition);
	if (distanceToBall < triggerDistance) {
	!activePlay ? activePlay = true : null;
	if (lastTeamTouched == players[i].team && lastPlayersTouched[0] != null && lastPlayersTouched[0].id != players[i].id) {
	lastPlayersTouched[1] = lastPlayersTouched[0];
	lastPlayersTouched[0] = players[i];
	}
	lastTeamTouched = players[i].team;
	}
	}
	}
	}
	
	function getStats() { // gives possession, ball speed and GK of each team
	if (activePlay) {
	updateTeams();
	lastTeamTouched == Team.RED ? Rposs++ : Bposs++;
	var ballPosition = room.getBallPosition();
	point[1] = point[0];
	point[0] = ballPosition;
	ballSpeed = (pointDistance(point[0], point[1]) * 60 * 60 * 60)/16000;
	var k = [-1, Infinity];
	for (var i = 0; i < teamR.length; i++) {
	if (teamR[i].position.x < k[1]) {
	k[0] = teamR[i];
	k[1] = teamR[i].position.x;
	}
	}
	k[0] != -1 ? setGK(k[0], getGK(k[0]) + 1) : null;
	k = [-1, -Infinity];
	for (var i = 0; i < teamB.length; i++) {
	if (teamB[i].position.x > k[1]) {
	k[0] = teamB[i];
	k[1] = teamB[i].position.x;
	}
	}
	k[0] != -1 ? setGK(k[0], getGK(k[0]) + 1) : null;
	findGK();
	}
	}
	
	function updateStats() {
		playersstats = JSON.parse(localStorage.getItem("playersData" + sala)) || {}
		if (players.length >= 2 * maxTeamSize && (game.scores.time >= (5 / 6) * game.scores.timeLimit || game.scores.red == game.scores.scoreLimit || game.scores.blue == game.scores.scoreLimit) && allReds.length >= maxTeamSize && allBlues.length >= maxTeamSize) {
			var stats;
			if (streak > streaktop[0]) {
				streaktop = []
	
				for (var i = 0; i < teamR.length; i++) {
					streaktop.push(teamR[i].name)
				}
				streaktop.unshift(streak)
				localStorage.setItem("streaktop" + sala, JSON.stringify(streaktop));
			}
			for (var i = 0; i < allReds.length; i++) {
				playersstats[allReds[i]['name']] ? stats = playersstats[allReds[i]['name']] : stats = [0, 0, 0, 0, "0.00", 0, 0, 0, 0, "0.00", "player", allReds[i].name];
				stats[Ss.GA]++;
				lastWinner == Team.RED ? stats[Ss.WI]++ : lastWinner == Team.BLUE ? stats[Ss.LS]++ : stats[Ss.DR]++;
				stats[Ss.WR] = (100 * stats[Ss.WI] / stats[Ss.GA]).toPrecision(3);
				playersstats[allReds[i]['name']] = stats;
				localStorage.setItem("playersData" + sala, JSON.stringify(playersstats));
				addAstros(allReds[i], 20); // Aumentado para 20
			}
			for (var i = 0; i < allBlues.length; i++) {
				playersstats[allBlues[i]['name']] ? stats = playersstats[allBlues[i]['name']] : stats = [0, 0, 0, 0, "0.00", 0, 0, 0, 0, "0.00", "player", allBlues[i].name];
				stats[Ss.GA]++;
				lastWinner == Team.BLUE ? stats[Ss.WI]++ : lastWinner == Team.RED ? stats[Ss.LS]++ : stats[Ss.DR]++;
				stats[Ss.WR] = (100 * stats[Ss.WI] / stats[Ss.GA]).toPrecision(3);
				playersstats[allBlues[i]['name']] = stats;
				localStorage.setItem("playersData" + sala, JSON.stringify(playersstats));
				addAstros(allBlues[i], 20); // Aumentado para 20
			}
			for (var i = 0; i < game.goals.length; i++) {
				if (game.goals[i].striker != null) {
					if ((allBlues.concat(allReds)).findIndex((player) => player.id == game.goals[i].striker.id) != -1) {
						stats = playersstats[game.goals[i].striker['name']];
						stats[Ss.GL]++;
						playersstats[game.goals[i].striker['name']] = stats;
						localStorage.setItem("playersData" + sala, JSON.stringify(playersstats));
						addAstros(game.goals[i].striker, 50); // Aumentado para 50
					}
				}
				if (game.goals[i].assist != null) {
					if ((allBlues.concat(allReds)).findIndex((player) => player.name == game.goals[i].assist.name) != -1) {
						stats = playersstats[game.goals[i].assist['name']];
						stats[Ss.AS]++;
						playersstats[game.goals[i].assist['name']] = stats;
						localStorage.setItem("playersData" + sala, JSON.stringify(playersstats));
						addAstros(game.goals[i].assist, 20); // Aumentado para 20
					}
				}
			}
			if (allReds.findIndex((player) => player.id == GKList[0].id) != -1) {
				stats = playersstats[GKList[0]['name']];
				stats[Ss.GK]++;
				game.scores.blue == 0 ? stats[Ss.CS]++ : null;
				stats[Ss.CP] = (100 * stats[Ss.CS] / stats[Ss.GK]).toPrecision(3);
				playersstats[GKList[0]['name']] = stats;
				localStorage.setItem("playersData" + sala, JSON.stringify(playersstats));
				addAstros(GKList[0], 50); // Aumentado para 50
			}
			if (allBlues.findIndex((player) => player.id == GKList[1].id) != -1) {
				stats = playersstats[GKList[1]['name']];
				stats[Ss.GK]++;
				game.scores.red == 0 ? stats[Ss.CS]++ : null;
				stats[Ss.CP] = (100 * stats[Ss.CS] / stats[Ss.GK]).toPrecision(3);
				playersstats[GKList[1]['name']] = stats;
				localStorage.setItem("playersData" + sala, JSON.stringify(playersstats));
				addAstros(GKList[1], 50); // Aumentado para 50
			}
		}
	}
	
	
	function findGK() {
	var tab = [[-1,""], [-1,""]];
	for (var i = 0; i < extendedP.length ; i++) {
	if (room.getPlayer(extendedP[i][eP.ID]) != null && room.getPlayer(extendedP[i][eP.ID]).team == Team.RED) {
	if (tab[0][0] < extendedP[i][eP.GK]) {
	tab[0][0] = extendedP[i][eP.GK];
	tab[0][1] = room.getPlayer(extendedP[i][eP.ID]);
	}
	}
	else if (room.getPlayer(extendedP[i][eP.ID]) != null && room.getPlayer(extendedP[i][eP.ID]).team == Team.BLUE) {
	if (tab[1][0] < extendedP[i][eP.GK]) {
	tab[1][0] = extendedP[i][eP.GK];
	tab[1][1] = room.getPlayer(extendedP[i][eP.ID]);
	}
	}
	}
	GKList = [tab[0][1], tab[1][1]];
	}

function isBlacklisted(player){
    return blacklist.filter(b => b.ipv4 == player.ipv4 || b.Auth == player.auth || b.Conn == player.conn).length > 0;
}

  function getDatehoras(){
	let data = new Date(),
	dia=data.getDate().toString().padStart(2, '0'),
	mes=(data.getMonth()+1).toString().padStart(2, '0'),
	horas=data.getHours().toString().padStart(2, '0'),
	minutos=data.getMinutes().toString().padStart(2, '0');
	return `${horas}:${minutos}`;
}

function getDateInfo(){
	let data = new Date(),
	dia=data.getDate().toString().padStart(2, '0'),
	mes=(data.getMonth()+1).toString().padStart(2, '0'),
	ano=data.getFullYear(),
	horas=data.getHours().toString().padStart(2, '0'),
	minutos=data.getMinutes().toString().padStart(2, '0');
	segundos=data.getSeconds().toString().padStart(2, '0');
	return `${dia} do ${mes} de ${ano}, ás ${horas}:${minutos}:${segundos}`;
}

function dataehora(){
	let data = new Date(),
	dia=data.getDate().toString().padStart(2, '0'),
	mes=(data.getMonth()+1).toString().padStart(2, '0'),
	ano=data.getFullYear(),
	horas=data.getHours().toString().padStart(2, '0'),
	minutos=data.getMinutes().toString().padStart(2, '0');
	segundos=data.getSeconds().toString().padStart(2, '0');
	return `${dia}/${mes} de ${ano}, ás ${horas}:${minutos} e ${segundos} segundos`;
}


function multiplas_abas(player){
conns.push([player.id,player.name,player.auth,player.conn])
playerConn[player.id] = player.conn; 
if (room.getPlayerList().filter((p) => playerConn[p.id] == player.conn).length > 1) 
room.kickPlayer(room.getPlayerList().filter((p) => playerConn[p.id] == player.conn)[1].id, "Você já está nessa sala em outra aba, feche a outra aba.", false)
}

function playerChat(player, message) {
	var playerTargetIndex = players.findIndex(
		(p) => p.name.replaceAll(' ', '_') == msgArray[0].substring(2)
	);
	if (playerTargetIndex == -1) {
		room.sendAnnouncement(
			"Player inválido, verifique se o nome digitado está correto.",
			player.id,
			Cor.Vermelho,
			'bold',
		);
		return false;
	}
	var playerTarget = players[playerTargetIndex];
	if (player.id == playerTarget.id) {
		room.sendAnnouncement(
			"Você não pode enviar um PV para si mesmo!",
			player.id,
			Cor.Vermelho,
			'bold',
			null
		);
		return false;
	}
	var messageFrom = `[Privado com ${playerTarget.name}] ${player.name}: ${msgArray.slice(1).join(' ')}`

	var messageTo = `[Privado com ${player.name}] ${player.name}: ${msgArray.slice(1).join(' ')}`

	room.sendAnnouncement(
		messageFrom,
		player.id,
		Cor.Azulclaro,
		Normal,
		1
	);
	room.sendAnnouncement(
		messageTo,
		playerTarget.id,
		Cor.Azulclaro,
		Normal,
		1
	);
}

room.onGameTick = function (player) {
    checkTime()
    getLastTouchOfTheBall()
    getStats()
    handleInactivity()
	updateTeams()
	lastScores = room.getScores()
}

