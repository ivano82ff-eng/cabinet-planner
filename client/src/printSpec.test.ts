import assert from 'node:assert/strict';
import test from 'node:test';
import { PRESETS } from '@planner/shared';
import { specMarkup } from './printSpec';

test('print sheet contains the drawing and the cut list', () => {
  const html = specMarkup({
    id: 'project-1',
    name: 'Пенал',
    customerName: 'Иван',
    customerEmail: 'ivan@example.com',
    createdAt: '2026-10-04T09:00:00.000Z',
    config: PRESETS.tall,
  });
  assert.match(html, /Пенал/);
  assert.match(html, /2100/);
  assert.match(html, /<svg/);
  assert.match(html, /Спецификация/);
  assert.match(html, /Фасад|Полка|Боковина/);
});
