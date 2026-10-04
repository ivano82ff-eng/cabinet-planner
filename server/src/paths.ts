import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function projectRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let step = 0; step < 6; step += 1) {
    if (existsSync(path.join(dir, 'client')) && existsSync(path.join(dir, 'server'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Не найдена папка проекта.');
}
