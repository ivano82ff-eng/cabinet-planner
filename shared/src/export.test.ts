import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCabinet, PRESETS } from './cabinet';
import { buildDrawing, buildSheet } from './drawing';
import { renderDxf } from './dxf';
import { renderSvg } from './svg';

test('svg and dxf are two views of the same sheet', () => {
  const drawing = buildDrawing(buildCabinet(PRESETS.base));
  const front = drawing.views.find((view) => view.id === 'front');
  const sheet = buildSheet(drawing);
  const svg = renderSvg(sheet);
  const dxf = renderDxf(sheet);

  assert.ok(front?.ops.some((op) => op.kind === 'text' && op.text === '600'));
  assert.ok(front?.ops.some((op) => op.kind === 'text' && op.text === '720'));
  assert.match(svg, /<svg /);
  assert.match(svg, /Фасад/);
  assert.match(svg, />600</);
  assert.match(dxf, /AC1015/);
  assert.match(dxf, /\$INSUNITS\n70\n4/);
  assert.match(dxf, /\nLWPOLYLINE\n/);
  assert.match(dxf, /\\U\+0424/);
  assert.match(dxf, /\nEOF\n/);
});
