import { spawn } from 'node:child_process';
import { buildApp } from './app';
import { openDatabase } from './db';

const { db, mode } = await openDatabase();
const app = await buildApp(db, mode);
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });
app.log.info(`Планировщик слушает ${host}:${port}, база: ${mode}`);

if (process.env.OPEN_BROWSER === '1' && process.platform === 'win32') {
  const url = `http://127.0.0.1:${port}`;
  setTimeout(() => {
    spawn('rundll32', ['url.dll,FileProtocolHandler', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
  }, 400);
}

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await app.close();
  await db.close();
}

process.on('SIGINT', () => {
  void shutdown().then(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown().then(() => process.exit(0));
});
