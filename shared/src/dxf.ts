import type { Primitive, Sheet } from './types';

const LAYERS = [
  ['0', 7],
  ['outline', 7],
  ['panel', 7],
  ['hidden', 8],
  ['dim', 1],
  ['label', 7],
  ['cut', 3],
] as const;

export function renderDxf(sheet: Sheet): string {
  let handle = 0x20;
  const next = () => {
    handle += 1;
    return handle.toString(16).toUpperCase();
  };
  const entities = sheet.ops.map((op) => entity(op, next)).join('\n');
  return [
    section('HEADER', ['9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '4']),
    section('TABLES', layerTable(next)),
    section('ENTITIES', entities.split('\n')),
    '0',
    'EOF',
    '',
  ].join('\n');
}

function entity(op: Primitive, next: () => string): string {
  if (op.kind === 'line') {
    return pairs([
      [0, 'LINE'],
      [5, next()],
      [8, op.layer],
      [10, op.x1],
      [20, op.y1],
      [30, 0],
      [11, op.x2],
      [21, op.y2],
      [31, 0],
    ]);
  }
  if (op.kind === 'rect') {
    return pairs([
      [0, 'LWPOLYLINE'],
      [5, next()],
      [8, op.layer],
      [90, 4],
      [70, 1],
      [10, op.x],
      [20, op.y],
      [10, op.x + op.w],
      [20, op.y],
      [10, op.x + op.w],
      [20, op.y + op.h],
      [10, op.x],
      [20, op.y + op.h],
    ]);
  }
  const horizontal = op.anchor === 'middle' ? 1 : op.anchor === 'end' ? 2 : 0;
  const rows: Array<[number, string | number]> = [
    [0, 'TEXT'],
    [5, next()],
    [8, op.layer],
    [10, op.x],
    [20, op.y],
    [30, 0],
    [40, round(op.size * 0.72)],
    [1, encodeText(op.text)],
    [72, horizontal],
    [11, op.x],
    [21, op.y],
    [31, 0],
    [73, 2],
  ];
  return pairs(rows);
}

function layerTable(next: () => string): string[] {
  const rows = ['0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length)];
  for (const [name, color] of LAYERS) {
    rows.push(
      '0',
      'LAYER',
      '5',
      next(),
      '2',
      name,
      '70',
      '0',
      '62',
      String(color),
      '6',
      'CONTINUOUS',
    );
  }
  rows.push('0', 'ENDTAB');
  return rows;
}

function section(name: string, body: string[]): string {
  return ['0', 'SECTION', '2', name, ...body, '0', 'ENDSEC'].join('\n');
}

function pairs(entries: Array<[number, string | number]>): string {
  return entries
    .map(([code, value]) => `${code}\n${typeof value === 'number' ? round(value) : value}`)
    .join('\n');
}

function encodeText(value: string): string {
  let encoded = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '\\') encoded += '\\\\';
    else if (code < 32 || code > 126) encoded += `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    else encoded += char;
  }
  return encoded;
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
