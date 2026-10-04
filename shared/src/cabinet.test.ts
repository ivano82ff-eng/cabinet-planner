import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCabinet, parseConfig, PRESETS } from './cabinet';
import type { CabinetType } from './types';

test('base carcass uses full-height sides and an inset top and bottom', () => {
  const result = buildCabinet(PRESETS.base);
  const left = result.parts.find((part) => part.name === 'Боковина левая');
  const bottom = result.parts.find((part) => part.bomCode === 'BOTTOM');
  const back = result.parts.find((part) => part.bomCode === 'BACK');
  const sides = result.bom.find((line) => line.code === 'SIDE');

  assert.deepEqual(left?.size, [16, 720, 560]);
  assert.equal(bottom?.cutLength, 600 - 32);
  assert.equal(bottom?.center[1], 108);
  assert.equal(back?.size[1], 720 - 100 - 32);
  assert.equal(sides?.qty, 2);
  assert.equal(result.parts.filter((part) => part.kind === 'shelf').length, 1);
  assert.equal(result.parts.filter((part) => part.kind === 'door').length, 1);
});

test('paired doors share the opening and keep the reveals', () => {
  const result = buildCabinet(PRESETS.tall);
  const doors = result.parts.filter((part) => part.kind === 'door');
  const width = doors.reduce((sum, part) => sum + part.size[0], 0);
  assert.equal(doors.length, 2);
  assert.equal(width, 600 - 9);
});

test('drawers sit under the door and shelves stay above them', () => {
  const result = buildCabinet({ ...PRESETS.base, doors: 1, drawers: 2, shelves: 1 });
  const door = result.parts.find((part) => part.kind === 'door');
  const shelf = result.parts.find((part) => part.kind === 'shelf');
  const drawerTop = Math.max(
    ...result.parts
      .filter((part) => part.kind === 'drawer-front')
      .map((part) => part.center[1] + part.size[1] / 2),
  );
  assert.ok(door);
  assert.ok(shelf);
  assert.ok(result.parts.some((part) => part.kind === 'drawer-side'));
  assert.ok((door?.center[1] ?? 0) - (door?.size[1] ?? 0) / 2 >= drawerTop - 0.2);
  assert.ok((shelf?.center[1] ?? 0) > drawerTop);
});

test('every preset stays inside the carcass and has a priced bill of materials', () => {
  const types = Object.keys(PRESETS) as CabinetType[];
  for (const type of types) {
    const result = buildCabinet(PRESETS[type]);
    assert.equal(result.warnings.length, 0, result.warnings.join('; '));
    assert.ok(result.totals.cost > 0);
    assert.ok(result.totals.partCount >= 5);
    for (const part of result.parts) {
      assert.ok(part.size.every((value) => Number.isFinite(value) && value > 0), part.name);
      assert.ok(part.center.every((value) => Number.isFinite(value)), part.name);
      const minX = part.center[0] - part.size[0] / 2;
      const maxX = part.center[0] + part.size[0] / 2;
      const minY = part.center[1] - part.size[1] / 2;
      const maxY = part.center[1] + part.size[1] / 2;
      const maxZ = part.center[2] + part.size[2] / 2;
      assert.ok(minX >= -1 && maxX <= result.config.width + 1, part.name);
      assert.ok(minY >= -1 && maxY <= result.config.height + 1, part.name);
      assert.ok(maxZ <= result.config.depth + 21, part.name);
    }
  }
});

test('out-of-range input is clamped and explained', () => {
  const result = buildCabinet({ ...PRESETS.base, width: 9000, shelves: 30 });
  assert.equal(result.config.width, 2400);
  assert.ok(result.config.shelves < 30);
  assert.ok(result.warnings.some((warning) => warning.includes('2400')));
});

test('parseConfig accepts numeric strings from a storefront', () => {
  const config = parseConfig({
    name: 'Кухня',
    type: 'wall',
    width: '900',
    height: '480',
    depth: '320',
    materialId: 'graphite',
    doors: '2',
  });
  assert.equal(config.width, 900);
  assert.equal(config.type, 'wall');
  assert.equal(config.materialId, 'graphite');
  assert.equal(config.doors, 2);
});
