/**
 * WebSocket server for the NFC bridge.
 * Exposes tag events and operations to the dashboard over ws://localhost:7891
 */
import { WebSocketServer } from "ws";
import { encodeNDEF } from "./ndef.js";

const HEARTBEAT_INTERVAL = 5000;

export class BridgeServer {
  constructor(reader, options = {}) {
    this.reader = reader;
    this.port = options.port || 7891;
    this.wss = null;
    this.clients = new Set();
    this.history = [];
    this._heartbeatTimer = null;
  }

  start() {
    this.wss = new WebSocketServer({
      port: this.port,
      perMessageDeflate: false,
    });

    this.wss.on("connection", (ws, req) => {
      this.clients.add(ws);
      this._log(`Client connected from ${req.socket.remoteAddress}`);

      // Send current state on connect
      this._send(ws, "bridge:status", {
        version: "1.0.0",
        reader: this.reader.isReaderConnected
          ? { connected: true, name: this._readerName }
          : { connected: false },
        tag: this._lastTag || null,
      });

      ws.on("message", (data) => this._handleMessage(ws, data));

      ws.on("close", () => {
        this.clients.delete(ws);
        this._log("Client disconnected");
      });

      ws.on("error", (err) => {
        this._log(`WebSocket error: ${err.message}`);
        this.clients.delete(ws);
      });
    });

    // Forward reader events to all clients
    this._setupReaderEvents();
    this._startHeartbeat();

    this._log(`Bridge server listening on ws://localhost:${this.port}`);
  }

  _setupReaderEvents() {
    this.reader.on("reader:connect", (info) => {
      this._readerName = info.name;
      this._broadcast("reader:connect", info);
      this._log(`Reader connected: ${info.name}`);
    });

    this.reader.on("reader:disconnect", () => {
      this._readerName = null;
      this._lastTag = null;
      this._broadcast("reader:disconnect", {});
      this._log("Reader disconnected");
    });

    this.reader.on("tag:connect", (tag) => {
      this._lastTag = tag;
      this._broadcast("tag:connect", tag);
      this._addHistory({ action: "detect", tag });
      this._log(`Tag detected: ${tag.uid} (${tag.type})`);
    });

    this.reader.on("tag:disconnect", (info) => {
      this._lastTag = null;
      this._broadcast("tag:disconnect", info);
      this._log(`Tag removed: ${info.uid}`);
    });

    this.reader.on("error", (err) => {
      this._broadcast("error", err);
      this._log(`Error [${err.source}]: ${err.message}`);
    });
  }

  async _handleMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      this._send(ws, "error", { message: "Invalid JSON" });
      return;
    }

    const { id, action, payload } = msg;

    try {
      switch (action) {
        case "read": {
          const tag = await this.reader.readTag();
          this._lastTag = tag;
          this._addHistory({ action: "read", tag });
          this._send(ws, "read:result", { id, tag });
          break;
        }

        case "write": {
          const records = payload?.records;
          if (!records || !Array.isArray(records)) {
            this._send(ws, "error", { id, message: "Missing records array" });
            return;
          }
          const ndefBytes = encodeNDEF(records);
          const result = await this.reader.writeTag(ndefBytes);

          // Re-read to get updated tag info
          const updatedTag = await this.reader.readTag();
          this._lastTag = updatedTag;
          this._addHistory({ action: "write", tag: updatedTag, records });
          this._send(ws, "write:result", { id, ...result, tag: updatedTag });
          this._broadcast("tag:updated", updatedTag, ws);
          break;
        }

        case "erase": {
          const result = await this.reader.eraseTag();
          const updatedTag = await this.reader.readTag();
          this._lastTag = updatedTag;
          this._addHistory({ action: "erase", tag: updatedTag });
          this._send(ws, "erase:result", { id, ...result, tag: updatedTag });
          this._broadcast("tag:updated", updatedTag, ws);
          break;
        }

        case "lock": {
          const result = await this.reader.lockTag();
          const updatedTag = await this.reader.readTag();
          this._lastTag = updatedTag;
          this._addHistory({ action: "lock", tag: updatedTag });
          this._send(ws, "lock:result", { id, ...result, tag: updatedTag });
          this._broadcast("tag:updated", updatedTag, ws);
          break;
        }

        case "history": {
          this._send(ws, "history:result", { id, history: this.history });
          break;
        }

        case "ping": {
          this._send(ws, "pong", { id, timestamp: Date.now() });
          break;
        }

        default:
          this._send(ws, "error", { id, message: `Unknown action: ${action}` });
      }
    } catch (err) {
      this._send(ws, "error", { id, message: err.message });
      this._log(`Operation failed [${action}]: ${err.message}`);
    }
  }

  _send(ws, event, data) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ event, ...data, timestamp: Date.now() }));
    }
  }

  _broadcast(event, data, exclude = null) {
    const msg = JSON.stringify({ event, ...data, timestamp: Date.now() });
    for (const client of this.clients) {
      if (client !== exclude && client.readyState === client.OPEN) {
        client.send(msg);
      }
    }
  }

  _addHistory(entry) {
    this.history.unshift({
      id: this.history.length + 1,
      uid: entry.tag?.uid,
      action: entry.action,
      tag_type: entry.tag?.type,
      records: entry.records || entry.tag?.records || [],
      created_at: new Date().toISOString(),
      label: null,
    });
    // Keep last 100 entries
    if (this.history.length > 100) this.history.pop();
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      this._broadcast("heartbeat", {
        reader: this.reader.isReaderConnected,
        tag: this.reader.isTagPresent,
        clients: this.clients.size,
      });
    }, HEARTBEAT_INTERVAL);
  }

  _log(msg) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    console.log(`\x1b[90m${time}\x1b[0m  ${msg}`);
  }

  stop() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    if (this.wss) this.wss.close();
    this.reader.destroy();
  }
}
