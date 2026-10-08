// Runs the client bundler in watch mode alongside the Fastify server (restarted by tsx on change).
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['scripts/build-client.mjs', '--watch'], { stdio: 'inherit' }),
  spawn('npx', ['tsx', 'watch', '--clear-screen=false', 'src/server.ts'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
