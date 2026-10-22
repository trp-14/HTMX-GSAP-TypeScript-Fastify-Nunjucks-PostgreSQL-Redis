// Runs the client bundler in watch mode alongside the Fastify server (restarted by tsx on change).
import { spawn } from 'node:child_process';

// Invoke tsx's CLI through node directly: `npx` is `npx.cmd` on Windows and cannot be spawned without a shell.
const procs = [
  spawn(process.execPath, ['scripts/build-client.mjs', '--watch'], { stdio: 'inherit' }),
  spawn(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'watch', '--clear-screen=false', 'src/server.ts'],
    {
      stdio: 'inherit',
    },
  ),
];

const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
