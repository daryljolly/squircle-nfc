#!/usr/bin/env node

/**
 * squircle-nfc-bridge CLI entry point.
 * Starts the NFC reader and WebSocket server.
 *
 * Usage: npx squircle-nfc-bridge [--port 7891]
 */
import { NFCReader } from "./reader.js";
import { BridgeServer } from "./server.js";

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 7891;

console.log("");
console.log("  \x1b[38;5;173m┌─────────────────────────────────────┐\x1b[0m");
console.log("  \x1b[38;5;173m│\x1b[0m  \x1b[1mSquircle NFC Bridge\x1b[0m  v1.0.0        \x1b[38;5;173m│\x1b[0m");
console.log("  \x1b[38;5;173m│\x1b[0m  WebSocket → PC/SC → NFC Reader     \x1b[38;5;173m│\x1b[0m");
console.log("  \x1b[38;5;173m└─────────────────────────────────────┘\x1b[0m");
console.log("");

const reader = new NFCReader();
const server = new BridgeServer(reader, { port });

server.start();

console.log(`  \x1b[90mWaiting for NFC reader...\x1b[0m`);
console.log(`  \x1b[90mDashboard can connect at ws://localhost:${port}\x1b[0m`);
console.log("");

// Graceful shutdown
function shutdown() {
  console.log("\n  \x1b[90mShutting down...\x1b[0m");
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
