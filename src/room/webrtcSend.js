/**
 * O Haxball já engole o "Sending failed", mas o canal segue "open".
 * O host continua mandando o frame para um peer morto e a sala inteira espera.
 * Fechar o canal dispara o onclose da lib e tira só esse jogador.
 */

function isSendFailure(err) {
  return err?.name === "OperationError" && /Sending failed/i.test(String(err?.message || err));
}

function guardDataChannelSend(RTCDataChannel, { log = console.warn } = {}) {
  const proto = RTCDataChannel?.prototype;
  if (!proto || typeof proto.send !== "function" || proto.__haxSendGuard) return false;
  const send = proto.send;
  proto.send = function guardedSend(data) {
    try {
      return send.call(this, data);
    } catch (err) {
      if (!isSendFailure(err)) throw err;
      log(`[webrtc] envio falhou, canal fechado: ${err.message || err}`);
      try {
        this.close();
      } catch {
        /* canal já morto */
      }
    }
  };
  proto.__haxSendGuard = true;
  return true;
}

function installWebRtcSendGuard(log) {
  try {
    const { RTCDataChannel } = require("@webrtc-node/webrtc");
    return guardDataChannelSend(RTCDataChannel, { log });
  } catch (err) {
    if (typeof log === "function") log(`[webrtc] guarda de envio indisponível: ${err.message || err}`);
    return false;
  }
}

module.exports = {
  isSendFailure,
  guardDataChannelSend,
  installWebRtcSendGuard,
};
