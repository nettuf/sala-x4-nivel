require("dotenv").config();

const config = require("./config");
const { startTokenServer } = require("./server/tokenServer");
const { createRoom } = require("./room/createRoom");
const { installWebRtcSendGuard } = require("./room/webrtcSend");

// Um erro solto (Supabase/Discord fora do ar) não pode reiniciar a sala no meio da partida.
process.on("unhandledRejection", (reason) => {
  console.error("[sala-x4-nivel] unhandledRejection:", reason?.message || reason);
});

process.on("uncaughtException", (err) => {
  console.error("[sala-x4-nivel] uncaughtException:", err?.stack || err);
});

async function main() {
  installWebRtcSendGuard();
  startTokenServer();

  if (!config.readToken()) {
    console.warn("[sala-x4-nivel] sem token — API /token no ar. Envie o token para subir a sala (reinicie após POST).");
    return;
  }

  const HaxballJSImport = require("haxball.js");
  const HaxballJS = HaxballJSImport.default || HaxballJSImport;

  try {
    const HBInit = await HaxballJS();
    createRoom(HBInit);
    console.log("[sala-x4-nivel] room host iniciado:", config.roomName);
  } catch (err) {
    console.error("[sala-x4-nivel] falha ao abrir sala (token API segue ativa):", err.message || err);
  }
}

main().catch((err) => {
  console.error("[sala-x4-nivel] fatal:", err);
  process.exit(1);
});
