import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PRESETS } from '@planner/shared';
import { getProject, insertProject, listMaterials, openEmbedded } from './db';

test('embedded postgres stores a cabinet project', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'planner-'));
  const db = await openEmbedded(dir);
  try {
    const materials = await listMaterials(db);
    assert.ok(materials.some((item) => item.id === 'oak'));
    const created = await insertProject(db, {
      name: 'Тумба тест',
      customerName: 'Анна',
      customerEmail: 'anna@example.com',
      config: PRESETS.base,
    });
    const loaded = await getProject(db, created.id);
    assert.equal(loaded?.config.width, 600);
    assert.equal(loaded?.config.materialId, 'oak');
    assert.equal(loaded?.customerName, 'Анна');
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
