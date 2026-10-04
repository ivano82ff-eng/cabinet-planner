import type { Primitive, Sheet } from './types';

const STYLES = `
  .l-outline { fill: none; stroke: #241c16; stroke-width: 2.4; }
  .l-panel { fill: #f7f1e6; stroke: #241c16; stroke-width: 1.8; }
  .l-hidden { fill: none; stroke: #8d8478; stroke-width: 1.6; stroke-dasharray: 10 7; }
  .l-dim { fill: none; stroke: #b85a32; stroke-width: 1.4; }
  .l-label { fill: #241c16; font-family: "Segoe UI", sans-serif; }
  .l-dimtext { fill: #8a3e22; font-family: Consolas, "Segoe UI", monospace; }
  .l-cut { fill: #fffdf8; stroke: #241c16; stroke-width: 1.6; }
  line, rect { vector-effect: non-scaling-stroke; }
`;

export function renderSvg(sheet: Sheet, inline = false): string {
  const body = sheet.ops.map((op) => draw(sheet.height, op)).join('');
  const declaration = inline ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n';
  return `${declaration}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(sheet.width)} ${num(sheet.height)}" role="img">
<style>${STYLES}</style>
<rect width="100%" height="100%" fill="#f6f1e7"/>
${body}
</svg>`;
}

function draw(height: number, op: Primitive): string {
  if (op.kind === 'line') {
    const dash = op.dash ? ' stroke-dasharray="10 7"' : '';
    return `<line x1="${num(op.x1)}" y1="${num(height - op.y1)}" x2="${num(op.x2)}" y2="${num(height - op.y2)}" class="l-${op.layer}"${dash}/>`;
  }
  if (op.kind === 'rect') {
    const y = height - (op.y + op.h);
    return `<rect x="${num(op.x)}" y="${num(y)}" width="${num(op.w)}" height="${num(op.h)}" class="l-${op.layer}"/>`;
  }
  const anchor = op.anchor === 'middle' ? 'middle' : op.anchor === 'end' ? 'end' : 'start';
  const cls = op.layer === 'dim' ? 'l-dimtext' : 'l-label';
  return `<text x="${num(op.x)}" y="${num(height - op.y)}" font-size="${num(op.size)}" text-anchor="${anchor}" dominant-baseline="middle" class="${cls}">${escapeXml(op.text)}</text>`;
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
