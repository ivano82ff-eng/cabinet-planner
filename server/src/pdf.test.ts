import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCabinet, PRESETS } from '@planner/shared';
import { renderSpecPdf, resolveFontPath } from './pdf';

test('specification pdf is a real document', async () => {
  if (!resolveFontPath()) return;
  const result = buildCabinet(PRESETS.base);
  const pdf = await renderSpecPdf({
    id: 'test-project',
    name: result.config.name,
    customerName: 'Иван Петров',
    customerEmail: 'ivan@example.com',
    createdAt: '2026-10-04T08:00:00.000Z',
    result,
  });
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.byteLength > 3000);
});
