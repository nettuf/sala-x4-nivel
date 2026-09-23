const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { guardDataChannelSend, isSendFailure } = require("../src/room/webrtcSend");

describe("envio WebRTC", () => {
  it("reconhece Sending failed", () => {
    const err = new DOMException("Sending failed, errno=32", "OperationError");
    assert.equal(isSendFailure(err), true);
    assert.equal(isSendFailure(new Error("outra coisa")), false);
  });

  it("fecha só o canal cujo envio nativo falhou", () => {
    class Channel {
      constructor() {
        this.closed = false;
      }
      send() {
        throw new DOMException("Sending failed, errno=2", "OperationError");
      }
      close() {
        this.closed = true;
      }
    }
    const notes = [];
    assert.equal(guardDataChannelSend(Channel, { log: (line) => notes.push(line) }), true);
    const dead = new Channel();
    dead.send(new Uint8Array([1]));
    assert.equal(dead.closed, true);
    assert.equal(notes.length, 1);
    assert.match(notes[0], /canal fechado/);
  });

  it("deixa passar envio normal e outro erro", () => {
    class Channel {
      constructor() {
        this.payload = null;
        this.closed = false;
      }
      send(data) {
        if (data === "boom") throw new Error("buffer");
        this.payload = data;
      }
      close() {
        this.closed = true;
      }
    }
    guardDataChannelSend(Channel, { log() {} });
    const live = new Channel();
    live.send("ok");
    assert.equal(live.payload, "ok");
    assert.equal(live.closed, false);
    assert.throws(() => live.send("boom"), /buffer/);
    assert.equal(live.closed, false);
  });
});
